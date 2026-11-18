# Ferramentas do repositório

Este documento explica as ferramentas de desenvolvimento da NISE: o que cada uma faz, onde é configurada, quando roda e por que foi escolhida. As regras de uso ficam no [CONTRIBUTING.md](../CONTRIBUTING.md); aqui fica o porquê.

A base foi o [full-stack-fastapi-template](https://github.com/fastapi/full-stack-fastapi-template), o modelo oficial de projeto do FastAPI. Adotamos o que resolve problemas que a NISE tem e deixamos de fora o que não se aplica (por exemplo, o proxy Traefik e o build de produção em Docker, já que quem publica é a Vercel).

## Visão geral

| O quê | Ferramenta | Configuração | Quando roda |
| --- | --- | --- | --- |
| Dependências do back | uv (workspace) | `pyproject.toml` da raiz e `backend/pyproject.toml`, `uv.lock` | `uv sync` |
| Hooks do Git | prek | `.pre-commit-config.yaml` | A cada commit e push |
| Formatação e lint do back | ruff | `backend/pyproject.toml` | Hook e CI |
| Tipos do back | mypy (estrito) | `backend/pyproject.toml` | Hook e CI |
| Formatação do front | Prettier | `frontend/.prettierrc.json` | Hook e CI |
| Lint do front | ESLint (config do Next) | `frontend/eslint.config.mjs` | Hook e CI |
| Tipos do front | `pnpm typecheck` | `frontend/tsconfig.json` | Hook e CI |
| Testes do back | pytest, com Postgres de verdade | `backend/tests/conftest.py` | `git push` e CI |
| Migrações em dia | Alembic (dentro do pytest) | `backend/tests/conftest.py` | `git push` e CI |
| Cobertura do back | coverage | `backend/pyproject.toml` | CI (relatório, sem meta) |
| Contrato front/back | `@hey-api/openapi-ts` | `frontend/openapi-ts.config.ts`, `scripts/generate-client.sh` | Hook (quando o back muda) e CI |
| Segredos no commit | gitleaks | `.pre-commit-config.yaml` | Hook |
| Segurança dos workflows | zizmor | `.pre-commit-config.yaml` | Hook e CI |
| CI | GitHub Actions | `.github/workflows/ci.yml` | Todo PR e push em `develop`/`main` |

## 1. Workspace do uv

A raiz do repositório tem um `pyproject.toml` que não é um pacote. Ele só declara um **workspace** do uv com um membro, o `backend/`, e as ferramentas do repositório inteiro (prek e zizmor) no grupo `dev`.

Consequências:

- Há **um** `uv.lock` e **uma** `.venv`, ambos na raiz. O `.python-version` também fica na raiz.
- `uv sync` na raiz instala tudo: as dependências do back, as de desenvolvimento dele (pytest, ruff, mypy) e as ferramentas do repositório.
- `cd backend && uv run pytest` continua funcionando: o uv sobe as pastas até achar o workspace e usa a `.venv` da raiz.
- O build do back no Docker usa a **raiz** como contexto, porque precisa do `uv.lock`. Por isso o ignore do build é o `backend/Dockerfile.dockerignore` (o Docker procura `<Dockerfile>.dockerignore` ao lado do Dockerfile), escrito como lista do que entra.
- Quando o deploy na Vercel for configurado, ele precisa usar o `uv.lock` da raiz.

**Por quê:** a versão das ferramentas fica travada no `uv.lock`, igual para todo mundo e para o CI. Antes, cada pessoa instalava o pre-commit com `uv tool install`, em versões diferentes.

Se você tinha uma `backend/.venv` antiga, pode apagá-la: ela não é mais usada.

## 2. Hooks do Git com o prek

O [prek](https://github.com/j178/prek) lê o mesmo `.pre-commit-config.yaml` do pre-commit, mas é um binário único e mais rápido. Ele vem pelo `uv sync` e se instala nos hooks do Git com `uv run prek install`.

Hooks, na ordem em que rodam:

| Hook | O que barra |
| --- | --- |
| `trailing-whitespace`, `end-of-file-fixer` | Espaço no fim da linha e arquivo sem quebra de linha final (corrigem sozinhos) |
| `check-yaml`, `check-toml` | YAML e TOML inválidos (o `pnpm-lock.yaml` fica de fora: tem vários documentos e é gerado) |
| `check-merge-conflict` | Marcadores `<<<<<<<` esquecidos |
| `check-added-large-files` | Arquivos grandes |
| `detect-private-key` | Chaves privadas |
| `gitleaks` | Tokens, senhas e client secrets no que está sendo commitado |
| `ruff-format`, `ruff-check` | Formatação e lint do back (corrigem o que dá) |
| `mypy` | Tipos do back |
| `generate-client` | Cliente da API do front desatualizado em relação ao back (regenera sozinho; veja a seção 7) |
| `prettier` | Formatação do front (corrige sozinho) |
| `eslint` | Lint do front |
| `typecheck` | Tipos do front |
| `zizmor` | Problemas de segurança nos workflows do GitHub Actions |
| `pytest` | Testes do back, **só no push** |

Detalhes:

- Os repositórios externos (`pre-commit-hooks`, `gitleaks`) são fixados pelo **hash do commit**, com a versão num comentário (`# frozen: v6.0.0`). Uma tag pode ser movida para outro código; um hash, não. Para atualizar: `uv run prek update --freeze`.
- Os hooks do back e do front usam as ferramentas instaladas no projeto (`uv run`, `pnpm`), as mesmas versões do CI.
- O hook de tipos do front roda `pnpm typecheck`, que gera os tipos de rota do Next (`next typegen`) antes do `tsc`. Um `tsc --noEmit` solto falha num clone novo.
- O gitleaks olha só o que está no stage. No CI, onde nada está no stage, ele não tem o que verificar; a proteção dele é na sua máquina.

## 3. Back: ruff e mypy

O ruff formata e faz o lint. Além das regras padrão, a NISE liga:

| Regra | O que pega |
| --- | --- |
| `E`, `W` | Estilo básico (pycodestyle) |
| `F` | Nomes não usados, imports quebrados (pyflakes) |
| `I` | Ordem dos imports |
| `B` | Armadilhas comuns (flake8-bugbear), como argumento padrão mutável |
| `C4` | Comprehensions que podem ser mais simples |
| `UP` | Sintaxe antiga para o Python 3.12 |
| `ASYNC` | Chamadas que travam dentro de código assíncrono (o back inteiro é assíncrono) |
| `T20` | `print`. Saída do back vai por logging, e nunca com nome, e-mail, telefone ou data de nascimento |

Ficam desligadas a `E501` (o tamanho da linha é com o `ruff format`) e a `B008` (`Depends(...)` como valor padrão é o jeito do FastAPI). Os scripts de `backend/scripts/` podem usar `print`, porque mostram o resultado para quem roda; a regra de dados pessoais vale lá também.

O mypy roda em modo estrito, com o plugin do Pydantic. Não mudou.

## 4. Front: Prettier e ESLint

O Prettier formata o front com a configuração padrão (`.prettierrc.json` vazio): aspas duplas e ponto e vírgula, como o código já usava. O ESLint continua com a configuração do Next; o `eslint-config-prettier` desliga as regras de estilo do ESLint que brigariam com o Prettier, como recomenda a documentação do Next.

- `pnpm format` formata; `pnpm format:check` só confere.
- O Prettier já ignora o que está no `.gitignore`. O `.prettierignore` lista o resto (o lockfile e o `next-env.d.ts`, que o Next gera).

O primeiro `pnpm format` mudou 95 arquivos. Esse commit está no `.git-blame-ignore-revs` (veja a seção 6).

## 5. CI

O workflow `.github/workflows/ci.yml` roda em todo PR e em todo push para `develop` e `main`. Os jobs rodam em paralelo:

| Job | O que faz |
| --- | --- |
| `hooks` | `uv run prek run --all-files`: os mesmos hooks do commit, em todos os arquivos. Se alguém commitou sem os hooks instalados, falha aqui |
| `backend-tests` | `uv run coverage run -m pytest`, com um Postgres 16 como serviço do job (seção 8). O relatório de cobertura sai no log e o HTML no artefato `coverage-html` |
| `frontend-build` | `pnpm build` |
| `e2e` | Playwright com o Chromium. Os testes simulam o back com `page.route`, então o FastAPI não sobe. Se falhar, os rastros ficam no artefato `playwright-test-results` |

Cuidados copiados do template:

- Actions fixadas pelo **hash do commit**, com a versão em comentário.
- `permissions: contents: read`: nenhum job escreve no repositório.
- `persist-credentials: false` no checkout: o token do GitHub não fica no disco do runner.
- `timeout-minutes` em todo job, para um teste travado não gastar horas.
- `concurrency`: um push novo no mesmo PR cancela a rodada antiga.

**Proteção das branches:** em *Settings → Branches* do GitHub, `main` e `develop` devem exigir 1 aprovação e os checks `hooks`, `backend-tests`, `frontend-build` e `e2e`.

## 6. Fim de linha e `git blame`

- **`.gitattributes`** força fim de linha LF em todos os sistemas. Sem isso, o Git no Windows troca para CRLF ao baixar os arquivos, o que quebra scripts shell dentro dos containers e briga com o Prettier e os hooks de espaço.
- **`.git-blame-ignore-revs`** lista commits só de formatação. O GitHub já pula esses commits no *blame*; na sua máquina, rode uma vez `git config blame.ignoreRevsFile .git-blame-ignore-revs`.

## 7. Contrato front/back: cliente gerado do OpenAPI

O FastAPI descreve todas as rotas no OpenAPI (o mesmo documento que aparece em `/docs`). O [`@hey-api/openapi-ts`](https://heyapi.dev) lê esse documento e gera, em `frontend/lib/api/`, os tipos de entrada e saída de cada rota e uma função para chamá-la. Assim o front não reescreve à mão o que o back já declarou: se o back muda uma rota, o tipo muda junto e o `pnpm typecheck` aponta o que quebrou.

Como funciona:

1. `bash scripts/generate-client.sh` (na raiz) importa o app do FastAPI, sem subir servidor nem banco, e salva o OpenAPI em `frontend/openapi.json`.
2. O `openapi-ts` lê esse arquivo e escreve `frontend/lib/api/` (configuração em `frontend/openapi-ts.config.ts`).
3. O Prettier formata os dois, para o resultado ser sempre o mesmo.

O hook `generate-client` roda esse script sempre que um arquivo do back muda. Se o cliente mudou, o commit para: confira o diff e adicione os arquivos gerados. No CI, o job `hooks` roda o mesmo script; se alguém commitou o back sem o cliente atualizado, ele falha.

O `openapi.json` e o `lib/api/` são **versionados**: o diff do `openapi.json` no PR mostra exatamente o que mudou no contrato. Não edite nada em `lib/api/` à mão; ele é sobrescrito a cada geração (e fica fora do ESLint).

Como usar no front:

```ts
import { listCities } from "@/lib/api";

const { data, error, response } = await listCities({
  query: { search },
  signal,
});
```

- A chamada **não lança erro** quando o back responde com erro: `data` vem vazio e `response.status` diz o que houve. Quando a requisição nem chega ao back (sem rede, ou cancelada pelo `signal`), `response` vem vazio e `error` tem o erro do `fetch`.
- As chamadas saem para `/api/...` no mesmo endereço do site, como antes. O cookie `httpOnly` da sessão vai junto.
- O nome de cada função é o nome da função da rota no back (`list_cities` vira `listCities`). Isso vem do `generate_unique_id_function` em `backend/app/main.py`; por isso **duas rotas não podem ter funções com o mesmo nome**.
- Por enquanto, só a busca de municípios e a página `/status` usam o cliente gerado. As outras chamadas de `frontend/lib/signup-api.ts` ainda usam `fetch` com tipos à mão; a migração delas é a issue #319. Código novo já deve usar o cliente gerado.

**Por quê:** a decisão de "tipos TypeScript gerados do OpenAPI do FastAPI" já estava na stack; faltava a ferramenta. O template usa a mesma, com versão fixada (ela ainda está antes da 1.0 e muda bastante entre versões).

## 8. Testes do back com o Postgres

Os testes do back são de dois tipos:

- **Com mock** (a maioria, como `test_auth_*.py`): trocam a sessão do banco por uma falsa (`tests/helpers.py`). São rápidos e testam a lógica das rotas e dos serviços.
- **Com o banco** (`test_db_constraints.py`): usam a fixture `db_session` e rodam no Postgres de verdade. Servem para o que só o banco garante: restrições únicas, checagens, chaves estrangeiras, consultas de permissão. Um mock aceita uma linha duplicada; o Postgres, não.

Como a fixture funciona (`backend/tests/conftest.py`):

- Os testes usam um banco separado, o **`nise_test`**, no mesmo Postgres do docker compose. Os dados do ambiente local não são tocados. O endereço vem da variável `TEST_DATABASE_URL`; sem ela, `postgresql+asyncpg://nise:nise@localhost:5432/nise_test`.
- Na primeira vez da rodada, a fixture cria o `nise_test` se ele não existe e prepara as tabelas com as próprias migrações: **aplica todas, desfaz todas, aplica de novo e roda o `alembic check`**. Isso é o teste das migrações: um `downgrade` quebrado ou um model mudado sem migração reprovam a suíte.
- Cada teste recebe uma sessão dentro de uma transação que é **desfeita no fim**. O teste pode dar `commit` à vontade; nada sobra para o próximo.
- **Trava:** a fixture recusa um banco cujo nome não termine em `_test`, porque o `downgrade` apaga todas as tabelas. Um `TEST_DATABASE_URL` errado não destrói dados.
- Sem o Postgres no ar, os testes com o banco falham com a mensagem "Suba o banco com `docker compose up -d db`". Eles não são pulados: um teste pulado em silêncio esconderia o erro. Os testes com mock rodam sem banco.

Quando usar cada um: regra que o banco garante ou consulta que precisa do SQL de verdade, `db_session`; lógica de rota e serviço, mock.

No CI, o job `backend-tests` sobe um Postgres 16 (a mesma versão do docker compose) como serviço e define o `TEST_DATABASE_URL`.

**Cobertura:** o CI roda os testes pelo `coverage` e mostra quanto do `app/` os testes alcançam, com as linhas que ficaram de fora. Não há meta mínima (decisão do CONTRIBUTING); o relatório serve para achar o que ficou sem teste. Na máquina: `uv run coverage run -m pytest && uv run coverage html` e abra `backend/htmlcov/index.html`.

**Por quê:** o template do FastAPI roda os testes no Postgres de verdade. Na NISE, várias regras são garantidas pelo banco (por exemplo, a RNF-F4.01, "nunca dois envios iguais", é uma restrição única), e o CONTRIBUTING já pedia "migrações em dia" sem nada que conferisse.

## Fora do escopo, por enquanto

Coisas do template que não adotamos agora, e quando faria sentido rever:

- **Mailpit** (servidor de e-mail falso no Docker): quando o back começar a enviar e-mails.
- **Biome** no lugar de ESLint e Prettier: o ESLint do Next tem regras específicas do framework.
- **ty** (segundo verificador de tipos) e **typos** (corretor ortográfico só em inglês): mais ruído que ajuda num código em português.
- **Meta de cobertura**: o CONTRIBUTING decide "sem meta".
