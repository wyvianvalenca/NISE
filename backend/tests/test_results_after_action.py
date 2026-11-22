"""Resultados · "Logo depois da ação" (C5, #367): quem voltou a outra ação e
quem começou o filé.

Rodam no Postgres de teste (`db_session`), porque a regra vem do banco: quem é
participante, quem não compareceu, quem voltou e o que ela guardou no filé.
Dados fictícios. Cada teste diz o critério de aceite da #367 que cobre.
"""

from datetime import UTC, date, datetime, time, timedelta

from httpx2 import Response
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth.utils import create_access_token
from app.main import app
from app.modules.actions.models import (
    Action,
    ActionFormat,
    ActionTopic,
    ActionType,
    ActionVisibility,
    Participation,
)
from app.modules.actions.service import ACTION_TIMEZONE, today_in_maceio
from app.modules.girl_file.models import FileEntry, FileStatus
from app.modules.girls.models import Girl, Topic
from app.modules.groups.models import Group, GroupCoordinator
from app.modules.results.service import Period, add_months, period_start
from app.users.models import Role, User
from tests.helpers import chamar_rota

URL = "/api/coordinator/results/after-action"
HOJE = today_in_maceio()
SALVA = datetime(2026, 1, 1, tzinfo=UTC)


def dias_atras(dias: int) -> date:
    return HOJE - timedelta(days=dias)


def as_(hora: int, dia: date, minuto: int = 0) -> datetime:
    """Um horário de Maceió nesse dia."""
    return datetime.combine(dia, time(hora, minuto), tzinfo=ACTION_TIMEZONE)


class Cenario:
    """Monta grupos, ações e meninas fictícias numa sessão de teste."""

    def __init__(self, sessao: AsyncSession) -> None:
        self.sessao = sessao
        self.contador = 0

    def _proximo(self) -> int:
        self.contador += 1
        return self.contador

    async def grupo(self, nome: str) -> Group:
        grupo = Group(name=nome)
        self.sessao.add(grupo)
        await self.sessao.flush()
        return grupo

    async def coordenadora(
        self, grupo: Group | None, role: Role = Role.COORDINATOR
    ) -> User:
        n = self._proximo()
        usuaria = User(
            email=f"coord{n}@exemplo.com", name=f"Coord Ficticia {n}", role=role
        )
        self.sessao.add(usuaria)
        await self.sessao.flush()
        if grupo is not None:
            self.sessao.add(GroupCoordinator(group_id=grupo.id, user_id=usuaria.id))
            await self.sessao.flush()
        return usuaria

    async def acao(
        self,
        grupo: Group,
        inicio: date,
        tipo: ActionType = ActionType.OFICINA,
        tags: tuple[Topic, ...] = (),
        presenca_salva: bool = True,
    ) -> Action:
        acao = Action(
            group_id=grupo.id,
            name=f"Ação fictícia {self._proximo()}",
            type=tipo,
            starts_on=inicio,
            ends_on=inicio,
            format=ActionFormat.ONLINE,
            visibility=ActionVisibility.CLOSED,
            attendance_registered_at=SALVA if presenca_salva else None,
            topics=[ActionTopic(topic=tag) for tag in tags],
        )
        self.sessao.add(acao)
        await self.sessao.flush()
        return acao

    async def menina(self) -> Girl:
        n = self._proximo()
        menina = Girl(email=f"menina{n}@exemplo.com", name=f"Menina Ficticia {n}")
        self.sessao.add(menina)
        await self.sessao.flush()
        return menina

    async def inscrita(self, menina: Girl, acao: Action, veio: bool) -> None:
        self.sessao.add(
            Participation(
                girl_id=menina.id,
                action_id=acao.id,
                attended_at=SALVA if veio else None,
            )
        )
        await self.sessao.flush()

    async def no_file(
        self,
        menina: Girl,
        grupo: Group,
        guardado_em: datetime,
        status: FileStatus = FileStatus.NEXT,
        concluido_em: date | None = None,
    ) -> None:
        """Um item no filé dela. O item é um evento fora dos números do card."""
        item = await self.acao(grupo, dias_atras(1000), presenca_salva=False)
        self.sessao.add(
            FileEntry(
                girl_id=menina.id,
                action_id=item.id,
                status=status,
                concluded_on=concluido_em,
                created_at=guardado_em,
            )
        )
        await self.sessao.flush()


