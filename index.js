require('dotenv').config(); // Load .env file first
require('./config'); // Then load hardcoded config.js

const { default: makeWASocket, useMultiFileAuthState, DisconnectReason, fetchLatestBaileysVersion, makeInMemoryStore, jidDecode, proto, getAggregateVotesInPollMessage } = require("@whiskeysockets/baileys");
const fs = require('fs');
const pino = require('pino');
const chalk = require('chalk');
const path = require('path');
const _ = require('lodash'); // lodash might not be used, potential removal
const { Boom } = require('@hapi/boom');
const PhoneNumber = require('awesome-phonenumber'); // Check if used by message handler or commands
const { smsg, isUrl, generateMessageTag, getBuffer, getSizeMedia, fetchJson, await, sleep } = require('./lib/Function'); // Ensure this path and functions are correct
const express = require('express');
const qrcode = require('qrcode');
const qrcodeTerminal = require('qrcode-terminal'); // Only needed if printQRInTerminal: false
const cfonts = require("cfonts"); // For banner
const mongoose = require("mongoose"); // For DB
const { QuickDB } = require("quick.db"); // For QuickDB
const SqliteDriver = require('quick.db/src/drivers/Sqlite.js'); // Driver for QuickDB

// --- Globals and Setup ---
let currentQR = null;
let lastConnectionStatus = null;
let botStartTime = Date.now();
let client = null; // Keep a reference to the socket

const MONGODB_URI = process.env.MONGODB_URI || global.mongodb; // Get from ENV or config.js
const prefix = process.env.PREFIX || global.prefa || '!'; // Get from ENV or config.js or default
const sessionId = process.env.SESSION_ID || global.sessionName || 'session'; // Get from ENV or config.js or default
const sessionDir = path.join(__dirname, sessionId); // Use sessionId for directory name

console.log(chalk.blueBright(`Session ID: ${sessionId}`));
console.log(chalk.blueBright(`Session Directory: ${sessionDir}`));
console.log(chalk.blueBright(`Command Prefix: ${prefix}`));

// Ensure session directory exists
if (!fs.existsSync(sessionDir)){
    fs.mkdirSync(sessionDir, { recursive: true }); // Use recursive if needed
    console.log(chalk.green(`Created session directory: ${sessionDir}`));
}

// --- QuickDB Initialization ---
const dbFilePath = path.join(sessionDir, 'quickdb.sqlite'); // Store DB in session dir
console.log(chalk.yellow(`[QuickDB] Using database file: ${dbFilePath}`));
try {
    const driver = new SqliteDriver({ filePath: dbFilePath });
    global.db = new QuickDB({ driver }); 
    console.log(chalk.green("[QuickDB] Initialized successfully with SQLite driver."));
} catch (dbErr) {
    console.error(chalk.redBright("[QuickDB] Failed to initialize SQLite driver:"), dbErr);
    console.warn(chalk.yellow("[QuickDB] Falling back to default JSON driver (may not persist well in Docker)."));
    global.db = new QuickDB(); // Fallback
}

// --- Mongoose and Discord-XP Setup ---
global.Levels = require("discord-xp");
global.user = require("./models/user"); // Mongoose user model

async function connectMongo() {
    if (!MONGODB_URI) {
        console.warn(chalk.yellow("[DB Setup] MONGODB_URI not set. MongoDB features (Mongoose, discord-xp) disabled."));
        return false;
    }
    try {
        console.log(chalk.yellow("[Mongoose] Attempting connection..."));
        await mongoose.connect(MONGODB_URI);
        console.log(chalk.green("[Mongoose] Connection Successful!"));
        
        console.log(chalk.yellow("[Discord-XP] Setting MongoDB URL..."));
        await Levels.setURL(MONGODB_URI); // Set URL after successful mongoose connection
        console.log(chalk.green("[Discord-XP] MongoDB URL set."));
        return true;
    } catch (err) {
        console.error(chalk.redBright("[DB Setup] Error connecting to MongoDB or setting discord-xp URL:"), err);
        console.warn(chalk.yellow("[DB Setup] MongoDB features might not work correctly."));
        return false;
    }
}

