# Multi-stage production build for SAFARIS Backend
FROM node:22-alpine AS builder

WORKDIR /app

COPY package*.json tsconfig.json ./
RUN npm ci || npm install --no-audit --no-fund

COPY src ./src
RUN npm run build

# Production runtime stage
FROM node:22-alpine AS runner

WORKDIR /app

ENV NODE_ENV=production
ENV PORT=3000

COPY package*.json ./
RUN (npm ci --omit=dev && npm cache clean --force) || (npm install --omit=dev --no-audit --no-fund && npm cache clean --force)

COPY --from=builder /app/dist ./dist
COPY src/database/schema.sql ./dist/database/schema.sql
COPY src/database/schema.sql ./src/database/schema.sql
COPY src/database/migrations ./src/database/migrations
COPY src/database/migrations ./dist/database/migrations

EXPOSE 3000

USER node

# Enforce max old space size of 128MB to preserve RAM on 512MB VPS
CMD ["node", "--max-old-space-size=128", "dist/index.js"]

