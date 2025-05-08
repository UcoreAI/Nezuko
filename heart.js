// Removed require("./handler/MessageHandler"); - Let index.js handle this.
require("./settings"); // Keep this if it sets global variables like owner etc.
const {
  default: WASocket,
  DisconnectReason,
  downloadContentFromMessage,
  makeInMemoryStore,
  // useSingleFileAuthState, // We are using Auth store below
  jidDecode,
  delay,
  // jidNormalizedUser, // Not used?
  // makeWALegacySocket, // Not used?
  // useSingleFileLegacyAuthState, // Not used?
  // DEFAULT_CONNECTION_CONFIG, // Not used?
  // DEFAULT_LEGACY_CONNECTION_CONFIG, // Not used?
  fetchLatestBaileysVersion // Keep this
} = require("@whiskeysockets/baileys");
const fs = require("fs");
const chalk = require("chalk");
const pino = require("pino");
const yargs = require("yargs"); // Not used directly? Can potentially remove if not needed by commands.
const path = require("path");
const qrcode = require("qrcode");
const { Boom } = require("@hapi/boom");
const { Collection, Simple } = require("./Organs/typings");
const Welcome = require("./handler/EventHandler"); // Assuming this handles group participant updates
const { serialize, WAConnection } = Simple; // WAConnection might be custom here
const FileType = require("file-type");
const Commands = new Collection();
const cfonts = require("cfonts"); // Ensure this is in dependencies
const mongoose = require("mongoose");
const user = require("./models/user"); // Mongoose user model
const express = require("express");
const axios = require("axios"); // Not used directly? Can potentially remove if not needed by commands.

// Use Environment Variables
const MONGODB_URI = process.env.MONGODB_URI;
const prefix = process.env.PREFIX || '!'; // Use '!' as default prefix
const sessionId = process.env.SESSION_ID || 'test'; // Get session ID from env or default
const PORT = process.env.PORT || 8080; // Get port from env or default

// --- Fix #3: Initialize QuickDB with SqliteDriver for Persistence ---
const { QuickDB } = require("quick.db");
const SqliteDriver = require('quick.db/src/drivers/Sqlite.js'); // Path might need adjustment
// Ensure the directory exists or has correct permissions if using /data
// Using /usr/src/app/session/ for now as session dir is likely persistent
const dbFilePath = '/usr/src/app/session/quickdb.sqlite'; 
console.log(`[QuickDB] Using database file: ${dbFilePath}`);
global.db = new QuickDB({ driver: new SqliteDriver({ filePath: dbFilePath }) });

// Baileys Authentication Store using MongoDB (from your typings/authstore)
const Auth = require("./Organs/typings/authstore"); // Ensure this path is correct

// Set command prefix (using ENV VAR now)
Commands.prefix = prefix;

// Read commands function (keep as is)
const readCommands = () => {
  let dir = path.join(__dirname, "./Organs/commands");
  let dirs = fs.readdirSync(dir);
  let cmdlist = {};
  try {
    dirs.forEach(async (res) => {
      let groups = res.toLowerCase();
      Commands.category = dirs.filter((v) => v !== "_").map((v) => v);
      cmdlist[groups] = [];
      let files = fs
        .readdirSync(`${dir}/${res}`)
        .filter((file) => file.endsWith(".js"));
      for (const file of files) {
        try { // Add try-catch for individual command loading
          const command = require(`${dir}/${res}/${file}`);
          cmdlist[groups].push(command);
          Commands.set(command.name, command);
        } catch (loadErr) {
           console.error(`Failed to load command ${file} in ${res}:`, loadErr);
        }
        await delay(10); // Reduced delay
      }
    });
    Commands.list = cmdlist;
  } catch (e) {
    console.error("Error reading commands directory:", e);
  }
};

// Baileys store (keep as is)
const store = makeInMemoryStore({
  logger: pino().child({ level: "silent", stream: "store" }),
});

