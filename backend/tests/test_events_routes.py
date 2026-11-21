"""Evento do filé (A06·4b, #178): o detalhe que a tela mostra.

As rotas rodam com uma sessão falsa. Os dados são fictícios; o código IBGE de
Maceió é só um número.
"""

from collections.abc import Sequence
from datetime import UTC, date, datetime, timedelta
from unittest.mock import AsyncMock

import pytest
from httpx2 import Response

from app.auth.utils import create_access_token
from app.main import app
from app.modules.actions.models import (
    Action,
    ActionAudience,
    ActionFormat,
    ActionTopic,
    ActionType,
    ActionVisibility,
)
from app.modules.catalog.models import (
    CuratedItem,
    CuratedItemAudience,
    CuratedType,
    ItemKind,
)
from app.modules.girl_file.models import FileEntry, FileStatus
from app.modules.girls.models import EffortBand, Girl, StudyStage, Topic
from app.users.models import User
from tests.helpers import chamar_rota, sessao_com
from tests.test_discover_routes import MACEIO, curado, menina, usuaria

HOJE = date(2026, 11, 19)
EVENTO = "curadoria-12"
ACAO = "acao-7"


@pytest.fixture(autouse=True)
def hoje_fixo(monkeypatch: pytest.MonkeyPatch) -> None:
    # As contas de dias usam hoje em Maceió; fixo, para o teste não variar.
    monkeypatch.setattr("app.modules.events.routes.today_in_maceio", lambda: HOJE)


def dia(dias: int) -> date:
    """Um dia contado a partir de HOJE: dia(15) é daqui a 15 dias."""
    return HOJE + timedelta(days=dias)


def hackathon(**campos: object) -> CuratedItem:
    """Um evento de fora, presencial em Maceió, com prazo daqui a 15 dias."""
    dados: dict[str, object] = {
        "kind": ItemKind.EVENT,
        "type": CuratedType.HACKATHON,
        "title": "Hackathon ficticio",
        "source": "Organizacao ficticia",
        "url": "https://exemplo.com/hackathon",
        "format": ActionFormat.IN_PERSON,
        "city_ibge_code": MACEIO,
        "starts_on": dia(24),
        "ends_on": dia(25),
        "registration_deadline": dia(15),
        "prerequisites": "Não precisa saber programar\n\nTer 14 anos",
        "audiences": [CuratedItemAudience(stage=StudyStage.MEDIO)],
    }
    dados.update(campos)
    return curado(12, EffortBand.GRANDE_DESAFIO, Topic.PROGRAMACAO, **dados)


def oficina(**campos: object) -> Action:
    """Uma ação de um grupo da NISE, presencial em Maceió, daqui a 6 dias."""
    dados: dict[str, object] = {
        "id": 7,
        "group_id": 1,
        "name": "Oficina ficticia de robotica",
        "type": ActionType.OFICINA,
        "starts_on": dia(6),
        "ends_on": dia(6),
        "format": ActionFormat.IN_PERSON,
        "city_ibge_code": MACEIO,
        "visibility": ActionVisibility.OPEN,
        "registration_url": "https://forms.exemplo.com/oficina",
        "registrations_open": True,
        "topics": [ActionTopic(topic=Topic.ROBOTICA)],
        "audiences": [
            ActionAudience(stage=StudyStage.MEDIO),
            ActionAudience(stage=StudyStage.FUNDAMENTAL),
        ],
    }
    dados.update(campos)
    return Action(**dados)


def linha(
    status: FileStatus = FileStatus.NEXT,
    curated_item_id: int | None = 12,
    action_id: int | None = None,
    girl_id: int = 3,
) -> FileEntry:
    return FileEntry(
        id=40,
        girl_id=girl_id,
        curated_item_id=curated_item_id,
        action_id=action_id,
        status=status,
    )


def linha_da_acao(status: FileStatus = FileStatus.NEXT) -> FileEntry:
    return linha(status, curated_item_id=None, action_id=7)


def sessao_do_evento(
    registro: Girl | None,
    achados: Sequence[object | None],
    usuario: User | None = None,
    aceite: int | None = 10,
) -> AsyncMock:
    """A sessão falsa das rotas de evento.

    session.scalar responde, em ordem: o aceite dos termos, o registro da
    menina e depois `achados`: a linha dela no filé, o item e, se for o caso, o
    nome do grupo da ação e o nome da cidade.
    """
    sessao_falsa = sessao_com(usuario or usuaria())
    sessao_falsa.scalar.side_effect = [aceite, registro, *achados]
    return sessao_falsa


