# syntax=docker/dockerfile:1
# Build with Bun, then serve dist/ with server.ts on port 8080 (no node_modules at runtime). Put a reverse proxy
# such as Nginx Proxy Manager in front for the domain and TLS. Usually started through compose.yaml.

FROM oven/bun:1.4.2-alpine AS build
WORKDIR /app
COPY package.json bun.lock ./
RUN bun install --frozen-lockfile
COPY . .
# Absolute base URL for Open Graph/Twitter preview images; empty keeps them relative.
ARG SITE_URL=""
RUN bun run build \
 && find dist -name '*.map' -delete \
 && find dist \( -name '*.js' -o -name '*.css' -o -name '*.html' -o -name '*.svg' \) -exec gzip -9k {} +

FROM oven/bun:1.4.2-alpine
WORKDIR /app
COPY --from=build /app/dist ./dist
COPY server.ts ./
USER bun
EXPOSE 8080
HEALTHCHECK --interval=30s --timeout=3s CMD wget -qO /dev/null http://127.0.0.1:8080/ || exit 1
CMD ["bun", "server.ts"]
