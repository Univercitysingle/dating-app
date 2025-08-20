# Stage 1: Install dependencies
FROM node:20-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json* ./
RUN echo "--- Installing dependencies ---" && npm install

# Stage 2: Build the application
FROM node:20-alpine AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN echo "--- Building application ---" && \
    NEXT_PUBLIC_FIREBASE_API_KEY="dummy" \
    NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN="dummy" \
    NEXT_PUBLIC_FIREBASE_PROJECT_ID="dummy" \
    NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET="dummy" \
    NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID="dummy" \
    NEXT_PUBLIC_FIREBASE_APP_ID="dummy" \
    npm run build

# Stage 3: Production image (Standalone)
FROM node:20-alpine AS runner
WORKDIR /app

ENV NODE_ENV=production

RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 nextjs

# Copy the standalone output
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
# Copy the public and static folders
COPY --from=builder --chown=nextjs:nodejs /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static

USER nextjs

EXPOSE 3000

ENV PORT 3000

CMD ["node", "server.js"]