def do_hackathon(
    status: FileStatus = FileStatus.NEXT, **campos: object
) -> list[object | None]:
    return [linha(status), hackathon(**campos), "Maceió"]


def da_oficina(
    status: FileStatus = FileStatus.NEXT, **campos: object
) -> list[object | None]:
    return [linha_da_acao(status), oficina(**campos), "Rendeiras ficticias", "Maceió"]


async def abrir(sessao_falsa: AsyncMock, item: str = EVENTO) -> Response:
    return await chamar_rota(
        app, "GET", f"/api/events/{item}", sessao_falsa, token=create_access_token(1)
    )


# --- GET /api/events/{id}: o detalhe ------------------------------------------


async def test_evento_de_fora_mostra_tudo_o_que_a_tela_pede() -> None:
    sessao_falsa = sessao_do_evento(menina(), do_hackathon())

    response = await abrir(sessao_falsa)

    assert response.status_code == 200
    assert response.json() == {
        "id": EVENTO,
        "status": "next",
        "type": "hackathon",
        "typeLabel": "Hackathon",
        "topic": "Programação",
        "band": "grande-desafio",
        "title": "Hackathon ficticio",
        # Evento de fora: sem grupo da NISE, com o organizador da curadoria.
        "group": None,
        "organizer": "Organizacao ficticia",
        "startsOn": "2026-12-13",
        "endsOn": "2026-12-14",
        "city": "Maceió",
        "deadline": "2026-12-04",
        "daysLeft": 15,
        "registrationsOpen": True,
        "daysUntilStart": 24,
        "afterEvent": False,
        "waitingAttendance": False,
        "cost": None,
        "stage": "Ensino médio",
        "prerequisites": ["Não precisa saber programar", "Ter 14 anos"],
        "registrationUrl": "https://exemplo.com/hackathon",
    }
    # Só ler não muda nada.
    sessao_falsa.commit.assert_not_called()


async def test_evento_de_grupo_da_nise_vem_com_o_grupo_e_sem_prazo() -> None:
    sessao_falsa = sessao_do_evento(menina(), da_oficina())

    response = await abrir(sessao_falsa, ACAO)

    assert response.status_code == 200
    dados = response.json()
    assert dados["id"] == ACAO
    assert dados["type"] == "oficina"
    assert dados["typeLabel"] == "Oficina"
    assert dados["topic"] == "Robótica"
    # Ação de um dia é "Rolê com a galera".
    assert dados["band"] == "role-com-a-galera"
    assert dados["group"] == "Rendeiras ficticias"
    assert dados["organizer"] == "Rendeiras ficticias"
    # A ação não tem prazo, só "inscrições abertas" ou não.
    assert dados["deadline"] is None
    assert dados["daysLeft"] is None
    assert dados["registrationsOpen"] is True
    assert dados["daysUntilStart"] == 6
    # A etapa mínima, a primeira na ordem das etapas.
    assert dados["stage"] == "Ensino fundamental"
    assert dados["prerequisites"] == []
    assert dados["registrationUrl"] == "https://forms.exemplo.com/oficina"


async def test_ultimo_dia_de_inscricao_conta_zero_dias_e_continua_aberto() -> None:
    sessao_falsa = sessao_do_evento(menina(), do_hackathon(registration_deadline=HOJE))

    response = await abrir(sessao_falsa)

    assert response.json()["daysLeft"] == 0
    assert response.json()["registrationsOpen"] is True


async def test_inscricoes_que_fecharam_depois_de_escolher_continuam_no_file() -> None:
    # Ela escolheu o evento; depois o prazo passou (RN-36).
    sessao_falsa = sessao_do_evento(
        menina(), do_hackathon(registration_deadline=dia(-3))
    )

    response = await abrir(sessao_falsa)

    assert response.status_code == 200
    assert response.json()["daysLeft"] == 0
    assert response.json()["registrationsOpen"] is False


@pytest.mark.parametrize(
    "campos",
    [{"active": False}, {"expires_on": dia(-1)}],
    ids=["desativado", "vencido"],
)
async def test_evento_retirado_pela_curadoria_aparece_fechado(
    campos: dict[str, object],
) -> None:
    sessao_falsa = sessao_do_evento(menina(), do_hackathon(FileStatus.NEXT, **campos))

    response = await abrir(sessao_falsa)

    assert response.status_code == 200
    assert response.json()["registrationsOpen"] is False


