# 1. Use the official Node.js v18 image (Bullseye = Debian 11 base)
FROM node:18-bullseye

# 2. Install system dependencies needed by Nezuko and its modules
RUN apt-get update && apt-get install -y --no-install-recommends \
    git \
    ffmpeg \
    imagemagick \
    webp \
    ca-certificates \
    # Add build tools just in case they help native module rebuilds
    build-essential \
    python3 \
    && apt-get clean && rm -rf /var/lib/apt/lists/*

# 3. Create app directory and set as working directory
WORKDIR /usr/src/app

# 4. Copy package.json and package-lock.json first for layer caching
COPY package.json ./
COPY package-lock.json* ./

# 5. Install production dependencies and rebuild native modules
RUN npm install --omit=dev && npm rebuild

# 6. Copy ALL application source code Explicitly to WORKDIR
COPY . /usr/src/app/

# 7. Expose the dummy port (just to satisfy Elestio if needed)
EXPOSE 8080

# 8. Define the command to run the application
CMD [ "node", "index.js" ]
