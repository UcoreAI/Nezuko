require('./config'); // Load hardcoded config.js first
const { default: makeWASocket, useMultiFileAuthState, DisconnectReason, fetchLatestBaileysVersion, makeInMemoryStore, jidDecode, proto, getAggregateVotesInPollMessage } = require("@whiskeysockets/baileys");
const fs = require('fs');
const pino = require('pino');
const chalk = require('chalk');
const path = require('path');
// const axios = require('axios'); // Not needed if not sending QR externally
const _ = require('lodash');
const { Boom } = require('@hapi/boom');
const PhoneNumber = require('awesome-phonenumber');
const { smsg, isUrl, generateMessageTag, getBuffer, getSizeMedia, fetchJson, await, sleep } = require('./lib/Function'); 
const express = require('express');
const qrcode = require('qrcode'); 
const qrcodeTerminal = require('qrcode-terminal');

let currentQR = null; 
let lastConnectionStatus = null;
let botStartTime = Date.now(); 

const sessionDir = path.join(__dirname, global.sessionName || 'session');
if (!fs.existsSync(sessionDir)){
    fs.mkdirSync(sessionDir);
    console.log(chalk.green(`Created session directory: ${sessionDir}`));
}

async function startNezuko() {
    console.log(chalk.greenBright("Attempting to start Nezuko bot (UcoreAI)..."));
    console.log(chalk.yellow(`Using session directory: ${sessionDir}`));
    const { state, saveCreds } = await useMultiFileAuthState(sessionDir); 
    const store = makeInMemoryStore({ logger: pino().child({ level: 'silent', stream: 'store' }) });

    const sock = makeWASocket({
        logger: pino({ level: 'silent' }),
        printQRInTerminal: true, 
        browser: [global.namebot || 'UcoreAI','Safari','3.0'], 
        auth: state,
        getMessage: async (key) => {
            const msg = await store.loadMessage(key.remoteJid, key.id);
            return msg?.message || undefined;
        },
    });

    store?.bind(sock.ev);

    try {
        const messageHandlerModule = require('./handler/MessageHandler.js'); 
        if (messageHandlerModule && typeof messageHandlerModule.messageHandler === 'function') {
             console.log("Binding main message handler from handler/message.js...");
             sock.ev.on('messages.upsert', async (chatUpdate) => {
                 try {
                    await messageHandlerModule.messageHandler(sock, chatUpdate, store);
                 } catch (e) {
                    console.error(chalk.redBright("Error in message handler:"), e);
                 }
             });
        } else {
            console.error(chalk.yellowBright("Nezuko message handler (handler/message.js or its export) not found/not a function. Using basic logging."));
            sock.ev.on('messages.upsert', m => console.log(chalk.magenta("Basic msg log:"), JSON.stringify(m, undefined, 2)));
        }
    } catch (e) {
        console.error(chalk.redBright("Critical error requiring handler/message.js:"), e);
        sock.ev.on('messages.upsert', m => console.log(chalk.magenta("Critical fallback msg log:"), JSON.stringify(m, undefined, 2)));
    }

    sock.ev.on('connection.update', async (update) => {
        const { connection, lastDisconnect, qr } = update;
        console.log(chalk.cyanBright(`Connection update: ${connection || 'Unknown status'}`));

        if (qr) {
            console.log(chalk.yellowBright("QR code received from Baileys. Web page will update."));
            // qrcodeTerminal.generate(qr, { small: true }); // Console QR
            currentQR = qr; 
        }
        lastConnectionStatus = connection || lastConnectionStatus;

        if (connection === 'close') {
            let reason = new Boom(lastDisconnect?.error)?.output.statusCode;
            console.log(chalk.redBright(`Connection closed, reason: ${reason}, Error: ${lastDisconnect?.error}`));
            currentQR = null; 
            lastConnectionStatus = `close - ${reason}`;
            
            const shouldReconnect = ![DisconnectReason.loggedOut, DisconnectReason.connectionReplaced, DisconnectReason.badSession, DisconnectReason.multideviceMismatch].includes(reason);
            if (shouldReconnect) {
                console.log(chalk.yellowBright("Attempting to reconnect..."));
                await sleep(5000); 
                startNezuko().catch(err => console.error(chalk.redBright("Error during reconnect attempt:"), err)); 
            } else {
                console.log(chalk.redBright("Not reconnecting. Please check the reason. If logged out/replaced/bad session, delete session and restart."));
            }
        } else if (connection === 'open') {
            console.log(chalk.greenBright(`Successfully Connected to WA! Logged in as: ${sock.user?.id?.split(':')[0] || sock.user?.id || 'Unknown'}`));
            console.log(chalk.blueBright(`QR Code page at http://<your-elestio-url>/qr will now show 'Connected!'`));
            currentQR = null; 
        }
    });

    sock.ev.on('creds.update', saveCreds);
    sock.ev.on('error', (err) => console.error(chalk.redBright("Socket Error:"), err));
    
    return sock;
}

const app = express();
const webServerPort = process.env.PORT || 8080; 

app.get('/qr', async (req, res) => {
    res.setHeader('Content-Type', 'text/html');
    let qrImageData = null;
    let statusMessage = `Bot: ${global.namebot} | Status: ${lastConnectionStatus || 'Initializing...'}`;
    let pageRefresh = (lastConnectionStatus === 'open') ? 300 : 10; 

    if (lastConnectionStatus === 'open') {
        statusMessage = `<span style="color: green; font-weight: bold;">CONNECTED!</span><br>Bot Name: ${global.namebot}<br>Owner: ${global.nameowner} (${global.numberowner}).<br>You can close this page.`;
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
    } else {
        statusMessage = 'Waiting for QR code... Page will refresh.';
    }

    // Send HTML page - CRITICAL: Ensure NO backslash before the starting backtick
    res.send(`<!DOCTYPE html>
        <html>
        <head>
            <title>WhatsApp QR Code - ${global.namebot || 'Bot'}</title>
            <meta http-equiv="refresh" content="${pageRefresh}"> 
            <style>
                body { font-family: sans-serif; display: flex; flex-direction: column; align-items: center; margin-top: 30px; }
                img { border: 1px solid #ccc; margin-bottom: 20px; width: 300px; height: 300px; }
                p { color: #555; }
                .status { margin-bottom: 20px; font-size: 1.1em; line-height: 1.5em; background-color: #f0f0f0; padding: 15px; border-radius: 5px; max-width: 600px; text-align: center;}
            </style>
        </head>
        <body>
            <h1>Link Bot: ${global.namebot || 'WhatsApp Bot'}</h1>
            <div class="status">${statusMessage}</div>
            ${qrImageData ? `<img src="${qrImageData}" alt="WhatsApp QR Code">` : ''}
            <p>(Page auto-refreshes every ${pageRefresh} seconds)</p>
         </body>
        </html>`); // Ensure backtick is the very last character here
});

 app.get('/', (req, res) => res.redirect('/qr'));

app.listen(webServerPort, () => {
    console.log(chalk.blueBright(`QR Code Web Server listening on internal port ${webServerPort}`));
    console.log(chalk.blueBright(`Access QR page at /qr on your service URL.`)); 
});

startNezuko().catch(err => console.error(chalk.redBright("FATAL ERROR during bot startup:"), err));

process.on('unhandledRejection', (err) => console.error(chalk.redBright('Unhandled Promise Rejection:'), err));
