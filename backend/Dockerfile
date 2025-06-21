FROM node:18-alpine

# Install ffmpeg
RUN apk add --no-cache ffmpeg

WORKDIR /app

# Copy both package.json and package-lock.json first for caching
COPY package*.json ./

# Install ALL dependencies (including socket.io)
RUN npm ci

# Copy the rest of your code
COPY . .

EXPOSE 5000

CMD ["npm", "start"]
