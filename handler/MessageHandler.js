// Note: Removed require("../heart"); as index.js now handles initialization.
require("../settings"); // Keep if settings.js defines globals like owner etc.
const {
  generateWAMessage,
  areJidsSameUser,
  proto,
} = require("@whiskeysockets/baileys");
const { Function } = require("../lib");
const { Collection, Simple } = require("../Organs/typings");
const { isUrl, isNumber } = Function;
const Func = require("../lib");
const fs = require("fs");
const moment = require("moment-timezone");
const chalk = require("chalk");
const cool = new Collection();
const { table } = require("console"); // table is not used, can be removed

// --- Use Environment Variables (defined & loaded in index.js) ---
const Mongo_URL = process.env.MONGODB_URI; 
const prefix = process.env.PREFIX || '!'; // Default prefix defined in index.js

// --- Discord-XP & Mongoose Setup (Initialization happens in index.js) ---
// global.Levels = require("discord-xp"); // Already required in index.js
// global.user = require("../models/user"); // Already required in index.js
// const mongoose = require("mongoose"); // Already required in index.js
// No need to connect mongoose or set Levels URL here, index.js does it.

// --- Define the Handler Function ---
async function handleMessage(client, m, commands, chatUpdate) { // Renamed from module.exports
  try {
    // Ensure global.db is available (initialized in index.js)
    if (!global.db) {
        console.error(chalk.red("[MessageHandler] FATAL: global.db is not initialized!"));
        // Maybe return or throw an error to prevent proceeding
        return; 
    }

    let { type, isGroup, sender, from } = m;
    let body =
      type == "buttonsResponseMessage"
        ? m.message[type].selectedButtonId
        : type == "listResponseMessage"
        ? m.message[type].singleSelectReply.selectedRowId
        : type == "templateButtonReplyMessage"
        ? m.message[type].selectedId
        : m.text;
        
    // Ensure body is a string for startsWith check
    body = body || ""; 

    let prat =
      type === "conversation" && body?.startsWith(prefix)
        ? body
        : (type === "imageMessage" || type === "videoMessage") &&
          body &&
          body?.startsWith(prefix)
        ? body
        : type === "extendedTextMessage" && body?.startsWith(prefix)
        ? body
        : type === "buttonsResponseMessage" && body?.startsWith(prefix)
        ? body
        : type === "listResponseMessage" && body?.startsWith(prefix)
        ? body
        : type === "templateButtonReplyMessage" && body?.startsWith(prefix)
        ? body
        : "";
        
    // Basic checks
    if (!m || !sender || !from) {
        console.warn(chalk.yellow("[MessageHandler] Received incomplete message object:"), m);
        return;
    }

    let metadata = isGroup ? await client.groupMetadata(from).catch(e => { console.error(chalk.red(`Error getting group metadata for ${from}:`), e); return {}; }) : {};
    let participants = isGroup ? metadata.participants : [sender]; // metadata might be empty if error occurred
    participants = participants || []; // Ensure participants is an array

    let pushname = m.pushName || "NO name";
    const groupName = isGroup ? metadata.subject : "";

    // Ensure global.owner is an array before mapping
    const ownerArray = Array.isArray(global.owner) ? global.owner : [global.owner];
    const iscreator = ownerArray
      .map((v) => String(v).replace(/[^0-9]/g, "") + "@s.whatsapp.net") // Ensure v is a string
      .includes(m.sender);

    let groupAdmin = isGroup
      ? participants.filter((v) => v.admin !== null).map((v) => v.id)
      : [];
    const botNumber = await client.decodeJid(client.user.id);
    let isBotAdmin = isGroup ? groupAdmin.includes(botNumber) : false;
    let isAdmin = isGroup ? groupAdmin.includes(sender) : false;
    
    //////////Database Access\\\\\\\\\\\\\\\\
    const _mods = await global.db.get("mods").catch(e => { console.error(chalk.red("Error getting mods from DB:"), e); return []; }); 
    global.mods = Array.isArray(_mods) ? _mods : []; // Ensure it's an array
    const _ban = await global.db.get("ban").catch(e => { console.error(chalk.red("Error getting ban from DB:"), e); return []; });
    global.ban = Array.isArray(_ban) ? _ban : []; // Ensure it's an array
    const _nsfw = await global.db.get("nsfw").catch(e => { console.error(chalk.red("Error getting nsfw from DB:"), e); return []; });
    global.nsfw = Array.isArray(_nsfw) ? _nsfw : []; // Ensure it's an array
    let wel = await global.db.get("events").catch(e => { console.error(chalk.red("Error getting events from DB:"), e); return []; }); 
    global.wlc = Array.isArray(wel) ? wel : []; // Ensure it's an array

    let isCmd = body.startsWith(prefix);
    let quoted = m.quoted ? m.quoted : m;
    let mime = (quoted.msg || m.msg)?.mimetype || " "; 
    let isMedia = /image|video|sticker|audio/.test(mime);
    let budy = typeof m.text == "string" ? m.text : "";
    let args = typeof body === 'string' ? body.trim().split(/ +/).slice(1) : []; // Ensure body is string
    let ar = args.map((v) => v.toLowerCase());
    let text = (q = args.join(" "));

    const cmdName = typeof prat === 'string' ? prat // Ensure prat is string
      .slice(prefix.length)
      .trim()
      .split(/ +/)
      .shift()
      .toLowerCase() : "";

    const cmd = cmdName ? ( // Check if cmdName is valid before searching
      commands.get(cmdName) ||
      Array.from(commands.values()).find((v) =>
        v.alias && v.alias.find((x) => x.toLowerCase() == cmdName) // Check if v.alias exists
      ) ||
      "") : "";

    const icmd = cmdName ? ( // Check if cmdName is valid before searching
      commands.get(cmdName) ||
      Array.from(commands.values()).find((v) =>
        v.alias && v.alias.find((x) => x.toLowerCase() == cmdName) // Check if v.alias exists
      )) : null; // Use null instead of "" for clarity

    const mentionByTag =
      type == "extendedTextMessage" &&
      m.message.extendedTextMessage.contextInfo != null
        ? m.message.extendedTextMessage.contextInfo.mentionedJid || [] // Default to empty array
        : [];
    const flags = args.filter((arg) => arg.startsWith("--"));

    // Invalid command reply
    if (body.startsWith(prefix) && !icmd && cmdName) { // Only reply if it looked like a command
      var rae = `https://i.ibb.co/c33ZHCx/wallpaperflare-com-wallpaper.jpg`; // Consider making this configurable
      let txtt = `*${prefix}${cmdName}* is an ⛔ invalid command \nuse *${prefix}help* to see help menu`;
      if (client.sendMessage) {
         client.sendMessage(m.from, {image:{url:rae}, caption:txtt}, { quoted: m });
      }
    }

    // Logging (keep)
    if (m.message && isGroup && icmd) { // Only log if it's a valid command run
       console.log(
         "" + "\n" + chalk.black(chalk.bgWhite("[ GRUP ]")),
         chalk.black(
           chalk.bgBlueBright(groupName || from) // Use groupName or from JID
         ) +
           "\n" +
           chalk.black(chalk.bgWhite("[ TIME ]")),
         chalk.black(chalk.bgBlueBright(new Date().toISOString())) + // Use ISO format
           "\n" +
           chalk.black(chalk.bgWhite("[ FROM ]")),
         chalk.black(
           chalk.bgBlueBright(pushname + " @" + sender.split("@")[0])
         ) +
           "\n" +
           chalk.black(chalk.bgWhite("[ CMD ]")), // Log the command
         chalk.black(chalk.bgBlueBright(body || type)) + "\n" + ""
       );
    }
    if (m.message && !isGroup && icmd) { // Only log if it's a valid command run
       console.log(
         "" + "\n" + chalk.black(chalk.bgWhite("[ PRIV ]")),
         chalk.black(chalk.bgRedBright("PRIVATE CHAT")) +
           "\n" +
           chalk.black(chalk.bgWhite("[ TIME ]")),
         chalk.black(chalk.bgRedBright(new Date().toISOString())) + // Use ISO format
           "\n" +
           chalk.black(chalk.bgWhite("[ FROM ]")),
         chalk.black(
           chalk.bgRedBright(pushname + " @" + sender.split("@")[0])
         ) +
           "\n" +
           chalk.black(chalk.bgWhite("[ CMD ]")), // Log the command
         chalk.black(chalk.bgRedBright(body || type)) + "\n" + ""
       );
    }

    // Anti-link (keep, depends on global.mods)
     if (isGroup && global.mods && global.mods.includes(m.from)) {
         if (body.includes("://chat.whatsapp.com/") || body.includes("://api.whatsapp.com/")) {
            if (iscreator || isAdmin) {
               // m.reply("*Link detected, but you're admin/owner.*"); // Optional reply
            } else {
               try {
                  console.log(chalk.yellow(`[Anti-Link] Removing user ${sender} from ${groupName || from} for sending link.`));
                  await client.sendMessage(m.from, { delete: m.key });
                  await client.groupParticipantsUpdate(m.from, [sender], "remove");
                  m.reply(`*Link detected!* User removed.`); // Notify group
               } catch (e) {
                  console.error(chalk.red(`[Anti-Link] Failed to remove user ${sender}:`), e);
                  m.reply(`*Link detected! Failed to remove user.*`);
               }
            }
         }
     }
    
    // Only proceed if it's a valid command object
    if (!icmd || typeof icmd.start !== 'function') {
        if (isCmd && cmdName) { // If it looked like a command but wasn't found/valid
           console.log(chalk.yellow(`Command '${cmdName}' not found or invalid structure.`));
        }
        return; // Stop processing if not a valid command
    }
    
    // XP System (keep, depends on global.Levels)
    if (global.Levels && typeof Levels.appendXp === 'function' && Mongo_URL) { // Check if Levels is configured
       try {
          const randomXp = Math.floor(Math.random() * 3) + 1; 
          await Levels.appendXp(m.sender, "bot", randomXp); // No need to store 'haslUp' if not used
       } catch (xpError) {
          console.error("[XP System] Error appending XP:", xpError);
       }
    }
    
    // --info flag (keep)
    if (text.endsWith("--info")) {
        // ... (info code is fine, make sure cmd exists though) ...
        let data = [];
        if (icmd.alias) data.push(`*Alias :* ${icmd.alias.join(", ")}`); // Use icmd
        if (icmd.desc) data.push(`*Description :* ${icmd.desc}\n`);    // Use icmd
        if (icmd.usage)
          data.push(
            `*Example :* ${icmd.usage                           // Use icmd
              .replace(/%prefix/gi, prefix)
              .replace(/%command/gi, icmd.name)
              .replace(/%text/gi, text)}`
          );
        var buttonss = [ { buttonId: `${prefix}help`, buttonText: { displayText: `help` }, type: 1 } ];
        let buth = { text: `*Command Info*\n\n${data.join("\n")}`, footer: "Eternity", buttons: buttonss, headerType: 1, };
        return client.sendMessage(m.from, buth, { quoted: m });
    }
    
    // Command restrictions (keep, depends on global.ban)
    if (!isGroup && !iscreator) {
       return m.reply("*Commands can only be used in groups or by the bot owner.*");
    }
    if (global.ban && global.ban.includes(m.sender)) { // Check if ban array exists
        return m.reply(`You are banned from using commands ❌`);
    }

    // React (keep)
    if (icmd.react) {
       const reactm = { react: { text: icmd.react, key: m.key } };
       await client.sendMessage(m.from, reactm).catch(e => console.error("Error sending react:", e)); // Add catch
    }

    // Cooldown (keep)
    if (!cool.has(m.sender)) {
        cool.set(m.sender, new Collection());
    }
    const now = Date.now();
    const timestamps = cool.get(m.sender);
    const cdAmount = (icmd.cool || 0) * 1000; // Use icmd
    if (timestamps.has(m.sender)) {
        const expiration = timestamps.get(m.sender) + cdAmount;
        if (now < expiration) {
            let timeLeft = (expiration - now) / 1000;
            return await client.sendMessage(
                m.from, 
                { text: `⏳ Please wait ${timeLeft.toFixed(1)}s before using *${prefix}${icmd.name}* again.` }, 
                { quoted: m }
            ).catch(e => console.error("Error sending cooldown message:", e)); // Add catch
        }
    }
    // Only set timestamp if command will be executed
    if (cdAmount > 0) {
        timestamps.set(m.sender, now);
        setTimeout(() => timestamps.delete(m.sender), cdAmount);
    }


    // --- Execute Command ---
    console.log(chalk.greenBright(`Executing command: ${prefix}${icmd.name} by ${pushname} (${sender})`));
    await icmd.start(client, m, { // Use icmd
      name: "client ", // Static name? Consider removing or making dynamic
      metadata,
      pushName: pushname,
      participants,
      body, // Pass original body
      ban: global.ban || [], 
      args,
      ar,
      nsfw: global.nsfw || [], 
      isAdmin,
      groupAdmin,
      groupName,
      text: q, // Pass 'q' which is args.join(" ")
      wlc: global.wlc || [], 
      mods: global.mods || [], 
      quoted,
      flags,
      mentionByTag,
      mime,
      isBotAdmin,
      prefix,
      iscreator,
      command: icmd.name,
      commands: Commands, // Pass the command collection
      Function: Func, // Pass utility functions
      toUpper: function toUpper(query) { // Pass utility function
        return query.replace(/^\w/, (c) => c.toUpperCase());
      },
    });

  } catch (e) {
    console.error(chalk.redBright("--- Error in MessageHandler ---"));
    console.error(e); // Log the full error object
    // Optional: Send error message to user/owner
    // await client.sendMessage(m.from, { text: `An error occurred: ${e.message}`}, { quoted: m });
  }
}

// --- Export the handler function correctly ---
module.exports = { messageHandler: handleMessage }; 