// --- Command Loader --- (Adapted from heart.js)
const Commands = new Collection();
Commands.prefix = prefix; // Set prefix

const readCommands = () => {
  let dir = path.join(__dirname, "./Organs/commands"); // Adjust path if needed
  if (!fs.existsSync(dir)) {
      console.warn(chalk.yellow(`Commands directory not found: ${dir}`));
      return;
  }
  let dirs = fs.readdirSync(dir);
  let cmdlist = {};
  console.log(chalk.blueBright(`Loading commands from: ${dir}`));
  try {
    dirs.forEach(async (res) => {
      let groups = res.toLowerCase();
      const categoryDir = path.join(dir, res);
      if (!fs.statSync(categoryDir).isDirectory()) return; // Skip files, only process directories

      Commands.category = dirs.filter((v) => fs.statSync(path.join(dir, v)).isDirectory()).map((v) => v);
      cmdlist[groups] = [];
      let files = fs
        .readdirSync(categoryDir)
        .filter((file) => file.endsWith(".js"));
        
      console.log(chalk.cyan(`> Loading category: ${groups} (${files.length} commands)`));
      for (const file of files) {
        const filePath = path.join(categoryDir, file);
        try { 
          const command = require(filePath);
          if (!command || !command.name || !command.start) {
              console.warn(chalk.yellow(`--> Invalid command structure in ${file}, skipping.`));
              continue;
          }
          cmdlist[groups].push(command);
          Commands.set(command.name, command);
          // console.log(chalk.greenBright(`--> Loaded: ${command.name}`)); // Optional: verbose logging
        } catch (loadErr) {
           console.error(chalk.redBright(`--> Failed to load command ${file}:`), loadErr);
        }
        await sleep(5); // Small delay
      }
    });
    Commands.list = cmdlist;
    console.log(chalk.green(`Total commands loaded: ${Commands.size}`));
  } catch (e) {
    console.error(chalk.redBright("Error reading commands directory structure:"), e);
  }
};

