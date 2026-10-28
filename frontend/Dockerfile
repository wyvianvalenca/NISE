# Imagem de desenvolvimento do front-end, usada pelo docker compose.
# Em produção quem faz o build é a Vercel, então não há estágio de produção aqui.
FROM node:22-alpine

RUN corepack enable

WORKDIR /app

# Instala as dependências primeiro para aproveitar o cache de camadas.
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN pnpm install --frozen-lockfile

COPY . .

EXPOSE 3000

CMD ["pnpm", "dev"]
