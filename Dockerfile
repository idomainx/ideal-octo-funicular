FROM node:20-bookworm-slim

RUN apt-get update && apt-get install -y --no-install-recommends \
    python3 make g++ libvips-dev \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY package.json package-lock.json* ./
RUN npm install --omit=dev

COPY . .

ENV NODE_ENV=production
ENV DATA_DIR=/data
ENV PORT=3000

RUN mkdir -p /data/uploads /data/backups /data/snapshots /data/build

EXPOSE 3000

CMD ["node", "server.js"]
