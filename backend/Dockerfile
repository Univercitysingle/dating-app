FROM node:18-alpine

# Install ffmpeg
RUN apk add --no-cache ffmpeg

# Set working directory
WORKDIR /app

# Copy package.json and package-lock.json
COPY package*.json ./

# Install ALL dependencies (not just production, so socket.io/dev tools are included)
RUN npm install

# Copy the rest of your code
COPY . .

# Expose the port your app runs on
EXPOSE 5000

# Start your server
CMD ["npm", "start"]