// Call readCommands *before* connect
readCommands();

// --- Fix #4: Remove redundant Express server start ---
// const app = express(); // Moved server setup to index.js
// app.use("/", express.static(join(__dirname, "public"))); // Moved
// app.get("/qr", ...) // Moved
// app.listen(PORT, ...) // Moved

let QR_GENERATE = "invalid";
let status;

const connect = async () => {

  // --- Fix #1: Connect Mongoose using ENV VAR ---
  if (MONGODB_URI) {
      try {
          await mongoose.connect(MONGODB_URI);
          console.log("[Mongoose] Connection Successful!");
      } catch (mongoErr) {
          console.error("[Mongoose] Connection Failed:", mongoErr);
          // Decide if you want to exit or continue without mongoose features
          // process.exit(1); 
      }
  } else {
       console.warn("[Mongoose] MONGODB_URI not set. Mongoose features disabled.");
  }

  // --- Auth Store Initialization ---
  const { getAuthFromDatabase } = new Auth(sessionId); // Pass sessionId from ENV VAR
  const { saveState, state, clearState } = await getAuthFromDatabase();

  // --- Baileys Connection Options ---
  let { version, isLatest } = await fetchLatestBaileysVersion();
  console.log(`[Baileys] Using WA v${version.join('.')}, isLatest: ${isLatest}`);
  let connOptions = {
    printQRInTerminal: true, // This will print QR to console logs
    browser: ["UcoreAI Bot", "Firefox", "110.0"], // Custom browser name
    logger: pino({ level: "silent" }), // Can change level for debugging (e.g., 'debug')
    auth: state,
    version,
    // Consider adding other options if needed, e.g., for message retries
    // msgRetryCounterMap: // your retry map instance,
    // generateHighQualityLinkPreview: true, 
  };

  // --- Initialize Baileys Socket ---
  const client = WASocket(connOptions);

  // Cfonts display (keep as is)
  const randomHexs = `#${((Math.random() * 0xffffff) << 0).toString(16).padStart(6, "0")}`;
  const randomHex = `#${((Math.random() * 0xffffff) << 0).toString(16).padStart(6, "0")}`;
  const randomHexx = `#${((Math.random() * 0xffffff) << 0).toString(16).padStart(6, "0")}`;
  cfonts.say("NEZUKO\n\nBY\n\nUcoreAI", { // Updated author
    font: "block", align: "center", colors: [randomHex, randomHexs],
    background: "transparent", letterSpacing: 2, lineHeight: 2, space: true,
    maxLength: "0", gradient: [randomHex, randomHexs, randomHexx],
    independentGradient: false, transitionGradient: true, env: "node",
  });

  console.log("[Baileys] Starting connection...");

  // Bind store events (keep as is)
  store.bind(client.ev);

  // --- Event Handlers ---

  client.ev.on("creds.update", saveState); // Save state on credential update

  client.ev.on("connection.update", async (update) => {
    const { lastDisconnect, connection, qr } = update;
    status = connection; // Update global status (needed for QR server in index.js)
    global.qr_code = qr; // Store QR code globally for index.js server

    console.log(`[Connection Update] status: ${connection || 'undefined'}`);

    if (connection === "close") {
      let reasonCode = new Boom(lastDisconnect?.error)?.output?.statusCode;
      let reasonText = DisconnectReason[reasonCode] || 'Unknown';
      console.error(`Connection closed! Reason: ${reasonText} (${reasonCode})`, lastDisconnect?.error);

      if (reasonCode === DisconnectReason.badSession) {
        console.log(`Bad Session File, Please Delete Session (contact support/admin) and Scan Again`);
        // Optionally: clearState(); // Automatically clear bad state? Risky if temporary issue.
        // client.logout(); // logout() might not work if connection is already closed badly
        // Exit or stop trying to reconnect automatically on bad session
         process.exit(1); // Exit process so container restarts cleanly
      } else if (reasonCode === DisconnectReason.connectionClosed) {
        console.log("Connection closed, reconnecting...");
        await delay(5000); // Wait 5 seconds before reconnecting
        connect();
      } else if (reasonCode === DisconnectReason.connectionLost) {
        console.log("Connection Lost from Server, reconnecting...");
        await delay(5000);
        connect();
      } else if (reasonCode === DisconnectReason.connectionReplaced) {
        console.log("Connection Replaced, Another New Session Opened. Stopping this instance.");
        process.exit(1); // Exit to avoid conflicts
      } else if (reasonCode === DisconnectReason.loggedOut) {
        console.log(`Device Logged Out, Deleting Session and Exiting. Please Scan Again.`);
        await clearState(); // Clear the invalid state
        process.exit(1); // Exit process
      } else if (reasonCode === DisconnectReason.restartRequired) {
        console.log("Restart Required, Restarting...");
        await delay(5000);
        connect();
      } else if (reasonCode === DisconnectReason.timedOut) {
        console.log("Connection TimedOut, Reconnecting...");
        await delay(5000);
        connect();
      } else {
         console.log(`Unknown Disconnect Reason (${reasonCode}). Reconnecting...`);
         await delay(5000);
         connect();
      }
    } else if (connection === "open") {
       console.log("[Baileys] Connection Opened Successfully!");
       QR_GENERATE = "connected"; // Reset QR status
       global.qr_code = null; // Clear QR code
       // You might want to send a message to owner confirming connection
       // client.sendMessage(owner_jid, { text: 'Nezuko Bot Connected!' });
    }
    
    // Handle QR code update
    if (qr) {
       QR_GENERATE = qr; // Update QR status for index.js server
       console.log("[Baileys] QR Code generated. Scan needed.");
       // The QR will be served by the express server in index.js
    }
  });

  // Group Participants Update Handler (keep as is)
  client.ev.on("group-participants.update", async (m) => {
     try { // Add try-catch around event handlers
         await Welcome(client, m);
     } catch (eventErr) {
         console.error("Error in group-participants.update handler:", eventErr);
     }
  });

  // Message Handler (keep as is, ensure MessageHandler.js is loaded correctly by index.js)
  client.ev.on("messages.upsert", async (chatUpdate) => {
      if (!chatUpdate.messages) return;
      const m = serialize(client, chatUpdate.messages[0]); // Assuming serialize handles potential issues

      if (!m || !m.message) return;
      if (m.key && m.key.remoteJid == "status@broadcast") return;
      // Ignore temporary messages
      if (m.key && m.key.id.startsWith("BAE5") && m.key.id.length === 16) return; 
      if (m.key && m.key.id.startsWith("3EB0") && m.key.id.length === 12) return; 

      try { // Add try-catch around message handler call
         // Ensure MessageHandler is required in index.js AFTER heart.js initializes globals
         const messageHandler = require("./handler/MessageHandler"); 
         await messageHandler(client, m, Commands, chatUpdate);
      } catch (handlerErr) {
         console.error("Error processing message:", handlerErr);
      }
  });

  // Contacts Update Handler (keep as is, depends on Mongoose connection)
  client.ev.on("contacts.update", async (update) => {
      if (!MONGODB_URI) return; // Skip if no DB connected
      for (let contact of update) {
         let id = client.decodeJid(contact.id);
         if (!id) continue;
         try {
             const usr = await user.findOne({ id: id });
             if (!usr) {
                 await new user({ id: id, name: contact.notify || contact.verifiedName || id.split('@')[0] }).save();
                 console.log(`[DB] Added contact: ${contact.notify || id}`);
             } else if (usr.name !== (contact.notify || contact.verifiedName)) {
                 await user.updateOne({ id: id }, { name: contact.notify || contact.verifiedName || id.split('@')[0] });
                 // console.log(`[DB] Updated contact: ${contact.notify || id}`);
             }
         } catch (dbErr) {
             console.error(`[DB] Error updating contact ${id}:`, dbErr);
         }
      }
  });

  // Utility functions (keep as is)
  client.decodeJid = (jid) => {
    if (!jid) return jid;
    if (/:\d+@/gi.test(jid)) {
      let decode = jidDecode(jid) || {};
      return (
        (decode.user && decode.server && decode.user + "@" + decode.server) ||
        jid
      );
    } else return jid;
  };

  client.sendText = (jid, text, quoted = "", options) =>
    client.sendMessage(jid, { text: text, ...options }, { quoted });

  client.sendFile = async (jid, path, fileName = "", caption = "", quoted = "", options = {}) => {
      // ...(keep existing implementation, maybe add more error handling) ...
       let types = await client.getFile(path, true);
       let { mime, ext, res, data, filename } = types;
       if ((res && res.status !== 200) || file.length <= 65536) { // 'file' is not defined here? Should be 'data'?
         try {
           throw { json: JSON.parse(data.toString()) }; // Use 'data'
         } catch (e) {
           if (e.json) throw e.json;
           // Throw a generic error if parsing fails
           throw new Error(`Failed to process file data: ${e.message}`); 
         }
       }
       let type = "",
         mimetype = mime,
         pathFile = filename;
       if (options.asDocument) type = "document";
       if (options.asSticker || /webp/.test(mime)) {
         let { writeExif } = require("./lib/exif"); // Ensure ./lib/exif exists
         let media = { mimetype: mime, data };
         pathFile = await writeExif(media, {
           packname: options.packname ? options.packname : global.packname || "NezukoBot", // Add defaults
           author: options.author ? options.author : global.author || "UcoreAI", // Add defaults
           categories: options.categories ? options.categories : [],
         });
         await fs.promises.unlink(filename);
         type = "sticker";
         mimetype = "image/webp";
       } else if (/image/.test(mime)) type = "image";
       else if (/video/.test(mime)) type = "video";
       else if (/audio/.test(mime)) type = "audio";
       else type = "document";
       await client.sendMessage(
         jid,
         { [type]: { url: pathFile }, caption, mimetype, fileName, ...options },
         { quoted, ...options }
       );
       return fs.promises.unlink(pathFile);
  };

  client.downloadAndSaveMediaMessage = async (message, filename, attachExtension = true) => {
      // ...(keep existing implementation) ...
       let quoted = message.msg ? message.msg : message;
       let mime = (message.msg || message).mimetype || "";
       let messageType = message.mtype
         ? message.mtype.replace(/Message/gi, "")
         : mime.split("/")[0];
       const stream = await downloadContentFromMessage(quoted, messageType);
       let buffer = Buffer.from([]);
       for await (const chunk of stream) {
         buffer = Buffer.concat([buffer, chunk]);
       }
       let type = await FileType.fromBuffer(buffer);
       let trueFileName = filename;
       if (attachExtension && type) { // Check if type exists
           trueFileName = filename + "." + type.ext;
       }
       await fs.writeFileSync(trueFileName, buffer);
       return trueFileName;
  };

  client.downloadMediaMessage = async (message) => {
     // ...(keep existing implementation) ...
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

  client.username = async (jid) => {
      if (!MONGODB_URI) return "User"; // Return default if no DB
      try {
          let nameData = await user.findOne({ id: jid });
          return nameData ? nameData.name : id.split('@')[0] || "User"; // Return username or default
      } catch (dbErr) {
           console.error(`[DB] Error fetching username for ${jid}:`, dbErr);
           return id.split('@')[0] || "User"; // Return default on error
      }
  };

  // Make client globally accessible AFTER it's potentially defined
  // Be cautious with global variables
  global.client = client; 

  // Return client for potential use in index.js
  return client; 
};

// Export the connect function so index.js can call it
module.exports = connect;

// Also export QR_GENERATE and status getters for the web server in index.js
module.exports.getQR = () => QR_GENERATE;
module.exports.getStatus = () => status;