async def pedir(
    sessao: AsyncSession, usuaria: User | None, filtros: str = ""
) -> Response:
    token = create_access_token(usuaria.id) if usuaria else None
    return await chamar_rota(app, "GET", f"{URL}{filtros}", sessao, token)


def numeros(response: Response) -> dict[str, object]:
    assert response.status_code == 200, response.text
    corpo: dict[str, object] = response.json()
    return corpo


# --- Quem entra (RNF-F5.01, RNF-G.03) -----------------------------------------


async def test_sem_login_responde_401(db_session: AsyncSession) -> None:
    response = await pedir(db_session, None)

    assert response.status_code == 401


async def test_menina_recebe_403(db_session: AsyncSession) -> None:
    cenario = Cenario(db_session)
    menina = await cenario.coordenadora(None, Role.GIRL)

    response = await pedir(db_session, menina)

    assert response.status_code == 403


async def test_coordenadora_de_outro_grupo_nao_ve_os_numeros(
    db_session: AsyncSession,
) -> None:
    # Critério: só números de meninas das ações do próprio grupo. Pedir a ação
    # de outro grupo pelo filtro também não traz nada.
    cenario = Cenario(db_session)
    rendeiras = await cenario.grupo("Rendeiras do Código")
    outro = await cenario.grupo("Outro Grupo Fictício")
    acao = await cenario.acao(rendeiras, dias_atras(30))
    for veio in (True, True, False):
        await cenario.inscrita(await cenario.menina(), acao, veio)
    coordenadora_do_outro = await cenario.coordenadora(outro)

    for filtros in ("", f"?action_id={acao.id}"):
        corpo = numeros(await pedir(db_session, coordenadora_do_outro, filtros))

        assert corpo["participants"] == 0
        assert corpo["noShows"] == 0


# --- Quem conta (critério "Participants" e "Não compareceram") ----------------


async def test_participantes_e_quem_nao_compareceu(db_session: AsyncSession) -> None:
    cenario = Cenario(db_session)
    grupo = await cenario.grupo("Rendeiras do Código")
    katia = await cenario.coordenadora(grupo)
    acao = await cenario.acao(grupo, dias_atras(30))
    sem_presenca = await cenario.acao(grupo, dias_atras(20), presenca_salva=False)
    for veio in (True, True, True, False, False):
        await cenario.inscrita(await cenario.menina(), acao, veio)
    # Ação sem presença salva não conta, nem para "não compareceram".
    await cenario.inscrita(await cenario.menina(), sem_presenca, False)

    corpo = numeros(await pedir(db_session, katia))

    assert corpo["participants"] == 3
    assert corpo["noShows"] == 2


async def test_quem_veio_a_uma_e_faltou_a_outra_conta_so_como_participante(
    db_session: AsyncSession,
) -> None:
    # Cada menina conta uma vez: se ela veio a alguma ação do filtro, participou.
    cenario = Cenario(db_session)
    grupo = await cenario.grupo("Rendeiras do Código")
    katia = await cenario.coordenadora(grupo)
    primeira = await cenario.acao(grupo, dias_atras(60))
    segunda = await cenario.acao(grupo, dias_atras(30))
    ana = await cenario.menina()
    await cenario.inscrita(ana, primeira, False)
    await cenario.inscrita(ana, segunda, True)

    corpo = numeros(await pedir(db_session, katia))

    assert corpo["participants"] == 1
    assert corpo["noShows"] == 0


# --- "Voltaram a outra ação" (RF-F5.09, D-92) ---------------------------------


