# Como contribuir com a NISE

Guia para quem desenvolve no repositório. Agentes de IA seguem o [AGENTS.md](AGENTS.md), que resume as mesmas regras.

> Para mudar alguma decisão deste guia, combine com a equipe antes e abra um PR alterando este arquivo, com o motivo na descrição. O histórico de mudanças fica no próprio Git (botão *History* do arquivo no GitHub).

## 1. Stack

| Camada | Escolha |
| --- | --- |
| Front | Next.js (App Router) + TypeScript, com pnpm |
| Parte da menina | PWA (site instalável no celular, sem loja) |
| Parte da coordenadora | Site responsivo (360 px e 1366 px) |
| Back | Python + FastAPI, com uv |
| Banco | PostgreSQL (Supabase em produção, região São Paulo) |
| Acesso ao banco | SQLAlchemy **assíncrono** (asyncpg) |
| Migrações | Alembic (modelo assíncrono) |
| Login | Google, Microsoft (OAuth) e e-mail e senha; sessão por JWT em cookie `httpOnly` |
| Contrato front/back | Tipos TypeScript gerados do OpenAPI do FastAPI |
| E-mails automáticos | Conta Google (Gmail) da equipe |
| Rotinas | Cron jobs da Vercel (e-mails da F4, contatos programados; busca na COPEVE da F31, ingresso por listas oficiais) |
| Hospedagem | Vercel, um projeto só (Next.js + FastAPI em `/api`) |
| Ambiente local | Docker |

Telas internas (curadoria do filé, datas importantes, possíveis duplicadas) **não existem**: são feitas por scripts versionados no repositório.

## 2. Estrutura do repositório

```
nise/
  backend/              FastAPI, modelos, Alembic, testes, scripts
  frontend/             Next.js
  docs/                 requisitos, decisões, ferramentas (docs/ferramentas.md)
  docker-compose.yml    ambiente local
  pyproject.toml        workspace do uv (o back e as ferramentas do repositório)
  uv.lock               versões travadas de todo o Python do repositório
  .pre-commit-config.yaml  hooks do Git (rodados pelo prek)
  .github/workflows/    CI
  .env.example          variáveis sem valores reais
  CONTRIBUTING.md       este arquivo
  AGENTS.md             regras para agentes de IA
```

## 3. Rodando localmente

Pré-requisitos: Git, Docker Desktop (aberto), uv e pnpm.

```
navegador ──► localhost:3000 (front) ──/api/*──► localhost:8000 (back) ──► localhost:5432 (Postgres)
```

O front repassa tudo que começa com `/api` para o back (`rewrites` no `frontend/next.config.ts`).

### 3.1. Primeira vez

1. Copie as variáveis: `cp .env.example .env` (PowerShell: `Copy-Item .env.example .env`)
1. Instale as dependências do Python, na raiz do repositório: `uv sync`. Isso instala o back, as ferramentas dele (pytest, ruff, mypy) e as do repositório (prek, zizmor) numa `.venv` na raiz. Se você tinha uma `backend/.venv` de antes, pode apagá-la.
1. Instale os hooks do Git (uma vez por máquina): `uv run prek install`. Se você tinha instalado o pre-commit antes, o prek substitui os hooks dele.
1. Instale as dependências do front, para o editor e os hooks: `cd frontend && pnpm install`
1. Opcional: `git config blame.ignoreRevsFile .git-blame-ignore-revs`, para o `git blame` pular os commits só de formatação.

### 3.2. Tudo no Docker (dia a dia)

1. Suba o ambiente: `docker compose up -d --build`. O `--build` só é preciso na primeira vez ou quando mudar um `Dockerfile`, o `pyproject.toml` ou o `package.json`.
1. Aplique as migrações: `docker compose exec backend uv run alembic upgrade head`
1. Carregue os municípios do IBGE (só na primeira vez; repetir não duplica): `docker compose exec backend uv run python -m scripts.carregar_municipios`
1. Confira:

| O quê | Onde |
| --- | --- |
| App (front) | http://localhost:3000 |
| API (back) | http://localhost:8000/api/health |
| Documentação da API | http://localhost:8000/docs |
| Banco | `docker compose exec db psql -U nise -d nise -c "select 1"` |
| Estado dos containers | `docker compose ps` |

O código de `backend/` e `frontend/` fica montado nos containers: ao salvar, o back e o front recarregam sozinhos.

- Logs: `docker compose logs -f backend` (ou `frontend`, `db`)
- Nova migração depois de mudar um model: `docker compose exec backend uv run alembic revision --autogenerate -m "..."`. O arquivo aparece em `backend/alembic/versions/`; revise antes de commitar.
- Parar: `docker compose down`. Para apagar também os dados do banco: `docker compose down -v`

### 3.3. Só o banco no Docker (para depurar)

Útil para usar o debugger do editor. Pare antes o ambiente da 3.2 (`docker compose down`), senão as portas 8000 e 3000 ficam ocupadas.

1. Banco: `docker compose up -d db`
1. Back: `cd backend && uv run alembic upgrade head && uv run uvicorn app.main:app --reload`. Ele lê o `DATABASE_URL` do `.env` da raiz. Na primeira vez, carregue também os municípios: `uv run python -m scripts.carregar_municipios`.
1. Front: `cd frontend && pnpm install && pnpm dev`. Sem `BACKEND_URL`, ele usa `http://localhost:8000`.

### 3.4. Verificações à mão

Os hooks já rodam quase tudo a cada commit, e os testes do back a cada push. Para rodar todos os hooks em todos os arquivos, como o CI faz: `uv run prek run --all-files` (na raiz). Os testes do back rodam na máquina, não no container (a imagem não tem as dependências de desenvolvimento).

