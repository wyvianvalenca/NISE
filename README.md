<div align="center">

<picture>
  <source media="(prefers-color-scheme: dark)" srcset="docs/assets/nise-logo-horizontal-negativo.svg">
  <img src="docs/assets/nise-logo-horizontal.svg" alt="NISE" width="260">
</picture>

**Núcleo de Incentivo e Suporte para Egressas e Estudantes**

Plataforma que conecta meninas a oportunidades em computação e ajuda os grupos de incentivo a acompanhar o caminho delas.

[![CI](https://github.com/wyvianvalenca/nise/actions/workflows/ci.yml/badge.svg)](https://github.com/wyvianvalenca/nise/actions/workflows/ci.yml)
![Next.js](https://img.shields.io/badge/Next.js-16-000000?logo=nextdotjs&logoColor=white)
![FastAPI](https://img.shields.io/badge/FastAPI-Python%203.12-009688?logo=fastapi&logoColor=white)
![PostgreSQL](https://img.shields.io/badge/PostgreSQL-16-4169E1?logo=postgresql&logoColor=white)

[Sobre](#sobre) · [Funcionalidades](#funcionalidades) · [Stack](#stack) · [Rodando localmente](#rodando-localmente) · [Contribuindo](#contribuindo)

</div>

## Sobre

A NISE reúne, num só lugar, as meninas que passam pelas ações dos grupos de incentivo à computação e as coordenadoras desses grupos.

- **Para a menina**, é um app instalável no celular (PWA): ela recebe sugestões de cursos, eventos e desafios de acordo com os seus interesses, monta o seu filé de atividades e acompanha a agenda de datas importantes, como ENEM e SISU.
- **Para a coordenadora**, é um site responsivo onde ela cadastra as ações do grupo, importa as inscritas, marca a presença e vê os resultados: avaliações, interesses e quem ingressou num curso de computação.

O projeto é desenvolvido na disciplina de Projeto e Desenvolvimento de Sistemas (PDS 26.2) da UFAL. Os requisitos e as decisões estão em [`docs/requisitos-NISE.md`](docs/requisitos-NISE.md).

## Funcionalidades

| Menina | Coordenadora |
| --- | --- |
| Cadastro com Google ou e-mail e senha | Acesso por convite do grupo |
| Descobrir: sugestões por interesse e cidade | Cadastro, edição e exclusão de ações |
| Filé: atividades salvas, em andamento e concluídas | Importação de inscritas por planilha e marcação de presença |
| Inscrição em eventos e avaliação depois da presença | Resultados das ações: avaliações e interesses |
| Agenda com eventos e datas importantes | Ingressantes: quem entrou num curso de computação |
| Questionário de acompanhamento ("Como está seu caminho?") | |

Rotinas automáticas cuidam dos e-mails (convites, lembretes e questionários) e da busca de aprovadas nas listas oficiais da COPEVE e do IFAL.

## Stack

| Camada | Tecnologia |
| --- | --- |
| Front-end | [Next.js](https://nextjs.org/) 16 (App Router), React 19, TypeScript, pnpm |
| Back-end | [FastAPI](https://fastapi.tiangolo.com/), Python 3.12, uv |
| Banco | PostgreSQL 16, SQLAlchemy assíncrono (asyncpg), Alembic |
| Autenticação | Google OAuth e e-mail e senha, sessão por JWT em cookie `httpOnly` |
| Contrato front/back | Tipos TypeScript gerados do OpenAPI do FastAPI |
| Testes | pytest, Playwright (E2E) |
| Qualidade | ruff, mypy (strict), ESLint, pre-commit, GitHub Actions |
| Hospedagem | Vercel (front e API no mesmo projeto) e Supabase (banco) |

```
navegador ──► Next.js :3000 ──/api/*──► FastAPI :8000 ──► PostgreSQL :5432
```

O front repassa tudo que começa com `/api` para o back. Em produção, a Vercel faz o mesmo roteamento (`vercel.json`).

## Rodando localmente

### Pré-requisitos

- [Git](https://git-scm.com/)
- [Docker](https://www.docker.com/) com Docker Compose
- [uv](https://docs.astral.sh/uv/) e [pnpm](https://pnpm.io/)

### Passo a passo

```bash
# 1. Clone o repositório e copie as variáveis de ambiente
git clone https://github.com/wyvianvalenca/nise.git
cd nise
cp .env.example .env

# 2. Suba o banco, o back-end e o front-end
docker compose up -d --build

# 3. Aplique as migrações e carregue os municípios do IBGE
docker compose exec backend uv run alembic upgrade head
docker compose exec backend uv run python -m scripts.carregar_municipios
```

| O quê | Endereço |
| --- | --- |
| App | http://localhost:3000 |
| API | http://localhost:8000/api/health |
| Documentação da API | http://localhost:8000/docs |

O código de `backend/` e `frontend/` fica montado nos containers e recarrega ao salvar. Para rodar só o banco no Docker e o resto na máquina (útil para depurar), veja a seção 3.3 do [CONTRIBUTING](CONTRIBUTING.md#33-só-o-banco-no-docker-para-depurar).

### Variáveis de ambiente

Todas estão comentadas no [`.env.example`](.env.example). As principais:

| Variável | Para quê |
| --- | --- |
| `DATABASE_URL` | Conexão do back-end com o Postgres |
| `JWT_SECRET` | Assinatura da sessão (obrigatória) |
| `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_REDIRECT_URI` | Login com Google |
| `APP_URL` | Endereço público usado nos links dos e-mails |
| `SMTP_*`, `EMAIL_FROM` | Envio de e-mails pela conta Gmail da equipe |
| `CRON_SECRET` | Protege as rotas `/api/cron` chamadas pelo agendador |
| `LIST_SEARCH_ENABLED` | Liga a busca nas listas oficiais (desligada por padrão) |

Sem `SMTP_USER` e `SMTP_PASSWORD`, nenhum e-mail sai: eles ficam na fila.

## Comandos úteis

**Back-end** (em `backend/`)

```bash
uv run pytest                 # testes
uv run ruff check .           # lint
uv run ruff format .          # formatação
uv run mypy .                 # tipos
uv run alembic revision --autogenerate -m "descrição"   # nova migração
```

**Front-end** (em `frontend/`)

```bash
pnpm dev          # servidor de desenvolvimento
pnpm lint         # ESLint
pnpm typecheck    # tipos
pnpm build        # build de produção
pnpm test:e2e     # testes E2E (Playwright)
pnpm api:types    # regenera os tipos a partir do OpenAPI do back
```

**Curadoria** (em `backend/`). Não há telas internas: os dados da equipe são mantidos por scripts versionados.

| Script | O que faz |
| --- | --- |
| `scripts.carregar_curadoria` | Carrega as sugestões do filé a partir de `scripts/dados/curadoria.json` |
| `scripts.datas_importantes` | Cadastra e lista as datas importantes da agenda |
| `scripts.criar_convite` | Gera o link de convite de um grupo |
| `scripts.buscar_listas` | Roda a busca nas listas oficiais |

Rode com `uv run python -m <script>`. Cada arquivo explica as opções no topo.

## Estrutura

```
nise/
├── backend/             API FastAPI
│   ├── app/             auth, users, core e módulos de domínio
│   ├── alembic/         migrações
│   ├── scripts/         curadoria e rotinas da equipe
│   └── tests/
├── frontend/            app Next.js
│   ├── app/             rotas (menina e coordenacao/)
│   ├── components/
│   ├── lib/             cliente da API e tipos gerados
│   └── e2e/             testes Playwright
├── docs/                requisitos e decisões
├── docker-compose.yml   ambiente local
└── vercel.json          deploy
```

## Contribuindo

O fluxo de trabalho está no [CONTRIBUTING.md](CONTRIBUTING.md). Em resumo:

- Branches seguem o git flow: `feat/<id>-<nome>` sai de `develop` e volta para `develop`; `main` é produção.
- Commits e títulos de PR seguem o [Conventional Commits](https://www.conventionalcommits.org/pt-br/).
- O PR só entra com o CI verde e uma aprovação de outra pessoa.
- Nunca use dados reais de meninas fora da produção, e nunca coloque segredos no repositório.
