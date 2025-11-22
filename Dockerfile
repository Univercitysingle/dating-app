# Stage 1: Build the React application
FROM node:18-alpine AS build

WORKDIR /app

# Copy dependency files
COPY package*.json ./
RUN npm install

# Copy the rest of the source code
COPY . .

# Build the frontend
RUN npm run build

# Stage 2: Serve the application
FROM node:18-alpine

WORKDIR /app

# Install ffmpeg and any other needed OS packages
RUN apk add --no-cache ffmpeg

# Copy dependency files
COPY package*.json ./
RUN npm install --omit=dev

# Copy the rest of the app
COPY . .

# Copy the built frontend from the builder stage
COPY --from=build /app/build ./public

# Hugging Face Spaces automatically expose port 7860,
# but our server runs on 5000. We expose 5000 and HF will handle the mapping.
EXPOSE 5000

CMD ["npm", "start"]
