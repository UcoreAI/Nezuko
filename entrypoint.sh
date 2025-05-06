#!/bin/sh

# Exit immediately if a command exits with a non-zero status.
set -e

# Create config.js from environment variables
# Use :? to ensure variables are set, otherwise exit with error
cat > config.js <<EOF
console.log("Loading Configuration...");

global.owner = '${OWNER_NUMBER:?OWNER_NUMBER environment variable is not set}' // Your Number
global.mods = ['${OWNER_NUMBER}'] // Moderator Numbers
global.prems = ['${OWNER_NUMBER}'] // Premium Numbers
global.nameowner = '${NAME_OWNER:?NAME_OWNER environment variable is not set}' // Your Name
global.numberowner = '${OWNER_NUMBER}' // Your Number Again
global.namebot = '${NAME_BOT:?NAME_BOT environment variable is not set}' // Bot Name
global.sgc = 'https://chat.whatsapp.com/...' // Group Link (Optional, replace or leave default)
global.gc = 'https://chat.whatsapp.com/...' // Group Link 2 (Optional, replace or leave default)
global.instagram = 'https://www.instagram.com/...' // Optional
global.wm = "${NAME_BOT}" // Watermark (Uses Bot Name)

// Session Name (Should match Volume Mount Path)
global.sessionName = 'session' // Do not change unless you change volume path

// Other Settings from config.js.example (using defaults or env vars if needed)
global.prefix = '${PREFIX:-!}' // Default to '!' if PREFIX env var not set
global.pairingNum = process.env.PAIRING_NUMBER || "" // Optional Pairing Number

// Default API keys (replace with actual keys in env vars if needed)
global.APIs = { 
    // Example: you would set ZENZ_API_KEY in Elestio env vars
	zenz: 'https://zenzapis.xyz',
}
global.APIKeys = {
	'https://zenzapis.xyz': '${ZENZ_API_KEY:-YOUR_API_KEY}', // Get key at https://zenzapis.xyz
}

// Auto Read/Typing/Recording settings
global.autoRecord = ${AUTO_RECORD:-false} 
global.autoTyping = ${AUTO_TYPING:-false} 
global.autoread = ${AUTO_READ:-false} 

// Public mode
global.public = ${PUBLIC_MODE:-true} 

// Read messages from owner only (optional, default false)
global.readsw = ${READSW_OWNER_ONLY:-false}

// Moderator settings (optional)
global.mods = process.env.MODS ? process.env.MODS.split(',') : ['${OWNER_NUMBER}']
global.prems = process.env.PREMS ? process.env.PREMS.split(',') : ['${OWNER_NUMBER}']


// Logging
console.log("Owner:", global.owner);
console.log("Bot Name:", global.namebot);
console.log("Prefix:", global.prefix);
console.log("Configuration Loaded.");

// --- Thumbnail --- Should be handled by volume mapping if needed ---
global.flaming = 'https://www6.flamingtext.com/net-fu/proxy_form.cgi?&imageoutput=true&script=sketch-name&doScale=true&scaleWidth=800&scaleHeight=500&fontsize=100&text='
global.fluming = 'https://www6.flamingtext.com/net-fu/proxy_form.cgi?&imageoutput=true&script=fluffy-logo&doScale=true&scaleWidth=800&scaleHeight=500&fontsize=100&text='
global.flarun = 'https://www6.flamingtext.com/net-fu/proxy_form.cgi?&imageoutput=true&script=runner-logo&doScale=true&scaleWidth=800&scaleHeight=500&fontsize=100&text='
global.flasmurf = 'https://www6.flamingtext.com/net-fu/proxy_form.cgi?&imageoutput=true&script=smurfs-logo&doScale=true&scaleWidth=800&scaleHeight=500&fontsize=100&text='
// --- End Thumbnail ---

let file = require.resolve(__filename)
fs.watchFile(file, () => {
	fs.unwatchFile(file)
	console.log(chalk.redBright(`Update'${__filename}'`))
	delete require.cache[file]
	require(file)
})
EOF

echo "config.js generated successfully."

# Execute the main application command passed from the Dockerfile CMD
# This runs "node index.js"
echo "Executing command: $@"
exec "$@"
