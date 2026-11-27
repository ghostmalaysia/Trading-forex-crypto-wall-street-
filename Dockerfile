FROM node:20-alpine

WORKDIR /app

ENV NODE_ENV=production
ENV HOST=0.0.0.0
ENV PORT=8080

COPY package.json ./
COPY server.mjs ./
COPY ai ./ai
COPY web ./web
COPY README.md ROADMAP.md ARCHITECTURE.md ./
COPY docs ./docs

RUN mkdir -p data

EXPOSE 8080

CMD ["node", "server.mjs"]
