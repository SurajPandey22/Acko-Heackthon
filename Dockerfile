# syntax=docker/dockerfile:1

# ---- build: install everything, compile TypeScript ----
FROM node:22-slim AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY tsconfig.json ./
COPY src ./src
RUN npm run build

# ---- prod-deps: runtime node_modules only ----
FROM node:22-slim AS prod-deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev

# ---- run: slim runtime image, non-root ----
FROM node:22-slim AS run
WORKDIR /app
ENV NODE_ENV=production
COPY --from=prod-deps /app/node_modules ./node_modules
COPY package.json ./
COPY --from=build /app/dist ./dist
EXPOSE 3000
USER node
CMD ["node", "dist/server.js"]
