FROM node:18-alpine

WORKDIR /app

# Install ffmpeg and dumb-init for proper signal handling in containers
RUN apk add --no-cache ffmpeg dumb-init

# Copy package definition files
COPY package*.json ./

# Install production dependencies only
RUN npm install --omit=dev --no-audit

# Copy application source and pre-built frontend
COPY . .

# Copy pre-built frontend into public directory for Express static serving
RUN if [ -d "./build" ]; then cp -r ./build/* ./public/ 2>/dev/null || true; fi

# Default environment for Cloud Run / Docker Desktop
ENV NODE_ENV=production
ENV PORT=8080

EXPOSE 8080 5000

# Use dumb-init to pass SIGTERM/SIGINT signals to Node.js for graceful shutdown
ENTRYPOINT ["/usr/bin/dumb-init", "--"]
CMD ["node", "server.js"]
