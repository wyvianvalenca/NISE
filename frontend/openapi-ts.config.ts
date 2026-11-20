import { defineConfig } from "@hey-api/openapi-ts";

// Gera os tipos e as funções de chamada da API a partir do OpenAPI do FastAPI.
// Não rode direto: use `bash scripts/generate-client.sh` na raiz, que primeiro
// exporta o openapi.json do back. Detalhes em docs/ferramentas.md.
export default defineConfig({
  input: "./openapi.json",
  output: "./lib/api",
  plugins: [
    // Cliente com o fetch do navegador. Sem baseUrl: as chamadas saem para
    // /api/... no mesmo endereço do site, como as feitas à mão, e o cookie
    // httpOnly da sessão vai junto.
    "@hey-api/client-fetch",
    "@hey-api/typescript",
    "@hey-api/sdk",
  ],
});
