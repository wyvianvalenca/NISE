# Front-end da NISE

Next.js (App Router) + TypeScript, com pnpm. Fala com o FastAPI por `/api`.

## Rodando

```bash
pnpm install
pnpm dev
```

A página inicial consulta `GET /api/health` e mostra o status do back-end. O
`next.config.ts` reescreve `/api/*` para o back-end, que por padrão é
`http://localhost:8000` e pode ser trocado pela variável `BACKEND_URL` (é assim
que o docker compose aponta para o serviço `backend`).

Pelo Docker, da raiz do repositório:

```bash
docker compose up
```

## Verificações

```bash
pnpm lint
pnpm typecheck
pnpm build
pnpm test:e2e
```

`pnpm typecheck` roda `next typegen` antes do `tsc --noEmit`, porque os tipos de
rota do Next (`LayoutProps` e afins) são gerados. Um `pnpm tsc --noEmit` solto
só funciona depois de um `build`, `dev` ou `typegen`.

Os testes E2E (Playwright) ficam em `e2e/`. O navegador se instala uma vez por
máquina:

```bash
pnpm exec playwright install chromium
```
