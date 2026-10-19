FROM node:22-alpine AS base
WORKDIR /app
COPY package.json ./
COPY apps/api/package.json apps/api/package.json
COPY apps/web/package.json apps/web/package.json
RUN npm install
COPY . .
RUN npm run db:generate

FROM base AS api-build
RUN npm run build -w @ism/api

FROM node:22-alpine AS api
WORKDIR /app
ENV NODE_ENV=production
COPY --from=api-build /app/package.json ./package.json
COPY --from=api-build /app/scripts ./scripts
COPY --from=api-build /app/node_modules ./node_modules
COPY --from=api-build /app/apps/api ./apps/api
CMD ["node", "apps/api/dist/src/main.js"]

FROM base AS web-build
ARG NEXT_PUBLIC_API_URL=/api/v1
ENV NEXT_PUBLIC_API_URL=$NEXT_PUBLIC_API_URL
RUN npm run build -w @ism/web

FROM node:22-alpine AS web
WORKDIR /app
ENV NODE_ENV=production
COPY --from=web-build /app/apps/web/.next/standalone ./
COPY --from=web-build /app/apps/web/.next/static ./apps/web/.next/static
EXPOSE 3000
CMD ["node", "apps/web/server.js"]
