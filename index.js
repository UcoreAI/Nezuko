require('./config')
const { default: makeWASocket, useMultiFileAuthState, DisconnectReason, fetchLatestBaileysVersion, generateForwardMessageContent, prepareWAMessageMedia, generateWAMessageFromContent, generateMessageID, downloadContentFromMessage, makeInMemoryStore, jidDecode, proto, getAggregateVotesInPollMessage } = require("@whiskeysockets/baileys")
const fs = require('fs')
const pino = require('pino')
const chalk = require('chalk')
const path = require('path')
const axios = require('axios'); // <--- ADDED axios require
const _ = require('lodash')
const { Boom } = require('@hapi/boom')
const PhoneNumber = require('awesome-phonenumber')
const { imageToWebp, videoToWebp, writeExifImg, writeExifVid } = require('./lib/exif')
const { smsg, isUrl, generateMessageTag, getBuffer, getSizeMedia, fetchJson, await, sleep } = require('./lib/myfunc')

// Other requires and initializations from Nezuko...
// const store = makeInMemoryStore({ logger: pino().child({ level: 'silent', stream: 'store' }) })
let Komari = require('./Control') // Assuming Control.js is used for main logic


async function startNezuko() {
    const { state, saveCreds } = await useMultiFileAuthState(`./${global.sessionName}`)

    const sock = makeWASocket({
        logger: pino({ level: 'silent' }),
        printQRInTerminal: true, // We keep this true to see the text QR for debugging
        browser: ['UcoreAI','Safari','1.0.0'], // Browser name
        auth: state,
        getMessage: async key => {
            // Placeholder if store is not used or implemented elsewhere
            return { conversation: 'hello' }
        }
    })

    // Komari seems to be the main handler in the original code
    if (Komari && typeof Komari.Komari === 'function') {
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

        if (connection === 'close') {
             let reason = new Boom(lastDisconnect?.error)?.output.statusCode
             console.log(chalk.redBright(`Connection closed, reason: ${reason}`))
             if (reason === DisconnectReason.badSession) { console.log(`Bad Session File, Please Delete Session and Scan Again`); sock.logout(); }
             else if (reason === DisconnectReason.connectionClosed) { console.log("Connection closed, reconnecting...."); startNezuko(); }
             else if (reason === DisconnectReason.connectionLost) { console.log("Connection Lost from Server, reconnecting..."); startNezuko(); }
             else if (reason === DisconnectReason.connectionReplaced) { console.log("Connection Replaced, Another New Session Opened, Please Close Current Session First"); sock.logout(); }
             else if (reason === DisconnectReason.loggedOut) { console.log(`Device Logged Out, Please Scan Again And Run.`); sock.logout(); }
             else if (reason === DisconnectReason.restartRequired) { console.log("Restart Required, Restarting..."); startNezuko(); }
             else if (reason === DisconnectReason.timedOut) { console.log("Connection TimedOut, Reconnecting..."); startNezuko(); }
             else sock.end(`Unknown DisconnectReason: ${reason}|${lastDisconnect.error}`)
        } else if (connection === 'open') {
             console.log(chalk.greenBright('Successfully Connected to WA!'))
             // Clear QR string file when connected
             const qrManagerUrl = process.env.QR_MANAGER_URL || 'http://nezuko-qr-manager:8080';
             const clientId = process.env.CLIENT_ID || 'default_client';
             axios.post(`${qrManagerUrl}/set-qr`, { qrString: '', clientId: clientId })
                 .then(() => console.log(`[QR SENDER] Cleared QR on manager for client: ${clientId}`))
                 .catch(error => console.error(`[QR SENDER] Error clearing QR on manager:`, error.message || error));
        }

        // --- Send QR to Manager Service ---
        if (qr) {
             console.log(chalk.yellowBright("QR code detected in connection update.")); // Log detection
             // Define manager URL and Client ID from environment variables
             const qrManagerUrl = process.env.QR_MANAGER_URL; // MUST be set in Elestio for Nezuko service
             const clientId = process.env.CLIENT_ID || 'default_client'; // Set unique ID for this instance in Elestio

             if (!qrManagerUrl) {
                 console.error(chalk.redBright("[QR SENDER] Error: QR_MANAGER_URL environment variable is not set. Cannot send QR code."));
             } else {
                 console.log(`[QR SENDER] Detected QR string for client: ${clientId}`);
                 console.log(`[QR SENDER] Sending POST request to: ${qrManagerUrl}/set-qr`);
                 axios.post(`${qrManagerUrl}/set-qr`, {
                     qrString: qr,
                     clientId: clientId
                  })
                 .then(response => {
                     console.log(chalk.greenBright(`[QR SENDER] Successfully sent QR to manager (${qrManagerUrl}/set-qr): Status ${response.status}`));
                 })
                 .catch(error => {
                      // Log more details on error
                      const errorMsg = error.response ? `${error.response.status} ${error.response.statusText}` : error.message;
                      console.error(chalk.redBright(`[QR SENDER] Error sending QR to manager (${qrManagerUrl}/set-qr): ${errorMsg}`), error.config ? `Data: ${JSON.stringify(error.config.data)}` : '');
                      if (error.response) {
                           console.error(chalk.redBright(`[QR SENDER] Response Data: ${JSON.stringify(error.response.data)}`));
                      }
                 });
             }
        }
        // --- End QR Sending Logic ---
    })

    sock.ev.on('creds.update', saveCreds)

    // Other event listeners from Nezuko original index.js should follow here...
    // sock.ev.on('messages.upsert', ...) etc.

    return sock
}

startNezuko()

// Keep process alive
process.on('unhandledRejection', (err) => {
    console.error('Unhandled Promise Rejection:', err);
    // Decide if you want to exit or attempt recovery
});

let file = require.resolve(__filename)
fs.watchFile(file, () => {
    fs.unwatchFile(file)
    console.log(chalk.redBright(`Update ${__filename}`))
    delete require.cache[file]
    require(file)
})
