# Stage 1: Build the frontend assets
FROM node:18-alpine AS build
WORKDIR /app

RUN echo "--- Starting Frontend Build Stage ---"

# Install dependencies for the frontend build
COPY package*.json ./
RUN echo "-> Installing root dependencies for frontend build..." && npm install

# Copy all source code
COPY . .

# Build the frontend
RUN echo "-> Building frontend assets..." && npm run build
RUN echo "--- Frontend Build Stage Complete ---"


# Stage 2: Create the final production image
FROM node:18-alpine
WORKDIR /app

RUN echo "--- Starting Production Image Stage ---"

# Add system dependencies
RUN echo "-> Adding system dependencies (ffmpeg)..." && apk add --no-cache ffmpeg

# Set the environment to production
ENV NODE_ENV=production
RUN echo "-> Set NODE_ENV to production"

# Install production dependencies from the root package.json
COPY package*.json ./
RUN echo "-> Installing root production dependencies..." && npm install --omit=dev

# Install production dependencies from the backend package.json
COPY backend/package*.json ./backend/
# Check if package-lock.json exists before trying to copy it
COPY backend/package-lock.json* ./backend/
RUN echo "-> Installing backend production dependencies..." && cd backend && npm install --omit=dev

# Copy all source code
COPY . .
RUN echo "-> Copied all source code"

# Copy the built frontend assets from the build stage
COPY --from=build /app/build ./public
RUN echo "-> Copied built frontend assets to ./public"

# Expose the application port
EXPOSE 5000
RUN echo "-> Exposed port 5000"

# Start the server from the root directory
CMD ["node", "server.js"]
