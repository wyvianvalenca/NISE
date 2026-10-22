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
  docs/                 requisitos, decisões
  docker-compose.yml    ambiente local
  .github/workflows/    CI
  .env.example          variáveis sem valores reais
  CONTRIBUTING.md       este arquivo
  AGENTS.md             regras para agentes de IA
```

## 3. Rodando localmente

Pré-requisitos: Git, Docker, uv e pnpm

1. Copie as variáveis: `cp .env.example .env`
1. Instale os hooks (uma vez por máquina): `uv tool install pre-commit` e `pre-commit install`
1. Suba o ambiente: `docker compose up -d`.
4. Confira a conexão: `docker compose exec db psql -U nise -d nise -c "select 1"`

Para parar: `docker compose down`. Para apagar também os dados do banco: `docker compose down -v`

**Nunca use dados reais de meninas fora da produção.**

## 4. Fluxo de Git (git flow)

| Branch | Para quê | Sai de | Volta para |
| --- | --- | --- | --- |
| `main` | Produção. Cada merge publica na Vercel | - | - |
| `develop` | Integração da sprint | `main` | `main`, ao fim da sprint |
| `feature/<id>-<nome>` | Uma história de usuário | `develop` | `develop` |
| `hotfix/<nome>` | Correção urgente em produção | `main` | `main` e `develop` |

Exemplo: `feature/hu-12-importar-inscritas`.

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

Rodam no **pre-commit** (na sua máquina) e no **CI** (no PR). O PR só entra com tudo verde.

| Lado | Verificação | Ferramenta |
| --- | --- | --- |
| Back | Formatação e lint | ruff |
| Back | Tipos | mypy |
| Back | Testes | pytest |
| Back | Migrações em dia | Alembic |
| Front | Lint | ESLint |
| Front | Tipos | `tsc --noEmit` |
| Front | Contrato com o back | Tipos do OpenAPI regenerados e commitados |
| Front | E2E | Ferramenta a definir (sugestão: Playwright), só nos caminhos principais |

Não há meta de cobertura de testes, mas toda história tem testes de back para os critérios de aceite.

## 7. Pull requests

- Título no formato de Conventional Commits.
- Descrição com: história e RFs cobertos (ex.: RF-F1.01), como testar, prints no celular quando houver tela.
- 1 aprovação obrigatória de outra pessoa, que não seja quem abriu o PR. Configurar na proteção das branches `main` e `develop` do GitHub.
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
