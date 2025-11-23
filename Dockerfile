# ===========================
# Stage 1: Build React Frontend
# ===========================
FROM node:18-alpine AS build

WORKDIR /app

# Install frontend deps
COPY package*.json ./
RUN npm install

# Copy all source code
COPY . .

# Build React
RUN npm run build



# ===========================
# Stage 2: Production Image (Node backend + built frontend)
# ===========================
FROM node:18-alpine

WORKDIR /app

# Install OS-level dependencies
RUN apk add --no-cache ffmpeg

# Set production environment
ENV NODE_ENV=production

# Copy package files and install production deps
COPY package*.json ./
RUN npm install --omit=dev

# Copy full source code
COPY . .

# Copy built frontend into backend public directory
COPY --from=build /app/build ./public

# Hugging Face default port
ENV PORT=7860

EXPOSE 7860

# Start your backend server
CMD ["node", "server.js"]