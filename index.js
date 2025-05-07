require('./config'); // Load hardcoded config.js first
const { default: makeWASocket, useMultiFileAuthState, DisconnectReason, fetchLatestBaileysVersion, makeInMemoryStore, jidDecode, proto, getAggregateVotesInPollMessage } = require("@whiskeysockets/baileys");
const fs = require('fs');
const pino = require('pino');
const chalk = require('chalk');
const path = require('path');
const axios = require('axios'); 
const _ = require('lodash');
const { Boom } = require('@hapi/boom');
const PhoneNumber = require('awesome-phonenumber');
const { smsg, isUrl, generateMessageTag, getBuffer, getSizeMedia, fetchJson, await, sleep } = require('./lib/Function'); // Use Function.js
const express = require('express');
const qrcode = require('qrcode');

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


async function startNezuko() {
    console.log(chalk.greenBright("Attempting to start Nezuko bot..."))
    console.log(chalk.yellow(`Using session directory: ${sessionDir}`));
    const { state, saveCreds } = await useMultiFileAuthState(sessionDir); 

    // ---- DEFINE store INSIDE startNezuko ----
    const store = makeInMemoryStore({ logger: pino().child({ level: 'silent', stream: 'store' }) });
    // -----------------------------------------

    const sock = makeWASocket({
        logger: pino({ level: 'silent' }),
        printQRInTerminal: true, 
        browser: [global.namebot || 'UcoreAI','Safari','1.0.0'], 
        auth: state,
        // Provide store functions to Baileys
        getMessage: async (key) => {
            // ---- Use store variable defined above ----
            const msg = await store.loadMessage(key.remoteJid, key.id);
            // -------------------------------------------
            return msg?.message || undefined;
        },
    });

    // --- Bind store events AFTER sock is defined ---
    store?.bind(sock.ev);
    // ---------------------------------------------

    // --- Use Nezuko's message handler ---
    const messageHandlerPath = path.join(__dirname, 'handler', 'handler.js');
    if (fs.existsSync(messageHandlerPath)) {
        const messageHandler = require(messageHandlerPath);
        if (typeof messageHandler === 'function') {
            console.log("Binding message handler from handler/handler.js...");
            messageHandler(sock, store); 
        } else {
            console.error("Error: handler/handler.js found but does not export a function.");
        }
    } else {
        console.error("Error: handler/handler.js not found. Basic message logging only.");
         sock.ev.on('messages.upsert', async m => {
             console.log("Received message (basic handler):", JSON.stringify(m, undefined, 2));
         });
    }
    // ------------------------------------

    sock.ev.on('connection.update', async (update) => {
        const { connection, lastDisconnect, qr } = update
        console.log(`Connection update: ${connection || 'Unknown status'}`); 

        if (qr) {
            console.log(chalk.yellowBright("QR code received from Baileys."));
            currentQR = qr;
        }
        lastConnectionStatus = connection || lastConnectionStatus; 

        if (connection === 'close') {
             let reason = new Boom(lastDisconnect?.error)?.output.statusCode
             console.log(chalk.redBright(`Connection closed, reason: ${reason}`))
             currentQR = null; 
             lastConnectionStatus = `close - ${reason}`;
             
             const shouldReconnect = (reason !== DisconnectReason.loggedOut && reason !== DisconnectReason.connectionReplaced && reason !== DisconnectReason.badSession);

             if (shouldReconnect) {
                 console.log("Attempting to reconnect...");
                 await sleep(5000); 
                 startNezuko().catch(err => console.error("Error during reconnect attempt:", err)); 
             } else {
                  console.log("Not reconnecting due to logout/replacement/bad session.");
             }
        } else if (connection === 'open') {
             console.log(chalk.greenBright(`Successfully Connected to WA! Logged in as: ${sock.user?.id?.split(':')[0] || sock.user?.id || 'Unknown'}`));
             console.log(chalk.blueBright(`QR Code page at http://<your-elestio-url>/qr will show connected.`));
             currentQR = null; 
        }
    })

    sock.ev.on('creds.update', saveCreds)

    sock.ev.on('error', (err) => {
        console.error(chalk.redBright("Socket Error:"), err);
    });
    
    return sock
}

// --- Setup Express Web Server ---
const app = express();
const webServerPort = process.env.PORT || 8080; 

app.get('/qr', async (req, res) => {
    res.setHeader('Content-Type', 'text/html');
    let qrImageData = null;
    let statusMessage = `Current Status: ${lastConnectionStatus || 'Initializing...'}`;
    let pageRefresh = 10; 

    if (lastConnectionStatus === 'open') {
        statusMessage = `<span style="color: green; font-weight: bold;">CONNECTED!</span><br>Bot Name: ${global.namebot}<br>Owner: ${global.nameowner} (${global.numberowner})<br>You can close this page.`;
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

    // Send HTML page
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
     // Redirect root to the QR page
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

// File watching (Keep commented out for Docker)
// let file = require.resolve(__filename)
// fs.watchFile(file, () => {
//     fs.unwatchFile(file)
//     console.log(chalk.redBright(\`Update \${__filename}\`))
//     delete require.cache[file]
//     require(file) 
// })
