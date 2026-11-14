from unittest.mock import AsyncMock, MagicMock

import pytest
from fastapi import FastAPI
from sqlalchemy.sql import Select

from app.main import app
from app.modules.cities.exceptions import InvalidCityError, invalid_city_handler
from app.modules.cities.models import City
from app.modules.cities.service import ensure_city_exists
from app.modules.cities.utils import normalize_search
from scripts.carregar_municipios import from_ibge, read, to_rows
from tests.helpers import chamar_rota

TAPERA = City(
    id=2708402,
    name="São José da Tapera",
    state="AL",
    search_name="sao jose da tapera, al",
)
MACEIO = City(id=2704302, name="Maceió", state="AL", search_name="maceio, al")


def sessao_para_lista(cidades: list[City]) -> AsyncMock:
    # (await session.scalars(select(...))).all() devolve os municípios achados.
    sessao_falsa = AsyncMock()
    sessao_falsa.scalars.return_value = MagicMock(all=MagicMock(return_value=cidades))
    return sessao_falsa


def sessao_que_acha(cidade: City | None) -> AsyncMock:
    # session.get(City, codigo) devolve o município, ou None fora da lista.
    sessao_falsa = AsyncMock()
    sessao_falsa.get.return_value = cidade
    return sessao_falsa


def consulta_da_busca(sessao_falsa: AsyncMock) -> tuple[str, list[object]]:
    # O SQL que a rota mandou ao banco e os valores que foram junto com ele.
    statement: Select[tuple[City]] = sessao_falsa.scalars.call_args.args[0]
    compiled = statement.compile()
    return str(compiled), list(compiled.params.values())


# --- Normalização (critério: ignora acento e maiúscula) ---------------------


@pytest.mark.parametrize(
    ("digitado", "esperado"),
    [
        ("São José da Tapera", "sao jose da tapera"),
        ("SAO JOSE", "sao jose"),
        ("  maceió,   AL ", "maceio, al"),
        ("Olho d'Água das Flores", "olho d'agua das flores"),
    ],
)
def test_normaliza_sem_acento_nem_maiuscula(digitado: str, esperado: str) -> None:
    assert normalize_search(digitado) == esperado


def test_sao_jose_esta_contido_em_sao_jose_da_tapera() -> None:
    assert normalize_search("sao jose") in normalize_search("São José da Tapera, AL")


# --- GET /api/cities ---------------------------------------------------------


async def test_busca_devolve_codigo_ibge_e_nome_com_uf() -> None:
    response = await chamar_rota(
        app, "GET", "/api/cities?search=sao%20jose", sessao_para_lista([TAPERA])
    )

    assert response.status_code == 200
    assert response.json() == [{"id": "2708402", "name": "São José da Tapera, AL"}]


async def test_busca_compara_o_texto_sem_acento_e_em_minusculas() -> None:
    sessao_falsa = sessao_para_lista([TAPERA])

    await chamar_rota(
        app, "GET", "/api/cities?search=S%C3%A3o%20JOS%C3%89", sessao_falsa
    )

    sql, valores = consulta_da_busca(sessao_falsa)
    assert "cities.search_name LIKE '%' ||" in sql
    assert "sao jose" in valores


async def test_busca_aceita_o_nome_escolhido_com_a_uf() -> None:
    # Ao escolher "Maceió, AL" na lista, o campo busca de novo com esse texto.
    sessao_falsa = sessao_para_lista([MACEIO])

    response = await chamar_rota(
        app, "GET", "/api/cities?search=Macei%C3%B3%2C%20AL", sessao_falsa
    )

    assert response.json() == [{"id": "2704302", "name": "Maceió, AL"}]
    _, valores = consulta_da_busca(sessao_falsa)
    assert "maceio, al" in valores


async def test_busca_trata_porcentagem_como_texto() -> None:
    sessao_falsa = sessao_para_lista([])

    await chamar_rota(app, "GET", "/api/cities?search=ma%25", sessao_falsa)

    # "/" é o caractere de escape: o "%" digitado não vira curinga.
    _, valores = consulta_da_busca(sessao_falsa)
    assert "ma/%" in valores


async def test_busca_poe_alagoas_primeiro_e_tem_limite() -> None:
    sessao_falsa = sessao_para_lista([])

    await chamar_rota(app, "GET", "/api/cities?search=sao%20jose", sessao_falsa)

    sql, valores = consulta_da_busca(sessao_falsa)
    assert "ORDER BY CASE WHEN (cities.state = " in sql
    assert "AL" in valores
    assert 10 in valores


@pytest.mark.parametrize("busca", ["", "m", "x" * 101])
async def test_busca_curta_ou_longa_demais_e_recusada(busca: str) -> None:
    sessao_falsa = sessao_para_lista([])

    response = await chamar_rota(
        app, "GET", f"/api/cities?search={busca}", sessao_falsa
    )

    assert response.status_code == 422
    sessao_falsa.scalars.assert_not_called()


async def test_busca_sem_parametro_e_recusada() -> None:
    response = await chamar_rota(app, "GET", "/api/cities", sessao_para_lista([]))

    assert response.status_code == 422


# --- Validação para o cadastro (critério: cidade fora da lista é recusada) ---


async def test_cidade_da_lista_e_aceita() -> None:
    assert await ensure_city_exists(sessao_que_acha(TAPERA), 2708402) is TAPERA


async def test_cidade_fora_da_lista_e_recusada() -> None:
    with pytest.raises(InvalidCityError):
        await ensure_city_exists(sessao_que_acha(None), 9999999)


async def test_cidade_fora_da_lista_vira_422_invalid_city() -> None:
    # As rotas de cadastro (#51, #52) ainda não existem: esta rota de mentira
    # faz o mesmo que elas vão fazer, para conferir a resposta que o front lê.
    cadastro = FastAPI()
    cadastro.add_exception_handler(InvalidCityError, invalid_city_handler)

    @cadastro.post("/cadastro")
    async def cadastrar(city_id: int) -> None:
        await ensure_city_exists(sessao_que_acha(None), city_id)

    response = await chamar_rota(
        cadastro, "POST", "/cadastro?city_id=9999999", sessao_que_acha(None)
    )

    assert response.status_code == 422
    assert response.json() == {"error": "invalid_city"}


def test_app_registra_o_tratamento_de_cidade_invalida() -> None:
    assert app.exception_handlers[InvalidCityError] is invalid_city_handler


# --- Script de carga ---------------------------------------------------------


def test_script_converte_a_resposta_do_ibge() -> None:
    resposta_do_ibge = [
        {
            "municipio-id": 2708402,
            "municipio-nome": "São José da Tapera",
            "UF-sigla": "AL",
        },
        {"municipio-id": 2704302, "municipio-nome": "Maceió", "UF-sigla": "AL"},
    ]

    linhas = to_rows(from_ibge(resposta_do_ibge))

    assert linhas == [
        {"id": 2704302, "name": "Maceió", "state": "AL", "search_name": "maceio, al"},
        {
            "id": 2708402,
            "name": "São José da Tapera",
            "state": "AL",
            "search_name": "sao jose da tapera, al",
        },
    ]


def test_copia_do_repositorio_tem_todos_os_municipios() -> None:
    municipios = read()
    codigos = [municipio["id"] for municipio in municipios]

    assert len(municipios) > 5500
    assert len(set(codigos)) == len(codigos)
    assert sum(municipio["uf"] == "AL" for municipio in municipios) == 102
    assert {"id": 2708402, "nome": "São José da Tapera", "uf": "AL"} in municipios