- Back (em `backend/`): `uv run ruff format .`, `uv run ruff check .`, `uv run mypy .`, `uv run pytest`
- Front (em `frontend/`): `pnpm format`, `pnpm lint`, `pnpm typecheck`, `pnpm build`, `pnpm test:e2e`

Use `pnpm typecheck`, não `pnpm tsc --noEmit`: o tsc solto falha num clone novo, porque os tipos de rota do Next ainda não foram gerados.

Se um hook falhar, corrija a causa em vez de pular com `--no-verify`: o CI roda os mesmos hooks e vai falhar do mesmo jeito.

### 3.5. Problemas comuns

| Sintoma | Causa provável | Solução |
| --- | --- | --- |
| `error during connect ... dockerDesktopLinuxEngine` | Docker Desktop fechado | Abra o Docker Desktop e espere iniciar |
| `port is already allocated` | Outro programa ou o modo 3.3 usando a porta | Pare o outro processo, ou troque `POSTGRES_PORT` no `.env` (e a porta do `DATABASE_URL` junto) |
| O back não acha um pacote recém-adicionado | O container subiu antes de o `uv.lock` (na raiz) mudar | `docker compose restart backend` (ao iniciar, o `uv run` sincroniza a `.venv` com o `uv.lock`) |
| `ValidationError ... database_url` ao rodar o back na máquina | Falta o `.env` na raiz | Volte à 3.1 |
| A migração não detecta a tabela nova | O `models.py` não é importado no `alembic/env.py` | Importe o módulo do model no `env.py` |

**Nunca use dados reais de meninas fora da produção.**

## 4. Fluxo de Git (git flow)

| Branch | Para quê | Sai de | Volta para |
| --- | --- | --- | --- |
| `main` | Produção. Cada merge publica na Vercel | - | - |
| `develop` | Integração da sprint | `main` | `main`, ao fim da sprint |
| `feat/<id>-<nome>` | Uma história de usuário | `develop` | `develop` |
| `chore/<nome>` | Ferramentas, CI e configuração, sem mudar o produto | `develop` | `develop` |
| `hotfix/<nome>` | Correção urgente em produção | `main` | `main` e `develop` |

Exemplo: `feat/hu-12-importar-inscritas`.

- Ninguém faz push direto em `main` nem em `develop`.
- Um PR por história. História grande vira dois PRs.

## 5. Commits (Conventional Commits)

Formato: `tipo(escopo): descrição no imperativo`.

| Tipo | Quando |
| --- | --- |
| `feat` | Funcionalidade nova |
| `fix` | Correção de erro |
| `test` | Só testes |
| `refactor` | Mudança de código sem mudar comportamento |
| `docs` | Documentação |
| `chore` | Configuração, dependências, CI |

Exemplos: `feat(f1): importar planilha CSV na página da ação`, `fix(auth): renovar cookie ao trocar de senha`.

## 6. Verificações

Rodam nos **hooks do Git** (na sua máquina, pelo prek) e no **CI** (no PR, pelo `.github/workflows/ci.yml`). O PR só entra com tudo verde. O porquê de cada ferramenta está em [docs/ferramentas.md](docs/ferramentas.md).

| Lado | Verificação | Ferramenta |
| --- | --- | --- |
| Geral | Segredos no commit | gitleaks |
| Geral | Segurança dos workflows | zizmor |
| Back | Formatação e lint | ruff |
| Back | Tipos | mypy |
| Back | Testes | pytest |
| Back | Migrações em dia | Alembic |
| Front | Formatação | Prettier |
| Front | Lint | ESLint |
| Front | Tipos | `pnpm typecheck` (`next typegen` + `tsc --noEmit`) |
| Front | Build | `pnpm build` |
| Front | Contrato com o back | Tipos do OpenAPI regenerados e commitados |
| Front | E2E | Ferramenta a definir (sugestão: Playwright), só nos caminhos principais |

Não há meta de cobertura de testes, mas toda história tem testes de back para os critérios de aceite.

## 7. Pull requests

- Título no formato de Conventional Commits.
- Descrição com: história e RFs cobertos (ex.: RF-F1.01), como testar, prints no celular quando houver tela.
- 1 aprovação obrigatória de outra pessoa, que não seja quem abriu o PR. Configurar na proteção das branches `main` e `develop` do GitHub, junto com os checks obrigatórios do CI: `hooks`, `backend-tests`, `frontend-build` e `e2e`.
- Toda mudança de modelo vem com a migração no mesmo PR.

## 8. Regras do domínio que valem para todo código

- **Permissões no servidor:** uma coordenadora nunca vê ações nem meninas de outro grupo, nem por requisição direta (RNF-G.03).
- **Dados pessoais:** nada de nome, e-mail, telefone ou data de nascimento em logs, na LLM (RF-F11.03) ou em exportações (F24, exportação anonimizada).
- **Listas oficiais (F31):** a F31 confirma se a menina entrou num curso de computação, cruzando o nome dela com as listas de aprovados (como as da COPEVE). A lista oficial é lida em memória e descartada. Nenhum nome de terceiros fica no banco, em disco ou em logs (RNF-F31.01).
- **Envios:** nunca dois envios para a mesma menina, ação, etapa e canal (RNF-F4.01), garantido por restrição única no banco.
- **Segredos:** nunca no repositório. Local no `.env`; CI e produção nos segredos do GitHub e da Vercel.

## 9. Ainda em aberto

- Fornecedor da LLM do filé.
- Ferramenta de E2E e caminhos testados.
- Responsáveis pelas contas da equipe (Gmail, Google Cloud, Microsoft Entra, Vercel, Supabase).
