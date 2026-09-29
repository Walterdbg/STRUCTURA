# STRUCTURA - one image for both engines (ENGINE_MODE=cloud or local).

# ---- build: compile domain, screens and server ----
FROM node:22-alpine AS build
WORKDIR /app
COPY package.json package-lock.json tsconfig.base.json ./
COPY domain/package.json domain/
COPY server/package.json server/
COPY web/package.json web/
RUN npm ci --no-audit --no-fund
COPY domain domain
COPY server server
COPY web web
RUN npm run build

# ---- run: only what production needs ----
FROM node:22-alpine
WORKDIR /app
ENV NODE_ENV=production
COPY package.json package-lock.json ./
COPY domain/package.json domain/
COPY server/package.json server/
COPY web/package.json web/
RUN npm ci --omit=dev --workspace domain --workspace server --no-audit --no-fund
COPY --from=build /app/domain/dist domain/dist
COPY --from=build /app/server/dist server/dist
COPY server/migrations server/migrations
COPY --from=build /app/web/dist web/dist
ENV WEB_DIR=/app/web/dist PORT=8080 FILES_DIR=/data/files
# Managed files (product photos) live on a volume mounted here.
RUN mkdir -p /data/files && chown node:node /data/files
EXPOSE 8080
USER node
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s \
  CMD wget -qO- http://127.0.0.1:8080/api/health > /dev/null || exit 1
CMD ["node", "server/dist/index.js"]
