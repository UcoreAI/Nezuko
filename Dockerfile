# 1. Use an official Node.js v18 image based on Debian Bullseye
FROM node:18-bullseye

# 2. Install essential system dependencies
RUN apt-get update && apt-get install -y --no-install-recommends \
    git \
    ffmpeg \
    imagemagick \
    webp \
    ca-certificates \
    && apt-get clean && rm -rf /var/lib/apt/lists/*

# 3. Set the working directory inside the container
WORKDIR /root/Nezuko

# 4. Copy package.json and package-lock.json
COPY package.json ./
COPY package-lock.json* ./

# 5. Install ALL dependencies using npm (including express, qrcode)
RUN npm install && npm rebuild

# 6. Copy the rest of your application code into the container
COPY . .

# 7. --- NO entrypoint.sh needed ---

# 8. Expose the port the web server will run on
EXPOSE 8080

# 9. --- NO ENTRYPOINT needed ---

# 10. Define the command to run the combined bot and web server
CMD ["node", "index.js"]
