FROM node:18-alpine

# Optional: install other system dependencies if needed
RUN apk add --no-cache ffmpeg

WORKDIR /app

# Copy dependency files for efficient Docker caching
COPY package.json package-lock.json ./

# Fail fast if package-lock.json is missing (optional, but recommended)
RUN [ -f package-lock.json ] || (echo "Error: package-lock.json not found!" && false)

# Install dependencies (using lockfile for reproducibility)
RUN npm ci

# Copy the rest of your backend source code
COPY . .

# Expose port (change if your app uses a different port)
EXPOSE 5000

# Start the app
CMD ["npm", "start"]
