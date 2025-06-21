FROM node:18-alpine

# Install ffmpeg
RUN apk add --no-cache ffmpeg

WORKDIR /app

# Copy both package.json and package-lock.json
COPY package*.json ./

# Always do a full install, not --production, to ensure all required packages (including socket.io) are included
RUN npm ci

COPY . .

EXPOSE 5000

CMD ["npm", "start"]
