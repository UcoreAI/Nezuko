// Removed require("../heart"); - Avoid potential circular dependency if heart requires this too. Let index.js handle requiring both. Ensure heart.js runs FIRST if it sets globals needed here. Best practice would be to pass db/prefix explicitly instead of using globals.
require("../settings"); // Assuming 'prefa' might have been defined here, but we'll use ENV VAR instead.
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
const { table } = require("console");

// --- Fix #1: Use Environment Variable for MongoDB URI ---
const Mongo_URL = process.env.MONGODB_URI; 

// --- Fix #2: Use Environment Variable for Prefix ---
const prefix = process.env.PREFIX || '!'; // Default to '!' if PREFIX env var not set

// --- Fix #1 applied here ---
global.Levels = require("discord-xp");
if (Mongo_URL) { // Only try to set URL if it exists
  Levels.setURL(Mongo_URL); 
  console.log("Discord-XP: Attempting to connect to MongoDB...");
} else {
  console.warn("Discord-XP: MONGODB_URI environment variable not set. Leveling system will not work.");
}

console.log("Connected to the database1"); // This message might be misleading now, Mongoose connects below

const mongoose = require("mongoose");

// --- Fix #1 applied here ---
// Connect Mongoose only if the URL is provided
if (Mongo_URL) {
  main().catch((err) => console.error("Mongoose connection error:", err));
} else {
  console.warn("Mongoose: MONGODB_URI environment variable not set. Database features depending on Mongoose might not work.");
}

async function main() {
  console.log("Mongoose: Attempting to connect...");
  await mongoose.connect(Mongo_URL);
  console.log("Mongoose: Connection successful!");
}
global.user = require("../models/user"); // Assuming this defines a Mongoose schema

