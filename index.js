require('./config'); // Load hardcoded config.js first
const { default: makeWASocket, useMultiFileAuthState, DisconnectReason, fetchLatestBaileysVersion, makeInMemoryStore, jidDecode, proto, getAggregateVotesInPollMessage } = require("@whiskeysockets/baileys");
const fs = require('fs');
const pino = require('pino');
const chalk = require('chalk');
const path = require('path');
// const axios = require('axios'); // axios might not be needed if not sending QR externally
const _ = require('lodash');
const { Boom } = require('@hapi/boom');
const PhoneNumber = require('awesome-phonenumber');
const { smsg, isUrl, generateMessageTag, getBuffer, getSizeMedia, fetchJson, await, sleep } = require('./lib/Function'); 
const express = require('express');
const qrcode = require('qrcode'); // For generating QR image for the web page
const qrcodeTerminal = require('qrcode-terminal'); // For console QR

// --- Variable to store the latest QR string ---
let currentQR = null; 
let lastConnectionStatus = null;
let botStartTime = Date.now(); 
// --------------------------------------------------

// --- Make session directory if needed ---
const sessionDir = path.join(__dirname, global.sessionName || 'session');
if (!fs.existsSync(sessionDir)){
    fs.mkdirSync(sessionDir);
    console.log(`Created session directory: ${sessionDir}`);
}
// -----------------------------------------

// --- Store --- Use InMemoryStore for basic message handling
// const store = makeInMemoryStore({ logger: pino().child({ level: 'silent', stream: 'store' }) });
// Note: Nezuko's original index.js might set up its own store or not use one prominently.
// For now, we'll initialize a basic one if needed by Baileys, but message handling will be key.

async function startNezuko() {
    console.log(chalk.greenBright("Attempting to start Nezuko bot..."))
    console.log(chalk.yellow(`Using session directory: ${sessionDir}`));
    const { state, saveCreds } = await useMultiFileAuthState(sessionDir); 

    // --- Define store here to be in scope ---
    const store = makeInMemoryStore({ logger: pino().child({ level: 'silent', stream: 'store' }) });
    // ----------------------------------------

    const sock = makeWASocket({
        logger: pino({ level: 'silent' }),
        printQRInTerminal: false, // Set to false, we will handle QR display
        browser: [global.namebot || 'UcoreAI','Safari','1.0.0'], 
        auth: state,
        getMessage: async (key) => {
            const msg = await store.loadMessage(key.remoteJid, key.id);
            return msg?.message || undefined;
        },
    });

    // --- Bind store events AFTER sock is defined ---
    store?.bind(sock.ev);
    // ---------------------------------------------

    // --- Connection Update Logic (Handles QR, Connect, Disconnect) ---
    sock.ev.on('connection.update', async (update) => {
        const { connection, lastDisconnect, qr } = update;
        console.log(chalk.cyanBright(`Connection update: ${connection || 'Unknown status'}`));

        if (qr) {
            console.log(chalk.yellowBright("QR code string received from Baileys. Web page will update."));
            qrcodeTerminal.generate(qr, { small: true }); // Also print to console for easy debugging
            currentQR = qr; // Store for web server
        }
        lastConnectionStatus = connection || lastConnectionStatus;

        if (connection === 'close') {
            let reason = new Boom(lastDisconnect?.error)?.output.statusCode;
            console.log(chalk.redBright(`Connection closed, reason: ${reason}, Error: ${lastDisconnect?.error}`));
            currentQR = null;
            lastConnectionStatus = `close - ${reason}`;
            
            const shouldReconnect = (
                reason !== DisconnectReason.loggedOut &&
                reason !== DisconnectReason.connectionReplaced &&
                reason !== DisconnectReason.badSession &&
                reason !== DisconnectReason.multideviceMismatch // Added this
            );

            if (shouldReconnect) {
                console.log(chalk.yellowBright("Attempting to reconnect..."));
                await sleep(5000);
                startNezuko().catch(err => console.error(chalk.redBright("Error during reconnect attempt:"), err));
            } else {
                console.log(chalk.redBright("Not reconnecting. Please check the reason. If logged out, delete session and restart."));
            }
        } else if (connection === 'open') {
            console.log(chalk.greenBright(`Successfully Connected to WA! Logged in as: ${sock.user?.id?.split(':')[0] || sock.user?.id || 'Unknown'}`));
            console.log(chalk.blueBright(`QR Code page at http://<your-elestio-url>/qr will now show 'Connected!'`));
            currentQR = null; // Clear QR as we are connected
        }
    });

    // --- Credentials Update ---
    sock.ev.on('creds.update', saveCreds);

    // --- Message Upsert (Main Message Handling Logic from original Nezuko) ---
    // This is where the bot processes incoming messages.
    // The original Nezuko bot likely has a complex handler here.
    // We'll put a placeholder. If the original Nezuko's index.js has 
    // 'sock.ev.on('messages.upsert', async (mek) => { ... })' or similar,
    // that ENTIRE block of code should be adapted and placed here.
    // For now, let's assume the original message handling is done via a function 
    // called 'messageUpsertHandler' which we would need to find or define.
    // The actual message handling logic for Nezuko is in its `handler/message.js` 
    // and called from an event emitter setup, often through `index.js` or `main.js`.
    // We need to ensure that handler is called correctly.
    
    // Let's try to load and use the handler/message.js as intended
    try {
        const messageHandlerModule = require('./handler/message.js'); // Path to original handler
        if (messageHandlerModule && typeof messageHandlerModule.messageHandler === 'function') {
             console.log("Binding original message handler from handler/message.js...");
             sock.ev.on('messages.upsert', async (chatUpdate) => {
                 // The original handler might expect 'mek' or a different structure.
                 // We might need to adapt how chatUpdate is passed.
                 // For now, assume it takes (sock, chatUpdate, store)
                 try {
                    await messageHandlerModule.messageHandler(sock, chatUpdate, store);
                 } catch (e) {
                    console.error(chalk.redBright("Error in message handler:"), e);
                 }
             });
        } else {
            console.error(chalk.yellowBright("Original message handler (handler/message.js or its export) not found or not a function. Using basic logging."));
            sock.ev.on('messages.upsert', async m => {
                console.log(chalk.magentaBright("Received message (basic fallback):"), JSON.stringify(m, undefined, 2));
            });
        }
    } catch (e) {
        console.error(chalk.redBright("Error requiring handler/message.js:"), e);
        sock.ev.on('messages.upsert', async m => { // Fallback
            console.log(chalk.magentaBright("Received message (critical fallback):"), JSON.stringify(m, undefined, 2));
        });
    }
    // --- End Message Handling ---

    sock.ev.on('error', (err) => {
        console.error(chalk.redBright("Socket Error:"), err);
    });
    
    return sock;
}

