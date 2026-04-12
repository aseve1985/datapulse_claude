# Stage 1: build
FROM node:20-slim AS builder

WORKDIR /app

COPY package*.json ./
RUN npm ci

COPY . .

# Build React frontend into dist/
RUN npm run build

# Compile server.ts with esbuild — exclude vite (only used in dev)
RUN npx esbuild server.ts \
  --bundle \
  --platform=node \
  --format=esm \
  --outfile=dist/server.mjs \
  --external:vite \
  --external:fsevents \
  --loader:.ts=ts \
  --define:process.env.NODE_ENV=\"production\"

# Stage 2: lean runtime image
FROM node:20-slim

WORKDIR /app

COPY package*.json ./
RUN npm ci --omit=dev

COPY --from=builder /app/dist ./dist

EXPOSE 8080
ENV NODE_ENV=production
ENV PORT=8080

CMD ["node", "dist/server.mjs"]
