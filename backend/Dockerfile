# ---------- build: compila o TypeScript e gera o client do Prisma ----------
FROM node:22-alpine AS build
WORKDIR /app

COPY package*.json ./
RUN npm ci

COPY prisma ./prisma/
COPY prisma.config.ts ./
RUN npx prisma generate

COPY . .
RUN npx prisma generate && npm run build

# ---------- runtime: só dependências de produção + JS compilado ----------
FROM node:22-alpine
WORKDIR /app
ENV NODE_ENV=production

COPY package*.json ./
RUN npm ci --omit=dev && npm cache clean --force

COPY prisma ./prisma/
COPY prisma.config.ts ./
COPY docker-entrypoint.sh ./
COPY --from=build /app/dist ./dist

EXPOSE 3333
CMD ["sh", "docker-entrypoint.sh"]
