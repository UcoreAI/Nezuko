console.log("Loading Static Configuration...");

global.owner = '60108378525' // Your Number
global.mods = ['60108378525'] // Moderator Numbers
global.prems = ['60108378525'] // Premium Numbers
global.nameowner = 'Aisha' // <<<--- REPLACE 'Your Name' WITH YOUR ACTUAL NAME!
global.numberowner = '60108378525' // Your Number Again
global.namebot = 'UcoreAI' // Bot Name
global.sgc = 'https://chat.whatsapp.com/...' // Group Link (Optional, leave default)
global.gc = 'https://chat.whatsapp.com/...' // Group Link 2 (Optional, leave default)
global.instagram = 'https://www.instagram.com/...' // Optional
global.wm = "UcoreAI" // Watermark (Uses Bot Name)

// Session Name (Should match Volume Mount Path)
global.sessionName = 'session' // Do not change unless you change volume path

// Other Settings
global.prefix = '!' // Your chosen prefix
global.pairingNum = "" // Optional Pairing Number

// API keys (Add if needed, otherwise leave defaults)
global.APIs = {
    zenz: 'https://zenzapis.xyz',
}
global.APIKeys = {
    'https://zenzapis.xyz': 'YOUR_API_KEY', // Replace if you have one
}

// Bot Settings
global.autoRecord = false
global.autoTyping = false
global.autoread = false
global.public = true
global.readsw = false
global.mods = ['60108378525']
global.prems = ['60108378525']

console.log("Static Configuration Loaded.");

// --- Thumbnail (Keep defaults) ---
global.flaming = 'https://www6.flamingtext.com/net-fu/proxy_form.cgi?&imageoutput=true&script=sketch-name&doScale=true&scaleWidth=800&scaleHeight=500&fontsize=100&text='
global.fluming = 'https://www6.flamingtext.com/net-fu/proxy_form.cgi?&imageoutput=true&script=fluffy-logo&doScale=true&scaleWidth=800&scaleHeight=500&fontsize=100&text='
global.flarun = 'https://www6.flamingtext.com/net-fu/proxy_form.cgi?&imageoutput=true&script=runner-logo&doScale=true&scaleWidth=800&scaleHeight=500&fontsize=100&text='
global.flasmurf = 'https://www6.flamingtext.com/net-fu/proxy_form.cgi?&imageoutput=true&script=smurfs-logo&doScale=true&scaleWidth=800&scaleHeight=500&fontsize=100&text='
// --- End Thumbnail ---

// Remove file watching
// let file = require.resolve(__filename)
// fs.watchFile(file, () => { fs.unwatchFile(file); console.log(chalk.redBright(\`Update'\${__filename}'\`)); delete require.cache[file]; require(file) });