async def test_evento_sem_prazo_fecha_quando_comeca() -> None:
    sessao_falsa = sessao_do_evento(
        menina(),
        do_hackathon(registration_deadline=None, starts_on=HOJE, ends_on=dia(1)),
    )

    response = await abrir(sessao_falsa)

    assert response.json()["deadline"] is None
    assert response.json()["daysLeft"] is None
    assert response.json()["registrationsOpen"] is False


async def test_acao_que_a_coordenadora_fechou_aparece_fechada() -> None:
    sessao_falsa = sessao_do_evento(menina(), da_oficina(registrations_open=False))

    response = await abrir(sessao_falsa, ACAO)

    assert response.json()["registrationsOpen"] is False


async def test_acao_fechada_aparece_fechada_e_sem_link() -> None:
    # Ação fechada (só para convidadas) não tem link de inscrição.
    sessao_falsa = sessao_do_evento(
        menina(),
        da_oficina(visibility=ActionVisibility.CLOSED, registration_url=None),
    )

    response = await abrir(sessao_falsa, ACAO)

    assert response.json()["registrationsOpen"] is False
    assert response.json()["registrationUrl"] is None


async def test_acao_que_virou_fechada_nao_mostra_o_link_que_ficou() -> None:
    # A coordenadora fechou a ação depois; o link de quando era aberta ficou.
    sessao_falsa = sessao_do_evento(
        menina(), da_oficina(visibility=ActionVisibility.CLOSED)
    )

    response = await abrir(sessao_falsa, ACAO)

    assert response.json()["registrationsOpen"] is False
    assert response.json()["registrationUrl"] is None


async def test_evento_online_nao_tem_cidade_nem_consulta_cidade() -> None:
    # Sem cidade, a sessão nem busca o nome dela.
    achados = [linha(), hackathon(format=ActionFormat.ONLINE, city_ibge_code=None)]
    sessao_falsa = sessao_do_evento(menina(), achados)

    response = await abrir(sessao_falsa)

    assert response.json()["city"] is None


@pytest.mark.parametrize(
    ("centavos", "texto"), [(0, None), (2000, "R$ 20"), (2050, "R$ 20,50")]
)
async def test_custo_vem_escrito_para_a_tela(centavos: int, texto: str | None) -> None:
    sessao_falsa = sessao_do_evento(menina(), do_hackathon(cost_cents=centavos))

    response = await abrir(sessao_falsa)

    assert response.json()["cost"] == texto


async def test_tipo_da_curadoria_sem_selo_proprio_vira_evento() -> None:
    sessao_falsa = sessao_do_evento(menina(), do_hackathon(type=CuratedType.OLYMPIAD))

    response = await abrir(sessao_falsa)

    assert response.json()["type"] == "outro"
    assert response.json()["typeLabel"] == "Olimpíada"


async def test_no_dia_do_evento_faltam_zero_dias_e_ainda_nao_passou() -> None:
    sessao_falsa = sessao_do_evento(
        menina(), do_hackathon(starts_on=HOJE, ends_on=HOJE)
    )

    response = await abrir(sessao_falsa)

    assert response.json()["daysUntilStart"] == 0
    assert response.json()["afterEvent"] is False


async def test_depois_do_ultimo_dia_o_evento_ja_passou() -> None:
    sessao_falsa = sessao_do_evento(
        menina(),
        do_hackathon(
            starts_on=dia(-3), ends_on=dia(-1), registration_deadline=dia(-10)
        ),
    )

    response = await abrir(sessao_falsa)

    assert response.json()["afterEvent"] is True
    assert response.json()["daysUntilStart"] == 0


@pytest.mark.parametrize(
    ("status", "na_tela"),
    [
        (FileStatus.NEXT, "next"),
        (FileStatus.SIGNED_UP, "in_progress"),
        (FileStatus.CONCLUDED, "concluded"),
    ],
)
async def test_cada_status_vem_como_a_tela_chama(
    status: FileStatus, na_tela: str
) -> None:
    sessao_falsa = sessao_do_evento(menina(), do_hackathon(status))

    response = await abrir(sessao_falsa)

    assert response.json()["status"] == na_tela


