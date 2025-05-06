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

# 4. Copy package.json and yarn.lock (if it exists) / package-lock.json
#    Use separate COPY for package.json first for better layer caching
COPY package.json ./
COPY package-lock.json* ./
# COPY yarn.lock* ./ # Commented out as package-lock exists

# 5. Install dependencies using npm (as package-lock.json exists)
#    Rebuild any native dependencies
RUN npm install --omit=dev && npm rebuild

# 6. Copy the rest of your application code into the container
COPY . .

# 7. Copy the entrypoint script and make it executable
COPY entrypoint.sh /usr/local/bin/
RUN chmod +x /usr/local/bin/entrypoint.sh

# 8. Expose the port (though this bot doesn't seem to run a server)
# EXPOSE 8080 # Keep commented out unless needed

# 9. Set the entrypoint script to run first
ENTRYPOINT ["entrypoint.sh"]

# 10. Define the default command that the entrypoint script will execute
#     Use main.js instead of index.js
CMD ["node", "main.js"]
