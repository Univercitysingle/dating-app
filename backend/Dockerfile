FROM node:18-alpine

# Install ffmpeg and any other needed OS packages
RUN apk add --no-cache ffmpeg

WORKDIR /app

# Copy dependency files first for build cache
COPY package.json package-lock.json ./

# Install dependencies using lockfile for reproducible builds
RUN npm ci --omit=dev

# Copy the rest of the app
COPY . .

# Hugging Face requires port 7860
EXPOSE 7860

# Start the app
CMD ["npm", "start"]