@pytest.mark.parametrize("status", [FileStatus.LATER, FileStatus.DISMISSED])
async def test_ver_depois_e_nao_e_pra_mim_nao_estao_no_file(status: FileStatus) -> None:
    sessao_falsa = sessao_do_evento(menina(), [linha(status)])

    response = await abrir(sessao_falsa)

    assert response.status_code == 404
    assert response.json() == {"error": "item_not_found"}


async def test_evento_de_outra_menina_responde_404() -> None:
    # A busca usa o id dela: a linha de outra menina nunca é achada (RNF-G.03).
    sessao_falsa = sessao_do_evento(menina(), [None])

    response = await abrir(sessao_falsa)

    assert response.status_code == 404
    assert response.json() == {"error": "item_not_found"}


async def test_atividade_nao_abre_como_evento() -> None:
    # Uma atividade do filé abre a A06·4a, não a A06·4b.
    sessao_falsa = sessao_do_evento(
        menina(), [linha(), curado(12, EffortBand.UMA_TARDE)]
    )

    response = await abrir(sessao_falsa)

    assert response.status_code == 404
    assert response.json() == {"error": "item_not_found"}


@pytest.mark.parametrize("item", ["evento-12", "curadoria-012", "acao-x"])
async def test_id_que_nao_e_do_catalogo_responde_404(item: str) -> None:
    sessao_falsa = sessao_do_evento(menina(), [])

    response = await abrir(sessao_falsa, item)

    assert response.status_code == 404
    assert response.json() == {"error": "item_not_found"}


async def test_conta_sem_registro_de_menina_responde_404() -> None:
    sessao_falsa = sessao_do_evento(None, [])

    response = await abrir(sessao_falsa)

    assert response.status_code == 404
    assert response.json() == {"error": "profile_not_found"}


async def test_sem_aceite_dos_termos_responde_403() -> None:
    sessao_falsa = sessao_do_evento(menina(), [], aceite=None)

    response = await abrir(sessao_falsa)

    assert response.status_code == 403


# --- Evento de grupo da NISE depois da data (#194, #196) ----------------------


async def test_evento_de_grupo_passado_com_ela_inscrita_espera_a_presenca() -> None:
    achados = da_oficina(FileStatus.SIGNED_UP, starts_on=dia(-2), ends_on=dia(-2))
    sessao_falsa = sessao_do_evento(menina(), achados)

    response = await abrir(sessao_falsa, ACAO)

    assert response.json()["status"] == "in_progress"
    assert response.json()["afterEvent"] is True
    assert response.json()["waitingAttendance"] is True


async def test_no_dia_do_evento_de_grupo_ainda_nao_espera_a_presenca() -> None:
    achados = da_oficina(FileStatus.SIGNED_UP, starts_on=HOJE, ends_on=HOJE)
    sessao_falsa = sessao_do_evento(menina(), achados)

    response = await abrir(sessao_falsa, ACAO)

    assert response.json()["waitingAttendance"] is False


async def test_evento_de_grupo_passado_sem_inscricao_nao_espera_a_presenca() -> None:
    achados = da_oficina(FileStatus.NEXT, starts_on=dia(-2), ends_on=dia(-2))
    sessao_falsa = sessao_do_evento(menina(), achados)

    response = await abrir(sessao_falsa, ACAO)

    assert response.json()["waitingAttendance"] is False


async def test_evento_de_fora_passado_nao_espera_a_presenca() -> None:
    # O de fora pergunta "Você foi?" (#190).
    achados = do_hackathon(
        FileStatus.SIGNED_UP,
        starts_on=dia(-3),
        ends_on=dia(-1),
        registration_deadline=dia(-10),
    )
    sessao_falsa = sessao_do_evento(menina(), achados)

    response = await abrir(sessao_falsa)

    assert response.json()["waitingAttendance"] is False


async def test_depois_que_a_coordenadora_conclui_nao_espera_mais() -> None:
    achados = da_oficina(
        FileStatus.SIGNED_UP,
        starts_on=dia(-2),
        ends_on=dia(-2),
        attendance_registered_at=datetime(2026, 11, 18, 15, tzinfo=UTC),
    )
    sessao_falsa = sessao_do_evento(menina(), achados)

    response = await abrir(sessao_falsa, ACAO)

    assert response.json()["waitingAttendance"] is False