// --- Main Bot Function ---
async function startNezuko() {
    console.log(chalk.greenBright("Attempting to start Nezuko bot (UcoreAI)..."));
    
    await connectMongo(); // Connect DB before starting Baileys
    readCommands(); // Load commands

    const { state, saveCreds } = await useMultiFileAuthState(sessionDir);
    // Low-level store for Baileys internal message data
    const store = makeInMemoryStore({ logger: pino().child({ level: 'silent', stream: 'store' }) });

    let { version, isLatest } = await fetchLatestBaileysVersion();
    console.log(chalk.blueBright(`[Baileys] Using WA v${version.join('.')}, isLatest: ${isLatest}`));

    client = makeWASocket({ // Assign to the outer 'client' variable
        logger: pino({ level: 'silent' }), // Change to 'debug' for verbose Baileys logs
        printQRInTerminal: false, // We use the web server
        browser: [global.namebot || 'UcoreAI','Safari','3.0'],
        auth: state,
        version,
        getMessage: async (key) => {
            // Ensure remoteJid is not undefined before accessing store
            if (!key.remoteJid) return undefined; 
            const msg = await store.loadMessage(key.remoteJid, key.id);
            return msg?.message || undefined;
        },
    });

    store?.bind(client.ev);

    // --- CFonts Banner --- (Moved here from heart.js)
    const randomHexs = `#${((Math.random() * 0xffffff) << 0).toString(16).padStart(6, "0")}`;
    const randomHex = `#${((Math.random() * 0xffffff) << 0).toString(16).padStart(6, "0")}`;
    const randomHexx = `#${((Math.random() * 0xffffff) << 0).toString(16).padStart(6, "0")}`;
    cfonts.say(`${global.namebot || 'NEZUKO'}\n\nBY\n\nUcoreAI`, { // Use bot name from config
        font: "block", align: "center", colors: [randomHex, randomHexs],
        background: "transparent", letterSpacing: 1, lineHeight: 1, space: true,
        maxLength: "0", gradient: [randomHex, randomHexs, randomHexx],
        independentGradient: false, transitionGradient: true, env: "node",
    });

    // --- Load Message Handler ---
    let messageHandler;
    try {
        const messageHandlerModule = require('./handler/MessageHandler.js');
        // *** IMPORTANT: Use the correct export name based on your MessageHandler.js ***
        if (messageHandlerModule && typeof messageHandlerModule.messageHandler === 'function') {
             messageHandler = messageHandlerModule.messageHandler; // Assign the function
             console.log(chalk.green("Loaded main message handler from handler/MessageHandler.js"));
        } else if (messageHandlerModule && typeof messageHandlerModule === 'function') {
            // Handle case where module.exports = async function()...
            messageHandler = messageHandlerModule; 
            console.log(chalk.green("Loaded main message handler (default export) from handler/MessageHandler.js"));
        }
         else {
            throw new Error("Exported message handler not found or not a function.");
        }
    } catch (e) {
        console.error(chalk.redBright("Critical error requiring/loading handler/MessageHandler.js:"), e);
        messageHandler = (cli, chatUpdate) => { // Basic fallback handler
             console.log(chalk.magenta("Basic fallback msg log:"), JSON.stringify(chatUpdate, undefined, 2));
        };
    }

    // --- Baileys Event Listeners ---
    client.ev.on('messages.upsert', async (chatUpdate) => {
        if (!chatUpdate.messages) return;
        const m = smsg(client, chatUpdate.messages[0], store); // Use smsg wrapper

        if (!m || !m.message) return;
        if (m.key && m.key.remoteJid == "status@broadcast") return;
        if (m.key.id.startsWith("BAE5") && m.key.id.length === 16) return;
        if (m.key.id.startsWith("3EB0") && m.key.id.length === 12) return;

        try {
            await messageHandler(client, m, Commands, chatUpdate); // Call the loaded handler
        } catch (e) {
            console.error(chalk.redBright("Error executing message handler:"), e);
        }
    });

    client.ev.on('connection.update', async (update) => {
        const { connection, lastDisconnect, qr } = update;
        const statusPrefix = chalk.cyanBright(`[Connection Update]`); 
        console.log(`${statusPrefix} status: ${connection || 'undefined'}`);
        currentQR = qr || null; // Update QR
        lastConnectionStatus = connection || lastConnectionStatus; // Update status

        if (connection === 'close') {
            let reasonCode = new Boom(lastDisconnect?.error)?.output?.statusCode || 500; // Default to 500 if unknown
            let reasonText = DisconnectReason[reasonCode] || 'Unknown';
            console.error(chalk.redBright(`Connection closed! Reason: ${reasonText} (${reasonCode})`), lastDisconnect?.error);
            
            const shouldReconnect = ![
                DisconnectReason.loggedOut, 
                DisconnectReason.connectionReplaced, 
                DisconnectReason.badSession, 
                DisconnectReason.multideviceMismatch, // Indicates potential auth issue
                DisconnectReason.badSession // Duplicate, but explicit
            ].includes(reasonCode);

            if (shouldReconnect) {
                console.log(chalk.yellowBright("Attempting to reconnect in 5 seconds..."));
                await sleep(5000);
                // Don't call startNezuko recursively, let the process manager (like pm2 or Docker restart policy) handle it if needed.
                // For simple restart:
                process.exit(1); // Exit, Docker/Elestio should restart it
            } else {
                console.log(chalk.redBright(`FATAL: Unrecoverable connection error (${reasonText}). Please delete session folder (${sessionDir}) and restart.`));
                process.exit(1); // Exit on unrecoverable errors
            }
        } else if (connection === 'open') {
            console.log(chalk.greenBright(`Successfully Connected to WA! Logged in as: ${client.user?.id?.split(':')[0] || client.user?.id || 'Unknown'}`));
            console.log(chalk.blueBright(`QR Code page at http://<your-elestio-url>/qr should now show 'Connected!'`));
        }
        
        if (qr) {
           console.log(chalk.yellowBright("[QR Update] New QR code received. Scan needed via /qr page."));
        }
    });

    client.ev.on('creds.update', saveCreds);
    client.ev.on('error', (err) => console.error(chalk.redBright("Socket Error:"), err));

    // Group Participants Update Handler (Moved from heart.js)
    client.ev.on("group-participants.update", async (m) => {
        try { 
            const WelcomeHandler = require("./handler/EventHandler"); // Load fresh? Or load once outside?
            if (typeof WelcomeHandler === 'function') {
                 await WelcomeHandler(client, m);
            }
        } catch (eventErr) {
            console.error("Error in group-participants.update handler:", eventErr);
        }
    });

    // Contacts Update Handler (Moved from heart.js)
     client.ev.on("contacts.update", async (update) => {
        if (!MONGODB_URI) return; // Skip if no DB connected
        for (let contact of update) {
           let id = client.decodeJid(contact.id);
           if (!id || id.includes('@g.us') || id.includes('@broadcast')) continue; // Skip groups/broadcasts
           try {
               const usr = await global.user.findOne({ id: id });
               const contactName = contact.notify || contact.verifiedName || contact.name || id.split('@')[0];
               if (!usr) {
                   await new global.user({ id: id, name: contactName }).save();
                   // console.log(`[DB] Added contact: ${contactName} (${id})`);
               } else if (usr.name !== contactName) {
                   await global.user.updateOne({ id: id }, { name: contactName });
                   // console.log(`[DB] Updated contact: ${contactName} (${id})`);
               }
           } catch (dbErr) {
               console.error(`[DB] Error updating contact ${id}:`, dbErr);
           }
        }
    });

     // Add utility functions directly to client instance (optional, but keeps pattern)
     client.decodeJid = (jid) => {
        // ...(keep existing implementation)...
         if (!jid) return jid;
         if (/:\d+@/gi.test(jid)) {
           let decode = jidDecode(jid) || {};
           return (
             (decode.user && decode.server && decode.user + "@" + decode.server) ||
             jid
           );
         } else return jid;
     };
      client.downloadMediaMessage = async (message) => {
        // ...(keep existing implementation from heart.js)...
         let mime = (message.msg || message).mimetype || "";
         let messageType = message.mtype
           ? message.mtype.replace(/Message/gi, "")
           : mime.split("/")[0];
         const stream = await downloadContentFromMessage(message, messageType);
         let buffer = Buffer.from([]);
         for await (const chunk of stream) {
           buffer = Buffer.concat([buffer, chunk]);
         }
         return buffer;
      };
      // Add sendFile, sendText etc. if needed, adapted from heart.js

    console.log(chalk.green("Nezuko initialization sequence complete. Waiting for connection events..."));
    return client; // Return the initialized socket
}