async def test_voltou_a_acao_de_qualquer_grupo_e_conta_uma_vez(
    db_session: AsyncSession,
) -> None:
    cenario = Cenario(db_session)
    grupo = await cenario.grupo("Rendeiras do Código")
    outro = await cenario.grupo("Outro Grupo Fictício")
    katia = await cenario.coordenadora(grupo)
    acao = await cenario.acao(grupo, dias_atras(90))
    do_outro_grupo = await cenario.acao(outro, dias_atras(60))
    mais_uma = await cenario.acao(outro, dias_atras(30))

    ana = await cenario.menina()  # veio e foi a duas outras: conta uma vez
    await cenario.inscrita(ana, acao, True)
    await cenario.inscrita(ana, do_outro_grupo, True)
    await cenario.inscrita(ana, mais_uma, True)
    bia = await cenario.menina()  # veio e se inscreveu em outra, mas faltou
    await cenario.inscrita(bia, acao, True)
    await cenario.inscrita(bia, do_outro_grupo, False)
    carol = await cenario.menina()  # não compareceu, mas foi a outra depois
    await cenario.inscrita(carol, acao, False)
    await cenario.inscrita(carol, mais_uma, True)
    await cenario.inscrita(await cenario.menina(), acao, False)

    corpo = numeros(await pedir(db_session, katia))

    assert corpo["participants"] == 2
    assert corpo["noShows"] == 2
    assert corpo["returned"] == {"participants": 1, "noShows": 1}


async def test_outra_acao_do_proprio_grupo_no_filtro_tambem_conta(
    db_session: AsyncSession,
) -> None:
    cenario = Cenario(db_session)
    grupo = await cenario.grupo("Rendeiras do Código")
    katia = await cenario.coordenadora(grupo)
    primeira = await cenario.acao(grupo, dias_atras(60))
    segunda = await cenario.acao(grupo, dias_atras(30))
    ana = await cenario.menina()
    await cenario.inscrita(ana, primeira, True)
    await cenario.inscrita(ana, segunda, True)

    corpo = numeros(await pedir(db_session, katia))

    assert corpo["returned"] == {"participants": 1, "noShows": 0}


async def test_acao_antes_da_dela_ou_fora_do_periodo_nao_conta(
    db_session: AsyncSession,
) -> None:
    # "Outra ação" é depois da primeira dela no filtro e dentro do período.
    cenario = Cenario(db_session)
    grupo = await cenario.grupo("Rendeiras do Código")
    outro = await cenario.grupo("Outro Grupo Fictício")
    katia = await cenario.coordenadora(grupo)
    acao = await cenario.acao(grupo, dias_atras(60))
    antes = await cenario.acao(outro, dias_atras(90))
    fora_do_periodo = await cenario.acao(outro, dias_atras(500))
    ana = await cenario.menina()
    await cenario.inscrita(ana, acao, True)
    await cenario.inscrita(ana, antes, True)
    await cenario.inscrita(ana, fora_do_periodo, True)

    corpo = numeros(await pedir(db_session, katia))

    assert corpo["participants"] == 1
    assert corpo["returned"] == {"participants": 0, "noShows": 0}


async def test_sem_ninguem_responde_zero_e_nao_erro(db_session: AsyncSession) -> None:
    cenario = Cenario(db_session)
    katia = await cenario.coordenadora(await cenario.grupo("Rendeiras do Código"))

    corpo = numeros(await pedir(db_session, katia))

    zero = {"participants": 0, "noShows": 0}
    assert corpo == {
        "participants": 0,
        "noShows": 0,
        "returned": zero,
        "startedFile": zero,
        "concludedFile": zero,
    }


# --- "Começaram o filé" e "Concluíram algo do filé" (RF-F5.31, D-93) -------


