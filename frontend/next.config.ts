import type { NextConfig } from "next";

// O FastAPI responde em /api. Localmente ele sobe em localhost:8000; no
// docker compose, no serviço `backend`. Daí a variável de ambiente.
const backendUrl = process.env.BACKEND_URL ?? "http://localhost:8000";

const nextConfig: NextConfig = {
  cacheComponents: true,
  partialPrefetching: true,
  async rewrites() {
    return [
      {
        source: "/api/:path*",
        destination: `${backendUrl}/api/:path*`,
      },
    ];
  },
};

export default nextConfig;
