FROM node:22-bookworm-slim

ENV NODE_ENV=production
ENV PORT=8080
ENV FACE_MODEL_PATH=/app/node_modules/@vladmandic/face-api/model

RUN apt-get update && apt-get install -y --no-install-recommends ffmpeg ca-certificates && \
    rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY package.json ./
RUN npm install --omit=dev --no-audit --no-fund
COPY server.js ./
EXPOSE 8080
CMD ["node", "server.js"]
