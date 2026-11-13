
FROM node:22-bookworm-slim AS build

WORKDIR /app/server

RUN apt-get update \
    && apt-get install -y --no-install-recommends openssl ca-certificates \
    && rm -rf /var/lib/apt/lists/*

COPY server/package.json server/package-lock.json ./

RUN npm ci

COPY server/tsconfig.json ./
COPY server/prisma ./prisma
COPY server/src ./src
COPY server/scripts ./scripts

RUN npx prisma generate
RUN npm run build

FROM node:22-bookworm-slim

WORKDIR /app/server

ENV NODE_ENV=production
ENV PORT=3000

RUN apt-get update \
    && apt-get install -y --no-install-recommends openssl ca-certificates \
    && rm -rf /var/lib/apt/lists/*

COPY --from=build /app/server/node_modules ./node_modules
COPY --from=build /app/server/dist ./dist
COPY --from=build /app/server/prisma ./prisma
COPY --from=build /app/server/scripts ./scripts
COPY --from=build /app/server/package.json ./package.json

EXPOSE 3000

CMD ["node", "dist/index.js"]