// --- Web Server Setup ---
const app = express();
const webServerPort = process.env.PORT || 8080; // Ensure this is the port Elestio exposes

app.get('/qr', async (req, res) => {
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    let qrImageData = null;
    let currentStatus = lastConnectionStatus || 'Initializing...';
    let statusMessage = `Bot: ${global.namebot || 'Nezuko'} | Status: ${currentStatus}`;
    let pageRefresh = (currentStatus === 'open') ? 300 : 10; // Longer refresh if connected

    if (currentStatus === 'open') {
        statusMessage = `<span style="color: green; font-weight: bold;">CONNECTED!</span><br>Bot Name: ${global.namebot || 'Nezuko'}<br>Owner: ${global.nameowner || 'Unknown'} (${global.numberowner || 'N/A'}).<br>You can close this page.`;
    } else if (currentQR) {
        statusMessage = 'Scan the QR code below with WhatsApp:';
        try {
            qrImageData = await qrcode.toDataURL(currentQR, { errorCorrectionLevel: 'L' }); // Use L for faster generation
        } catch (err) {
            console.error("Error generating QR code image for web:", err);
            statusMessage = '<span style="color: red;">Error generating QR code image. Check logs.</span>';
        }
    } else if (currentStatus.startsWith('close')) {
        statusMessage = `<span style="color: red;">Connection Closed: ${currentStatus}. Bot may attempt to reconnect... Check logs.</span>`;
    } else if (currentStatus === 'connecting') {
        statusMessage = 'Connecting to WhatsApp... Waiting for QR Code...';
    } else {
        statusMessage = 'Initializing connection... Waiting for QR code... Page will refresh.';
    }

    // Send HTML page
    res.send(`<!DOCTYPE html>
        <html>
        <head>
            <title>WhatsApp QR Code - ${global.namebot || 'Nezuko'}</title>
            <meta http-equiv="refresh" content="${pageRefresh}">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <style>
                body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, 'Open Sans', 'Helvetica Neue', sans-serif; display: flex; flex-direction: column; align-items: center; padding-top: 30px; background-color: #f7f7f7; color: #333; }
                img { border: 1px solid #ddd; margin-bottom: 20px; max-width: 90%; height: auto; background-color: white; padding: 10px; box-shadow: 0 4px 8px rgba(0,0,0,0.1); }
                h1 { color: #555; }
                .status { margin-bottom: 20px; font-size: 1.1em; line-height: 1.6em; background-color: #fff; padding: 20px; border-radius: 8px; box-shadow: 0 2px 4px rgba(0,0,0,0.05); max-width: 90%; width: 500px; text-align: center; border: 1px solid #eee; }
                p { color: #777; font-size: 0.9em; }
            </style>
        </head>
        <body>
            <h1>Link Bot: ${global.namebot || 'Nezuko'}</h1>
            <div class="status">${statusMessage}</div>
            ${qrImageData ? `<img src="${qrImageData}" alt="WhatsApp QR Code">` : '<p>No QR Code to display currently.</p>'}
            <p>(Page auto-refreshes every ${pageRefresh} seconds)</p>
         </body>
        </html>`);
});