// --- Setup Express Web Server for QR Code ---
const app = express();
const webServerPort = process.env.PORT || 8080; 

app.get('/qr', async (req, res) => {
    res.setHeader('Content-Type', 'text/html');
    let qrImageData = null;
    let statusMessage = `Bot: ${global.namebot} | Status: ${lastConnectionStatus || 'Initializing...'}`;
    let pageRefresh = 10; 

    if (lastConnectionStatus === 'open') {
        statusMessage = `<span style="color: green; font-weight: bold;">CONNECTED!</span><br>Bot Name: ${global.namebot}<br>Owner: ${global.nameowner} (${global.numberowner}).<br>You can close this page.`;
        currentQR = null; 
        pageRefresh = 300; 
    } else if (currentQR) {
         statusMessage = 'Scan the QR code below with WhatsApp:';
        try {
            console.log("Generating QR image for web request...");
            qrImageData = await qrcode.toDataURL(currentQR);
        } catch (err) {
            console.error("Error generating QR code image for web:", err);
            statusMessage = '<span style="color: red;">Error generating QR code image.</span>';
        }
    } else if (lastConnectionStatus && lastConnectionStatus.startsWith('close')) {
         statusMessage = `<span style="color: red;">Connection Closed: ${lastConnectionStatus}. Bot is attempting to reconnect... Check logs.</span>`;
         pageRefresh = 20; 
    } else {
        statusMessage = 'Waiting for QR code... Page will refresh.';
    }

    res.send(\`
        <!DOCTYPE html>
        <html>
        <head>
            <title>WhatsApp QR Code - ${global.namebot || 'Bot'}</title>
            <meta http-equiv="refresh" content="\${pageRefresh}"> 
            <style>
                body { font-family: sans-serif; display: flex; flex-direction: column; align-items: center; margin-top: 30px; }
                img { border: 1px solid #ccc; margin-bottom: 20px; width: 300px; height: 300px; }
                p { color: #555; }
                .status { margin-bottom: 20px; font-size: 1.1em; line-height: 1.5em; background-color: #f0f0f0; padding: 15px; border-radius: 5px; max-width: 600px; text-align: center;}
            </style>
        </head>
        <body>
            <h1>Link Bot: ${global.namebot || 'WhatsApp Bot'}</h1>
            <div class="status">\${statusMessage}</div>
            \${qrImageData ? \`<img src="\${qrImageData}" alt="WhatsApp QR Code">\` : ''}
            <p>(Page auto-refreshes every \${pageRefresh} seconds)</p>
         </body>
        </html>
    \`);
});

 app.get('/', (req, res) => {
     res.redirect('/qr');
 });

app.listen(webServerPort, () => {
    console.log(chalk.blueBright(\`QR Code Web Server listening on internal port \${webServerPort}\`));
    console.log(chalk.blueBright(\`Visit http://<your-elestio-url>/qr to scan the code\`)); 
});
// --- End Express Web Server Setup ---


// --- Start the Bot ---
startNezuko().catch(err => {
   console.error(chalk.redBright("FATAL ERROR during bot startup:"), err);
});
// --------------------

process.on('unhandledRejection', (err) => {
    console.error(chalk.redBright('Unhandled Promise Rejection:'), err);
});
