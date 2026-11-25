"""CV00 O e-mail do convite da coordenadora (#453, RF-S2.31, card de design #438).

Testes sem banco: o envio é trocado por um falso, nenhum e-mail sai. Dados
fictícios.
"""

from datetime import UTC, datetime
from html.parser import HTMLParser

import pytest

from app.modules.groups import coordinator_email
from app.modules.groups.coordinator_email import (
    build_invite_email,
    format_date,
    invite_url,
    send_coordinator_invite_email,
)

TOKEN = "token-ficticio-123"
# 1h de 1º de dez em UTC ainda é 30 de nov em Maceió (UTC-3).
VENCE = datetime(2026, 12, 1, 1, 0, tzinfo=UTC)


class Links(HTMLParser):
    """Junta o texto de cada link com o seu href."""

    def __init__(self) -> None:
        super().__init__()
        self.links: dict[str, str] = {}
        self._href: str | None = None
        self._texto = ""

    def handle_starttag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        if tag == "a":
            self._href = dict(attrs).get("href") or ""
            self._texto = ""

    def handle_data(self, data: str) -> None:
        if self._href is not None:
            self._texto += data

    def handle_endtag(self, tag: str) -> None:
        if tag == "a" and self._href is not None:
            self.links[self._texto.strip()] = self._href
            self._href = None


def links(pagina: str) -> dict[str, str]:
    parser = Links()
    parser.feed(pagina)
    return parser.links


# Critério (CV00): o HTML leva "Oi, <primeiro nome>!", o grupo em negrito, o
# botão "Criar minha conta" com o link do convite, a validade ("30 de nov") e
# o aviso para ignorar; "Que bom ter você com a gente!" saiu (#438).
def test_html_do_convite() -> None:
    _, pagina = build_invite_email(
        "Kátia Maria Ficticia", "Rendeiras do Código", TOKEN, VENCE
    )

    assert links(pagina) == {"Criar minha conta": invite_url(TOKEN)}
    assert "Oi, Kátia!" in pagina
    assert "o grupo <strong>Rendeiras do Código</strong> na NISE." in pagina
    assert "O link vale até 30 de nov e funciona uma vez só." in pagina
    assert "Se não esperava este convite, é só ignorar." in pagina
    assert "Que bom ter você" not in pagina
    assert "<img" not in pagina


# Critério: o texto puro (para quem não lê HTML) tem os mesmos textos, com o
# link escrito.
def test_texto_puro_do_convite() -> None:
    texto, _ = build_invite_email(
        "Kátia Maria Ficticia", "Rendeiras do Código", TOKEN, VENCE
    )

    assert texto.startswith("Oi, Kátia!")
    assert (
        "A equipe NISE te convidou pra coordenar o grupo Rendeiras do Código na NISE."
        in texto
    )
    assert f"Criar minha conta: {invite_url(TOKEN)}" in texto
    assert (
        "O link vale até 30 de nov e funciona uma vez só. "
        "Se não esperava este convite, é só ignorar."
    ) in texto
    assert "Que bom ter você" not in texto


# Critério: nome e grupo vêm de quem convidou; no HTML vão escapados.
def test_nome_e_grupo_sao_escapados_no_html() -> None:
    texto, pagina = build_invite_email(
        "<b>Kátia</b> Ficticia", "Grupo <script>x</script> & cia", TOKEN, VENCE
    )

    assert "<b>Kátia</b>" not in pagina
    assert "<script>" not in pagina
    assert "Oi, &lt;b&gt;Kátia&lt;/b&gt;!" in pagina
    assert "<strong>Grupo &lt;script&gt;x&lt;/script&gt; &amp; cia</strong>" in pagina
    # O texto puro não é HTML: vai como veio.
    assert "Grupo <script>x</script> & cia" in texto


@pytest.mark.parametrize(
    ("momento", "esperado"),
    [
        (VENCE, "30 de nov"),
        (datetime(2026, 9, 12, 15, 0, tzinfo=UTC), "12 de set"),
        (datetime(2027, 1, 1, 12, 0, tzinfo=UTC), "1 de jan"),
        (datetime(2027, 2, 5, 12, 0, tzinfo=UTC), "5 de fev"),
    ],
)
def test_data_com_dia_e_mes_abreviado_em_maceio(
    momento: datetime, esperado: str
) -> None:
    assert format_date(momento) == esperado


# Critério: o envio leva as duas partes, com o assunto de sempre.
def test_envio_leva_texto_e_html(monkeypatch: pytest.MonkeyPatch) -> None:
    enviados: list[tuple[str, str, str, str | None]] = []

    def falso(to: str, subject: str, body: str, *, html: str | None = None) -> None:
        enviados.append((to, subject, body, html))

    monkeypatch.setattr(coordinator_email, "send_email", falso)

    assert send_coordinator_invite_email(
        "katia@exemplo.org", "Kátia Ficticia", "Rendeiras do Código", TOKEN, VENCE
    )

    ((para, assunto, texto, pagina),) = enviados
    assert para == "katia@exemplo.org"
    assert assunto == "Seu convite para coordenar Rendeiras do Código na NISE"
    assert invite_url(TOKEN) in texto
    assert pagina is not None
    assert links(pagina)["Criar minha conta"] == invite_url(TOKEN)