app.get('/', (req, res) => res.redirect('/qr'));

app.listen(webServerPort, '0.0.0.0', () => { // Listen on all interfaces
    console.log(chalk.blueBright(`QR Code Web Server listening on internal port ${webServerPort}`));
    console.log(chalk.blueBright(`Access QR page at /qr on your service URL (e.g., http://nezuko-u40295.vm.elestio.app/qr)`));
});

// --- Start the Bot ---
startNezuko().catch(err => {
    console.error(chalk.redBright("-----------------------------------------"));
    console.error(chalk.redBright(" FATAL ERROR DURING BOT STARTUP SEQUENCE "));
    console.error(chalk.redBright("-----------------------------------------"));
    console.error(err);
    process.exit(1); // Exit if startup fails critically
});

// --- Graceful Shutdown (Optional but Recommended) ---
process.on('SIGINT', async () => {
  console.log(chalk.yellow("SIGINT received, shutting down..."));
  await client?.logout()?.catch(()=>{}); // Attempt logout
  await mongoose?.disconnect()?.catch(()=>{}); // Disconnect DB
  process.exit(0);
});
process.on('SIGTERM', async () => {
  console.log(chalk.yellow("SIGTERM received, shutting down..."));
  await client?.logout()?.catch(()=>{});
  await mongoose?.disconnect()?.catch(()=>{});
  process.exit(0);
});
process.on('uncaughtException', (err, origin) => {
  console.error(chalk.redBright(`UNCAUGHT EXCEPTION at: ${origin}`), err);
  // Consider whether to exit or just log, depending on severity
  // process.exit(1); 
});
process.on('unhandledRejection', (reason, promise) => {
  console.error(chalk.redBright('Unhandled Rejection at:'), promise, 'reason:', reason);
  // process.exit(1);
});
