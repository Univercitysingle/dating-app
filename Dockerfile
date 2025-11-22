# Stage 1: Build the React application
FROM node:18-alpine AS build

WORKDIR /app

# Copy the root package.json and package-lock.json
COPY package*.json ./
RUN npm install

# Copy the rest of the source code
COPY . .

# Build the frontend
RUN npm run build

# Stage 2: Serve the application
FROM node:18-alpine

WORKDIR /app

# Install ffmpeg
RUN apk add --no-cache ffmpeg

# Copy the backend package.json and package-lock.json
COPY backend/package*.json ./backend/
WORKDIR /app/backend
RUN npm install --omit=dev

# Copy the backend source code
COPY backend/ .

WORKDIR /app

# Copy the built frontend from the builder stage
COPY --from=build /app/build ./public

EXPOSE 5000

WORKDIR /app/backend
CMD ["npm", "start"]
