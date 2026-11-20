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
| `backend-tests` | `uv run pytest` |
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

## Fora do escopo, por enquanto

Coisas do template que não adotamos agora, e quando faria sentido rever:

- **Mailpit** (servidor de e-mail falso no Docker): quando o back começar a enviar e-mails.
- **Biome** no lugar de ESLint e Prettier: o ESLint do Next tem regras específicas do framework.
- **ty** (segundo verificador de tipos) e **typos** (corretor ortográfico só em inglês): mais ruído que ajuda num código em português.
- **Meta de cobertura**: o CONTRIBUTING decide "sem meta".
