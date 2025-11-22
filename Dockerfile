# Stage 1: Build the frontend assets
FROM node:18-alpine AS build
WORKDIR /app

# Install dependencies for the frontend build
COPY package*.json ./
RUN npm install

# Copy all source code
COPY . .

# Build the frontend
RUN npm run build


# Stage 2: Create the final production image
FROM node:18-alpine
WORKDIR /app

# Add system dependencies
RUN apk add --no-cache ffmpeg

# Install production dependencies from the root package.json
COPY package*.json ./
RUN npm install --omit=dev

# Install production dependencies from the backend package.json
COPY backend/package*.json ./backend/
# Check if package-lock.json exists before trying to copy it
COPY backend/package-lock.json* ./backend/
RUN cd backend && npm install --omit=dev

# Copy all source code
COPY . .

# Copy the built frontend assets from the build stage
COPY --from=build /app/build ./public

# Expose the application port
EXPOSE 5000

# Start the server from the root directory
CMD ["node", "server.js"]
