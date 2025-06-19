# Use official Node.js image
FROM node:18-slim

# Install ffmpeg and Python (for yt-dlp)
RUN apt-get update && \
    apt-get install -y ffmpeg python3 python3-pip && \
    pip install --break-system-packages yt-dlp && \
    apt-get clean && \
    rm -rf /var/lib/apt/lists/*

# Create app directory
WORKDIR /app

# Copy files
COPY package*.json ./
RUN npm install

COPY . .

# Ensure download folder exists
RUN mkdir -p /app/download

# Expose backend port
EXPOSE 8000

# Start the server
CMD ["node", "server.js"]
