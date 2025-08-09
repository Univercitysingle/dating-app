FROM node:18-alpine

# Install ffmpeg
RUN apk add --no-cache ffmpeg

WORKDIR /app

# Copy dependency files
COPY package.json package-lock.json ./

# Ensure lockfile exists
RUN [ -f package-lock.json ] || (echo "Error: package-lock.json not found!" && false)

# Install production dependencies
RUN npm ci --omit=dev

# Copy the rest of your source code
COPY . .

# Hugging Face requires port 7860
EXPOSE 7860

# Start your app on 0.0.0.0:7860
CMD ["npm", "start"]
