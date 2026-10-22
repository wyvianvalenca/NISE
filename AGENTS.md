# AGENTS.md · NISE

Instruções para agentes de IA (Claude Code, Codex, Copilot, Cursor etc.) neste repositório. Pessoas: leiam o [CONTRIBUTING.md](CONTRIBUTING.md), que tem as mesmas regras com mais contexto.

## Projeto

NISE liga grupos de incentivo à computação em Alagoas às meninas que vão às ações deles. Requisitos em `docs/requisitos-v2.md`; cite o RF (ex.: RF-F1.01) que o código atende.

Parte da equipe programa sem agentes para aprender. Escreva código simples e legível, no padrão do código ao redor, e explique no PR o que foi feito.

## Stack

- Front: Next.js (App Router) + TypeScript, pnpm. PWA para a menina; site responsivo para a coordenadora.
- Back: Python + FastAPI, uv. SQLAlchemy **assíncrono** (asyncpg), Alembic.
- Banco: PostgreSQL (Supabase em produção). Pooler em modo transação: `statement_cache_size=0` no asyncpg.
- Hospedagem: Vercel, projeto único; FastAPI responde em `/api`.
- Login: Google, Microsoft e e-mail/senha; JWT em cookie `httpOnly` (nunca `localStorage`).
- Sem telas administrativas: curadoria, datas e duplicadas são scripts em `backend/scripts/`.

## Comandos

> A confirmar quando o esqueleto existir.

- Back: `uv run ruff format`, `uv run ruff check`, `uv run mypy`, `uv run pytest`
- Migração nova: `uv run alembic revision --autogenerate -m "..."`
- Front: `pnpm lint`, `pnpm tsc --noEmit`, `pnpm test:e2e`
- Tipos da API: regenerar do OpenAPI depois de mudar qualquer rota

Rode as verificações antes de dizer que terminou.

## Regras

- Git flow: trabalhe em `feature/<id>-<nome>` a partir de `develop`. Nunca commite em `main` ou `develop`.
- Todo PR precisa de 1 aprovação de uma pessoa que não seja quem abriu o PR.
- Commits em Conventional Commits (`feat(f1): ...`).
- Toda mudança de modelo vem com migração Alembic no mesmo commit/PR.
- No SQLAlchemy assíncrono, carregue relações com `selectinload`; acesso preguiçoso dá erro.
- Toda história tem testes de back para os critérios de aceite.
- Não desative, pule ou apague testes para fazer o CI passar.
- Não adicione dependências sem dizer por quê no PR.
- Não mude decisões da stack nem do fluxo (bibliotecas, padrões, ferramentas) por conta própria. Se achar que uma deve mudar, pergunte a quem está usando você; mudanças são decididas pela equipe e registradas no CONTRIBUTING.md.

## Dados e privacidade (inegociável)

- Permissões sempre checadas no servidor; coordenadora só vê o próprio grupo.
- Nunca envie nome, e-mail, telefone ou data de nascimento à LLM nem os escreva em logs.
- F31 (ingresso por listas oficiais, cruzamento com aprovados da COPEVE): lista oficial só em memória; nada de terceiros no banco, disco ou logs.
- Nunca use ou gere dados reais de meninas; testes usam dados fictícios.
- Nunca coloque segredos no código; use variáveis de ambiente (`.env.example` sem valores).
