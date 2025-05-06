require('./config') // Existing config load - KEEP THIS
const { default: makeWASocket, useMultiFileAuthState, DisconnectReason, fetchLatestBaileysVersion, generateForwardMessageContent, prepareWAMessageMedia, generateWAMessageFromContent, generateMessageID, downloadContentFromMessage, makeInMemoryStore, jidDecode, proto, getAggregateVotesInPollMessage } = require("@whiskeysockets/baileys")
const fs = require('fs')
const pino = require('pino')
const chalk = require('chalk')
const path = require('path')
const axios = require('axios'); 
const _ = require('lodash')
const { Boom } = require('@hapi/boom')
const PhoneNumber = require('awesome-phonenumber')
const { smsg, isUrl, generateMessageTag, getBuffer, getSizeMedia, fetchJson, await, sleep } = require('./lib/Function')

// --- NEW: Require Express and QR Code Generator ---
const express = require('express');
const qrcode = require('qrcode');
// ----------------------------------------------------

let Komari = require('./Control') // Assuming Control.js is used for main logic

// --- NEW: Variable to store the latest QR string ---
let currentQR = null; 
let lastConnectionStatus = null;
// --------------------------------------------------

async function startNezuko() {
    console.log(chalk.greenBright("Attempting to start Nezuko bot..."))
    const { state, saveCreds } = await useMultiFileAuthState(`./${global.sessionName}`)

    const sock = makeWASocket({
        logger: pino({ level: 'silent' }),
        printQRInTerminal: true, // Keep true for console debugging
        browser: [global.namebot || 'UcoreAI','Safari','1.0.0'], // Use bot name from config
        auth: state,
        getMessage: async key => {
            // Placeholder if store is not used or implemented elsewhere
            return { conversation: 'hello' }
        }
    })

    // Komari seems to be the main handler in the original code
    if (Komari && typeof Komari.Komari === 'function') {
        console.log("Initializing main bot handler (Komari)...")
        Komari.Komari(sock) // Pass sock to the handler
    } else {
         console.error("Error: Main bot handler (Komari) not found or is not a function.");
         // Add basic message handling here if Komari is missing/wrong
         sock.ev.on('messages.upsert', async m => {
             console.log("Received message (basic handler):", JSON.stringify(m, undefined, 2));
         });
    }


    sock.ev.on('connection.update', async (update) => {
        const { connection, lastDisconnect, qr } = update
        console.log(`Connection update: ${connection || 'Unknown status'}`); // Log status

        // Store the latest QR or clear it
        if (qr) {
            console.log(chalk.yellowBright("QR code received from Baileys."));
            currentQR = qr;
        }
        lastConnectionStatus = connection; // Store the latest status

        if (connection === 'close') {
             let reason = new Boom(lastDisconnect?.error)?.output.statusCode
             console.log(chalk.redBright(`Connection closed, reason: ${reason}`))
             currentQR = null; // Clear QR on close
             lastConnectionStatus = `close - ${reason}`;
             if (reason === DisconnectReason.badSession) { console.log(`Bad Session File, Please Delete Session and Scan Again`); sock.logout(); }
             else if (reason === DisconnectReason.connectionClosed) { console.log("Connection closed, reconnecting...."); startNezuko(); }
             else if (reason === DisconnectReason.connectionLost) { console.log("Connection Lost from Server, reconnecting..."); startNezuko(); }
             else if (reason === DisconnectReason.connectionReplaced) { console.log("Connection Replaced, Another New Session Opened, Please Close Current Session First"); sock.logout(); }
             else if (reason === DisconnectReason.loggedOut) { console.log(`Device Logged Out, Please Scan Again And Run.`); sock.logout(); }
             else if (reason === DisconnectReason.restartRequired) { console.log("Restart Required, Restarting..."); startNezuko(); }
             else if (reason === DisconnectReason.timedOut) { console.log("Connection TimedOut, Reconnecting..."); startNezuko(); }
             else sock.end(`Unknown DisconnectReason: ${reason}|${lastDisconnect.error}`)
        } else if (connection === 'open') {
             console.log(chalk.greenBright('Successfully Connected to WA! QR Code page will show connected message.'))
             currentQR = null; // Clear QR on successful connection
        }
    })

    sock.ev.on('creds.update', saveCreds)

    // Other event listeners from Nezuko original index.js should follow here...
    // sock.ev.on('messages.upsert', ...) etc.

    return sock
}

// --- NEW: Setup Express Web Server ---
const app = express();
const webServerPort = process.env.PORT || 8080; // Use PORT from environment or default to 8080

app.get('/qr', async (req, res) => {
    res.setHeader('Content-Type', 'text/html');
    let qrImageData = null;
    let statusMessage = `Current Status: ${lastConnectionStatus || 'Initializing...'}`;

    if (lastConnectionStatus === 'open') {
        statusMessage = '<span style="color: green; font-weight: bold;">Connected!</span> You can close this page.';
        currentQR = null; // Ensure QR is cleared when connected
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
         statusMessage = `<span style="color: red;">Connection Closed: ${lastConnectionStatus}. Restarting... Check logs.</span>`;
    } else {
        statusMessage = 'Waiting for QR code... Page will refresh.';
    }

    // Send HTML page
    res.send(`
        <!DOCTYPE html>
        <html>
        <head>
            <title>WhatsApp QR Code</title>
            ${(lastConnectionStatus !== 'open' && !qrImageData) ? '<meta http-equiv="refresh" content="10">' : ''} 
            <style>
                body { font-family: sans-serif; display: flex; flex-direction: column; align-items: center; margin-top: 30px; }
                img { border: 1px solid #ccc; margin-bottom: 20px; }
                p { color: #555; }
                .status { margin-bottom: 20px; font-size: 1.1em; }
            </style>
        </head>
        <body>
            <h1>Link WhatsApp Bot</h1>
            <p class="status">${statusMessage}</p>
            ${qrImageData ? `<img src="${qrImageData}" alt="WhatsApp QR Code" width="300" height="300">` : ''}
            ${(lastConnectionStatus !== 'open' && !qrImageData) ? '<p>(Page auto-refreshes until connected or QR appears)</p>' : ''}
         </body>
        </html>
    `);
});

 app.get('/', (req, res) => {
     // Redirect root to the QR page
     res.redirect('/qr');
 });

app.listen(webServerPort, () => {
    console.log(chalk.blueBright(`QR Code Web Server listening on internal port ${webServerPort}`));
    console.log(chalk.blueBright(`Visit http://<your-elestio-url>:${webServerPort}/qr to scan the code`)); // Adjust port if using reverse proxy
});
// --- End Express Web Server Setup ---


// --- Start the Bot ---
startNezuko().catch(err => console.error("Error starting Nezuko bot:", err));
// --------------------


// Keep process alive (optional)
process.on('unhandledRejection', (err) => {
    console.error('Unhandled Promise Rejection:', err);
});

// File watching (keep original if needed, but often causes issues in Docker)
// let file = require.resolve(__filename)
// fs.watchFile(file, () => {
//     fs.unwatchFile(file)
//     console.log(chalk.redBright(`Update ${__filename}`))
//     delete require.cache[file]
//     require(file) // This might not restart everything correctly
// })
