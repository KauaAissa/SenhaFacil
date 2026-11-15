FROM node:22-bookworm-slim AS base
WORKDIR /app
RUN apt-get update \
    && apt-get install -y --no-install-recommends openssl ca-certificates \
    && rm -rf /var/lib/apt/lists/*

FROM base AS build
RUN apt-get update \
    && apt-get install -y --no-install-recommends python3 make g++ \
    && rm -rf /var/lib/apt/lists/* \
    && corepack enable
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY patches ./patches
COPY apps/api/package.json ./apps/api/package.json
RUN pnpm install --frozen-lockfile --filter @senha-facil/api...
COPY apps/api/tsconfig.json ./apps/api/tsconfig.json
COPY apps/api/src ./apps/api/src
COPY apps/api/prisma/schema.prisma ./apps/api/prisma/schema.prisma
COPY apps/api/prisma/migrations ./apps/api/prisma/migrations
RUN node -e "const fs = require('node:fs'); if (fs.readdirSync('apps/api').some(name => name === '.env' || name.startsWith('.env.'))) throw new Error('Private environment files must not enter the build');"
RUN pnpm --filter @senha-facil/api db:generate \
    && pnpm --filter @senha-facil/api build

FROM base AS runtime
ENV NODE_ENV=production
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/apps/api/node_modules ./apps/api/node_modules
COPY --from=build /app/apps/api/package.json ./apps/api/package.json
COPY --from=build /app/apps/api/dist ./apps/api/dist
COPY --from=build /app/apps/api/prisma ./apps/api/prisma
WORKDIR /app/apps/api
USER node
EXPOSE 3000
CMD ["node", "dist/main.js"]
