# Stage 1: Build the frontend
FROM node:18-alpine AS frontend-builder

WORKDIR /app/frontend

# Copy frontend dependency files
COPY frontend/package.json frontend/package-lock.json ./

# Install frontend dependencies
RUN npm ci

# Copy the rest of the frontend source code
COPY frontend/ ./

# Build the frontend
RUN npm run build

# Stage 2: Build the backend and serve the frontend
FROM node:18-alpine

WORKDIR /app

# Install ffmpeg and any other needed OS packages
RUN apk add --no-cache ffmpeg

# Copy backend dependency files
COPY backend/package.json backend/package-lock.json ./

# Install backend dependencies
RUN npm ci --omit=dev

# Copy the rest of the backend app
COPY backend/ .

# Copy the built frontend from the builder stage
COPY --from=frontend-builder /app/frontend/build ./public

# Hugging Face requires port 7860
EXPOSE 7860

# Start the app
CMD ["npm", "start"]