async def test_comecou_e_concluiu_o_file_depois_da_acao(
    db_session: AsyncSession,
) -> None:
    cenario = Cenario(db_session)
    grupo = await cenario.grupo("Rendeiras do Código")
    katia = await cenario.coordenadora(grupo)
    dia = dias_atras(60)
    acao = await cenario.acao(grupo, dia)

    ana = await cenario.menina()  # guardou um item no dia da ação
    await cenario.inscrita(ana, acao, True)
    await cenario.no_file(ana, grupo, as_(15, dia))
    bia = await cenario.menina()  # guardou antes, concluiu depois
    await cenario.inscrita(bia, acao, True)
    await cenario.no_file(
        bia,
        grupo,
        as_(10, dia - timedelta(days=30)),
        FileStatus.CONCLUDED,
        concluido_em=dia + timedelta(days=20),
    )
    carol = await cenario.menina()  # só tem item de antes da ação
    await cenario.inscrita(carol, acao, True)
    await cenario.no_file(carol, grupo, as_(10, dia - timedelta(days=1)))
    dani = await cenario.menina()  # não compareceu, mas guardou e concluiu
    await cenario.inscrita(dani, acao, False)
    await cenario.no_file(
        dani,
        grupo,
        as_(10, dia + timedelta(days=5)),
        FileStatus.CONCLUDED,
        concluido_em=dia + timedelta(days=10),
    )
    await cenario.inscrita(await cenario.menina(), acao, False)

    corpo = numeros(await pedir(db_session, katia))

    assert (corpo["participants"], corpo["noShows"]) == (3, 2)
    assert corpo["startedFile"] == {"participants": 1, "noShows": 1}
    assert corpo["concludedFile"] == {"participants": 1, "noShows": 1}


async def test_file_conta_ate_o_questionario_de_3_meses(
    db_session: AsyncSession,
) -> None:
    # A janela vai do dia em que a ação começou até o dia anterior ao
    # questionário de 3 meses.
    cenario = Cenario(db_session)
    grupo = await cenario.grupo("Rendeiras do Código")
    katia = await cenario.coordenadora(grupo)
    dia = dias_atras(200)
    questionario = add_months(dia, 3)
    acao = await cenario.acao(grupo, dia)

    ana = await cenario.menina()  # no último dia da janela: conta
    await cenario.inscrita(ana, acao, True)
    await cenario.no_file(
        ana,
        grupo,
        as_(23, questionario - timedelta(days=1)),
        FileStatus.CONCLUDED,
        concluido_em=questionario - timedelta(days=1),
    )
    bia = await cenario.menina()  # no dia do questionário: não conta mais
    await cenario.inscrita(bia, acao, True)
    await cenario.no_file(
        bia,
        grupo,
        as_(0, questionario),
        FileStatus.CONCLUDED,
        concluido_em=questionario,
    )

    corpo = numeros(await pedir(db_session, katia))

    assert corpo["startedFile"] == {"participants": 1, "noShows": 0}
    assert corpo["concludedFile"] == {"participants": 1, "noShows": 0}


async def test_dia_do_item_e_o_de_maceio(db_session: AsyncSession) -> None:
    # 23h30 em Maceió, na véspera da ação, já é o dia da ação em UTC.
    cenario = Cenario(db_session)
    grupo = await cenario.grupo("Rendeiras do Código")
    katia = await cenario.coordenadora(grupo)
    dia = dias_atras(60)
    acao = await cenario.acao(grupo, dia)
    ana = await cenario.menina()
    await cenario.inscrita(ana, acao, True)
    await cenario.no_file(ana, grupo, as_(23, dia - timedelta(days=1), minuto=30))

    corpo = numeros(await pedir(db_session, katia))

    assert corpo["startedFile"] == {"participants": 0, "noShows": 0}


async def test_ver_depois_e_nao_e_pra_mim_nao_estao_no_file(
    db_session: AsyncSession,
) -> None:
    # Começar o filé é guardar um item nele; o "Ver depois" e o "Não é pra
    # mim" ficam de fora, como na pílula "Meu filé". A inscrição num evento,
    # que o sistema guarda sozinho, conta.
    cenario = Cenario(db_session)
    grupo = await cenario.grupo("Rendeiras do Código")
    katia = await cenario.coordenadora(grupo)
    dia = dias_atras(60)
    acao = await cenario.acao(grupo, dia)
    depois = as_(10, dia + timedelta(days=3))
    for status in (FileStatus.LATER, FileStatus.DISMISSED, FileStatus.SIGNED_UP):
        menina = await cenario.menina()
        await cenario.inscrita(menina, acao, True)
        await cenario.no_file(menina, grupo, depois, status)

    corpo = numeros(await pedir(db_session, katia))

    assert corpo["startedFile"] == {"participants": 1, "noShows": 0}


# --- Filtros (RF-F5.06, D-94) --------------------------------------------------


