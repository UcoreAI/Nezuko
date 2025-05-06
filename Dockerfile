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

# 5. Install dependencies using npm (as package-lock.json exists)
#    Rebuild any native dependencies
RUN npm install --omit=dev && npm rebuild

# 6. Copy the rest of your application code into the container
COPY . .

# 7. --- NO entrypoint.sh needed ---

# 8. Expose the port (though this bot doesn't seem to run a server)
# EXPOSE 8080 # Keep commented out unless needed

# 9. --- NO ENTRYPOINT line ---

# 10. Define the command to generate config and run the app
#     Uses environment variables set in Elestio
#     Note: Use sh -c to allow environment variable expansion and multiple commands
CMD ["sh", "-c", "cat > config.js <<EOF && node index.js\nconsole.log(\"Loading Configuration...\");\nglobal.owner = '${OWNER_NUMBER:?OWNER_NUMBER env var not set}';\nglobal.mods = ['${OWNER_NUMBER}'];\nglobal.prems = ['${OWNER_NUMBER}'];\nglobal.nameowner = '${NAME_OWNER:?NAME_OWNER env var not set}';\nglobal.numberowner = '${OWNER_NUMBER}';\nglobal.namebot = '${NAME_BOT:?NAME_BOT env var not set}';\nglobal.sgc = 'https://chat.whatsapp.com/...';\nglobal.gc = 'https://chat.whatsapp.com/...';\nglobal.instagram = 'https://www.instagram.com/...';\nglobal.wm = \"${NAME_BOT}\";\nglobal.sessionName = 'session';\nglobal.prefix = '${PREFIX:-!}';\nglobal.pairingNum = process.env.PAIRING_NUMBER || \"\";\nglobal.APIs = { zenz: 'https://zenzapis.xyz' };\nglobal.APIKeys = { 'https://zenzapis.xyz': '${ZENZ_API_KEY:-YOUR_API_KEY}' };\nglobal.autoRecord = ${AUTO_RECORD:-false};\nglobal.autoTyping = ${AUTO_TYPING:-false};\nglobal.autoread = ${AUTO_READ:-false};\nglobal.public = ${PUBLIC_MODE:-true};\nglobal.readsw = ${READSW_OWNER_ONLY:-false};\nglobal.mods = process.env.MODS ? process.env.MODS.split(',') : ['${OWNER_NUMBER}'];\nglobal.prems = process.env.PREMS ? process.env.PREMS.split(',') : ['${OWNER_NUMBER}'];\nconsole.log(\"Owner:\", global.owner);\nconsole.log(\"Bot Name:\", global.namebot);\nconsole.log(\"Prefix:\", global.prefix);\nconsole.log(\"Configuration Loaded.\");\nlet file = require.resolve(__filename);\n//fs.watchFile(file, () => { fs.unwatchFile(file); console.log(chalk.redBright(\\`Update'\${__filename}'\\`)); delete require.cache[file]; require(file) }); // Commented out watchFile\nEOF\n"]
