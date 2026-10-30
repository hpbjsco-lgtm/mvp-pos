# Builds the web app and the database server into one image.
# The SQLite file is NOT part of the image: mount a folder at /data (see docker-compose.yml).

# ---- Stage 1: build the web app ----
FROM node:20-bookworm-slim AS web-build
WORKDIR /build
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
# Connection fixed into the web bundle (see docker-compose.yml). Empty URL = the address the app is served from.
ARG VITE_SERVER_URL=
ARG VITE_SERVER_API_TOKEN=
RUN npm run build

# ---- Stage 2: database server that also serves the built web app ----
FROM node:20-bookworm-slim
ENV NODE_ENV=production \
    HOST=0.0.0.0 \
    PORT=8790 \
    DATA_DIR=/data \
    STATIC_DIR=/app/web
WORKDIR /app/server
COPY server/pos-db-server/package.json server/pos-db-server/package-lock.json ./
RUN npm ci --omit=dev
COPY server/pos-db-server/src ./src
COPY server/pos-db-server/public ./public
COPY --from=web-build /build/dist /app/web
RUN mkdir -p /data && chown -R node:node /data
USER node
VOLUME ["/data"]
EXPOSE 8790
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:8790/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "src/index.mjs"]