async def test_periodo_comeca_em_12_meses_e_muda_os_numeros(
    db_session: AsyncSession,
) -> None:
    cenario = Cenario(db_session)
    grupo = await cenario.grupo("Rendeiras do Código")
    katia = await cenario.coordenadora(grupo)
    recente = await cenario.acao(grupo, dias_atras(30))
    oito_meses = await cenario.acao(grupo, dias_atras(240))
    dois_anos = await cenario.acao(grupo, dias_atras(730))
    for acao in (recente, oito_meses, dois_anos):
        await cenario.inscrita(await cenario.menina(), acao, True)

    padrao = numeros(await pedir(db_session, katia))
    seis = numeros(await pedir(db_session, katia, "?period=6m"))
    tudo = numeros(await pedir(db_session, katia, "?period=all"))

    assert padrao["participants"] == 2
    assert seis["participants"] == 1
    assert tudo["participants"] == 3


async def test_filtros_de_acao_tipo_e_tag(db_session: AsyncSession) -> None:
    cenario = Cenario(db_session)
    grupo = await cenario.grupo("Rendeiras do Código")
    katia = await cenario.coordenadora(grupo)
    oficina = await cenario.acao(grupo, dias_atras(30), ActionType.OFICINA, (Topic.IA,))
    palestra = await cenario.acao(
        grupo, dias_atras(40), ActionType.PALESTRA, (Topic.ROBOTICA, Topic.DADOS)
    )
    await cenario.inscrita(await cenario.menina(), oficina, True)
    for veio in (True, False):
        await cenario.inscrita(await cenario.menina(), palestra, veio)

    por_acao = numeros(await pedir(db_session, katia, f"?action_id={oficina.id}"))
    por_tipo = numeros(await pedir(db_session, katia, "?type=palestra"))
    por_tag = numeros(await pedir(db_session, katia, "?topic=dados"))
    juntos = numeros(await pedir(db_session, katia, "?type=oficina&topic=dados"))

    assert (por_acao["participants"], por_acao["noShows"]) == (1, 0)
    assert (por_tipo["participants"], por_tipo["noShows"]) == (1, 1)
    assert (por_tag["participants"], por_tag["noShows"]) == (1, 1)
    assert (juntos["participants"], juntos["noShows"]) == (0, 0)


async def test_filtro_invalido_responde_422(db_session: AsyncSession) -> None:
    cenario = Cenario(db_session)
    katia = await cenario.coordenadora(await cenario.grupo("Rendeiras do Código"))

    for filtros in ("?period=3m", "?type=show", "?topic=culinaria"):
        response = await pedir(db_session, katia, filtros)

        assert response.status_code == 422


# --- Só totais (RF-F5.08, RN-01) -----------------------------------------------


async def test_responde_so_totais(db_session: AsyncSession) -> None:
    # Critério: nenhum nome, nada que identifique a menina, nem raça/cor ou renda.
    cenario = Cenario(db_session)
    grupo = await cenario.grupo("Rendeiras do Código")
    katia = await cenario.coordenadora(grupo)
    acao = await cenario.acao(grupo, dias_atras(30))
    ana = await cenario.menina()
    await cenario.inscrita(ana, acao, True)

    response = await pedir(db_session, katia)

    assert set(response.json()) == {
        "participants",
        "noShows",
        "returned",
        "startedFile",
        "concludedFile",
    }
    assert ana.name not in response.text
    assert ana.email not in response.text


def test_ultimos_meses_contam_para_tras_a_partir_de_hoje() -> None:
    # "Últimos 6 meses" em 31/08 começa no último dia de fevereiro.
    assert period_start(Period.LAST_6_MONTHS, date(2026, 8, 31)) == date(2026, 2, 28)
    assert period_start(Period.LAST_12_MONTHS, date(2026, 11, 22)) == date(2025, 11, 22)
    assert period_start(Period.LAST_6_MONTHS, date(2026, 3, 15)) == date(2025, 9, 15)
    assert period_start(Period.ALL, date(2026, 11, 22)) is None


def test_janela_do_file_vai_ate_3_meses_depois() -> None:
    assert add_months(date(2026, 11, 30), 3) == date(2027, 2, 28)
    assert add_months(date(2026, 3, 10), 3) == date(2026, 6, 10)
