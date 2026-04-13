FROM node:20-slim

WORKDIR /app

COPY package*.json ./
RUN npm ci

COPY . .

# Build React frontend into dist/
RUN npm run build

EXPOSE 8080
ENV NODE_ENV=production
ENV PORT=8080

# Run server directly with tsx (same as dev but with NODE_ENV=production)
CMD ["npx", "tsx", "server.ts"]