module.exports = async (client, m, commands, chatUpdate) => {
  try {
    let { type, isGroup, sender, from } = m;
    let body =
      type == "buttonsResponseMessage"
        ? m.message[type].selectedButtonId
        : type == "listResponseMessage"
        ? m.message[type].singleSelectReply.selectedRowId
        : type == "templateButtonReplyMessage"
        ? m.message[type].selectedId
        : m.text;
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
    let metadata = isGroup ? await client.groupMetadata(from) : {};
    let pushname = m.pushName || "NO name";
    let participants = isGroup ? metadata.participants : [sender];
    const groupName = isGroup ? metadata.subject : "";
    const iscreator = [...global.owner]
      .map((v) => v.replace(/[^0-9]/g, "") + "@s.whatsapp.net")
      .includes(m.sender);
    let groupAdmin = isGroup
      ? participants.filter((v) => v.admin !== null).map((v) => v.id)
      : [];
    const botNumber = await client.decodeJid(client.user.id);
    let isBotAdmin = isGroup ? groupAdmin.includes(botNumber) : false;
    let isAdmin = isGroup ? groupAdmin.includes(sender) : false;
    
    //////////Database\\\\\\\\\\\\\\\\
    // --- Fix #3: Use global.db (initialized in heart.js or index.js) ---
    // Ensure db is initialized before this handler runs!
    const _mods = global.db ? await global.db.get("mods") : []; 
    global.mods = _mods || [];
    const _ban = global.db ? await global.db.get("ban") : []; 
    global.ban = _ban || [];
    const _nsfw = global.db ? await global.db.get("nsfw") : []; 
    global.nsfw = _nsfw || [];
    let wel = global.db ? await global.db.get("events") : []; 
    global.wlc = wel || [];

    let isCmd = body.startsWith(prefix);
    let quoted = m.quoted ? m.quoted : m;
    let mime = (quoted.msg || m.msg)?.mimetype || " "; // Added optional chaining
    let isMedia = /image|video|sticker|audio/.test(mime);
    let budy = typeof m.text == "string" ? m.text : "";
    let args = body.trim().split(/ +/).slice(1);
    let ar = args.map((v) => v.toLowerCase());
    let text = (q = args.join(" "));
    const cmdName = prat
      .slice(prefix.length)
      .trim()
      .split(/ +/)
      .shift()
      .toLowerCase();
    const cmd =
      commands.get(cmdName) ||
      Array.from(commands.values()).find((v) =>
        v.alias.find((x) => x.toLowerCase() == cmdName)
      ) ||
      "";
    const icmd =
      commands.get(cmdName) ||
      Array.from(commands.values()).find((v) =>
        v.alias.find((x) => x.toLowerCase() == cmdName)
      );

    const mentionByTag =
      type == "extendedTextMessage" &&
      m.message.extendedTextMessage.contextInfo != null
        ? m.message.extendedTextMessage.contextInfo.mentionedJid
        : [];
    const flags = args.filter((arg) => arg.startsWith("--"));

    if (body.startsWith(prefix) && !icmd) {
      var rae = `https://i.ibb.co/c33ZHCx/wallpaperflare-com-wallpaper.jpg`;
      let txtt = `*${prefix}${cmdName}* is an ⛔ invalid command \nuse *${prefix}help* to see help menu`;
      // Consider checking if client.sendMessage exists before calling
      if (client.sendMessage) {
         client.sendMessage(m.from, {image:{url:rae}, caption:txtt}, { quoted: m });
      }
     
    }

    // Logging (Keep as is)
    if (m.message && isGroup && cmd) {
      console.log(
        "" + "\n" + chalk.black(chalk.bgWhite("[ GRUP ]")),
        chalk.black(
          chalk.bgBlueBright(isGroup ? metadata.subject : m.pushName)
        ) +
          "\n" +
          chalk.black(chalk.bgWhite("[ TIME ]")),
        chalk.black(chalk.bgBlueBright(new Date())) +
          "\n" +
          chalk.black(chalk.bgWhite("[ FROM ]")),
        chalk.black(
          chalk.bgBlueBright(m.pushName + " @" + m.sender.split("@")[0])
        ) +
          "\n" +
          chalk.black(chalk.bgWhite("[ BODY ]")),
        chalk.black(chalk.bgBlueBright(body || type)) + "\n" + ""
      );
    }
    if (m.message && !isGroup) {
      console.log(
        "" + "\n" + chalk.black(chalk.bgWhite("[ PRIV ]")),
        chalk.black(chalk.bgRedBright("PRIVATE CHAT")) +
          "\n" +
          chalk.black(chalk.bgWhite("[ TIME ]")),
        chalk.black(chalk.bgRedBright(new Date())) +
          "\n" +
          chalk.black(chalk.bgWhite("[ FROM ]")),
        chalk.black(
          chalk.bgRedBright(m.pushName + " @" + m.sender.split("@")[0])
        ) +
          "\n" +
          chalk.black(chalk.bgWhite("[ BODY ]")),
        chalk.black(chalk.bgRedBright(body || type)) + "\n" + ""
      );
    }

    // Anti-link logic (Keep as is, depends on global.mods which depends on global.db)
    if (isGroup && mods.includes(`${m.from}`)) {
        // ... (anti-link code remains unchanged) ...
         if (body.includes("://chat.whatsapp.com/")) {
           if (iscreator) {
             return m.reply("*Ohhh you are mod*");
           } else if (isAdmin) {
             return m.reply("*Ohhh you are admin*");
           } else {
             let key;
             key = {
               remoteJid: m.from,
               fromMe: false,
               id: m.id,
               participant: m.sender,
             };
             await client.sendMessage(m.from, { delete: key });
             await client.groupParticipantsUpdate(m.from, [m.sender], "remove");
           }
         }
    }
     if (isGroup && mods.includes(`${m.from}`)) {
       if (body.includes("://api.whatsapp.com/")) {
         if (iscreator) {
           return m.reply("*Ohhh you are mod*");
         } else if (isAdmin) {
           return m.reply("*Ohhh you are admin*");
         } else {
           let key;
           key = {
             remoteJid: m.from,
             fromMe: false,
             id: m.id,
             participant: m.sender,
           };
           await client.sendMessage(m.from, { delete: key });
           await client.groupParticipantsUpdate(m.from, [m.sender], "remove");
         }
       }
     }

    // Discord-XP Leveling (Keep as is, depends on Mongo_URL)
    if (cmd && Mongo_URL && Levels.appendXp) { // Check if Levels system is available
      try {
          const randomXp = Math.floor(Math.random() * 3) + 1; 
          const haslUp = await Levels.appendXp(m.sender, "bot", randomXp);
          // Maybe add logic for level up notifications if haslUp is true
      } catch (xpError) {
          console.error("Error appending XP:", xpError);
          // Decide if you want to notify the user or just log the error
      }
    }
    
    // --info flag (Keep as is)
    if (text.endsWith("--info")) {
        // ... (--info code remains unchanged) ...
         let data = [];
         if (cmd.alias) data.push(`*Alias :* ${cmd.alias.join(", ")}`);

         if (cmd.desc) data.push(`*Description :* ${cmd.desc}\n`);
         if (cmd.usage)
           data.push(
             `*Example :* ${cmd.usage
               .replace(/%prefix/gi, prefix)
               .replace(/%command/gi, cmd.name)
               .replace(/%text/gi, text)}`
           );
         var buttonss = [
           {
             buttonId: `${prefix}help`,
             buttonText: { displayText: `help` },
             type: 1,
           },
         ];
         let buth = {
           text: `*Command Info*\n\n${data.join("\n")}`,
           footer: "Eternity",
           buttons: buttonss,
           headerType: 1,
         };
         return client.sendMessage(m.from, buth, { quoted: m });
    }

    // Command restrictions and checks (Keep as is, depends on global.ban)
    if (!isGroup && cmd && !iscreator)
      return m.reply("*You cant use commands in dm*");
    if (cmd) {
      if (ban.includes(`${m.sender}`))
        return m.reply(`You are banned from using commands ❌`);
    }
    
    // React if configured (Keep as is)
    if (cmd.react) {
      const reactm = {
        react: {
          text: cmd.react,
          key: m.key,
        },
      };
      await client.sendMessage(m.from, reactm);
    }

    // Cooldown logic (Keep as is)
    if (!cool.has(m.sender)) {
        // ... (cooldown code remains unchanged) ...
         cool.set(m.sender, new Collection());
    }
     const now = Date.now();
     const timestamps = cool.get(m.sender);
     const cdAmount = (cmd.cool || 0) * 1000;
     if (timestamps.has(m.sender)) {
       const expiration = timestamps.get(m.sender) + cdAmount;

       if (now < expiration) {
         let timeLeft = (expiration - now) / 1000;
         //printSpam(isGroup, sender);
         return await client.sendMessage(
           m.from,
           {
             text: `You are on cooldown, please wait another _${timeLeft.toFixed(
               1
             )} second(s)_`,
           },
           { quoted: m }
         );
       }
     }
     timestamps.set(m.sender, now);
     setTimeout(() => timestamps.delete(m.sender), cdAmount);


    // Execute command (Keep as is, but ensure all passed variables are defined)
     if (cmd && typeof cmd.start === 'function') { // Add check if cmd.start is a function
        cmd.start(client, m, {
         name: "client ", // This seems static, maybe should be dynamic?
         metadata,
         pushName: pushname,
         participants,
         body,
         ban: global.ban || [], // Pass defaults if global is undefined
         args,
         ar,
         nsfw: global.nsfw || [], // Pass defaults if global is undefined
         isAdmin,
         groupAdmin,
         groupName,
         text,
         wlc: global.wlc || [], // Pass defaults if global is undefined
         mods: global.mods || [], // Pass defaults if global is undefined
         quoted,
         flags,
         mentionByTag,
         mime,
         isBotAdmin,
         prefix,
         iscreator,
         command: cmd.name,
         commands,
         Function: Func,
         toUpper: function toUpper(query) {
           return query.replace(/^\w/, (c) => c.toUpperCase());
         },
       });
     } else if (cmd) {
        console.error(`Command ${cmd.name} exists but has no start function.`);
     }
     
  } catch (e) {
    console.error("Error in MessageHandler:", e); // Log the actual error object
  }
};
