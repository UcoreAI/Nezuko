// Relies on index.js for settings and global initializations (db, Levels, user, Mongo_URL, prefix)
const {
  generateWAMessage,
  areJidsSameUser,
  proto,
} = require("@whiskeysockets/baileys");
const { Function } = require("../lib"); // Assuming Function has helper methods
const { Collection, Simple } = require("../Organs/typings"); // Assuming these are custom classes/types
const { isUrl, isNumber } = Function; // Destructure from Function
const Func = require("../lib"); // Re-requiring lib? Usually only need one. Check usage.
const fs = require("fs");
const moment = require("moment-timezone");
const chalk = require("chalk");
const cool = new Collection(); // Cooldown collection

// --- Define the Handler Function ---
async function handleMessage(client, m, commands, chatUpdate) { 
  try {
    if (!m || !m.key || !m.sender || !m.from) {
       console.warn(chalk.yellow("[MessageHandler] Received incomplete message object:"), m);
       return; 
    }
    if (m.key.remoteJid === "status@broadcast") return;
    if (m.key.id?.startsWith("BAE5") && m.key.id?.length === 16) return;
    if (m.key.id?.startsWith("3EB0") && m.key.id?.length === 12) return;

    let { type, isGroup, sender, from, text: body, args, pushName, quoted, mime, isMedia } = m; 
    body = body || ""; 

    const prefix = Commands.prefix || '!'; // Get prefix from Commands collection (set in index.js)

    let isCmd = body.startsWith(prefix);
    let commandName = "";
    let commandArgs = []; 
    let commandInputText = ""; 

    if (isCmd) {
        const commandBody = body.slice(prefix.length).trim();
        const commandParts = commandBody.split(/ +/);
        commandName = commandParts.shift().toLowerCase();
        commandArgs = commandParts; 
        commandInputText = commandArgs.join(" ");
    }
    
    const cmd = commandName ? ( 
      commands.get(commandName) ||
      Array.from(commands.values()).find((v) =>
        v.alias && Array.isArray(v.alias) && v.alias.find((x) => x.toLowerCase() == commandName) 
      )) : null; 

    // Logging
    if (isCmd && cmd) {
        let metadata = isGroup ? await client.groupMetadata(from).catch(() => null) : {};
        let groupName = isGroup ? metadata?.subject : "Private Chat";
        console.log(
          chalk.cyanBright(`[CMD] ${prefix}${commandName}`) + 
          chalk.yellow(` ${args.join(" ")}`) + 
          chalk.greenBright(` from ${pushName || 'Unknown'} (${sender.split('@')[0]})`) + 
          chalk.magentaBright(` in ${groupName || from}`)
        );
    }
    
    // --- Database Checks ---
    if (!global.db) {
        console.error(chalk.red("[MessageHandler] DB not ready for command checks."));
    } else {
        const banList = await global.db.get("ban").catch(() => []) || [];
        if (Array.isArray(banList) && banList.includes(sender)) {
            console.log(chalk.red(`User ${sender} is banned, blocking command.`));
            return m.reply(`You are banned from using commands ❌`);
        }
        
        const modsList = await global.db.get("mods").catch(() => []) || [];
        if (isGroup && Array.isArray(modsList) && modsList.includes(from)) {
             if (body.includes("://chat.whatsapp.com/") || body.includes("://api.whatsapp.com/")) {
                const ownerArray = Array.isArray(global.owner) ? global.owner : [global.owner];
                const iscreator = ownerArray.map((v) => String(v).replace(/[^0-9]/g, "") + "@s.whatsapp.net").includes(sender);
                let groupMetadataForAdminCheck = await client.groupMetadata(from).catch(()=>({participants:[]}));
                let groupAdmin = isGroup ? groupMetadataForAdminCheck.participants.filter(p=>p.admin).map(p=>p.id) : [];
                let isAdmin = isGroup ? groupAdmin.includes(sender) : false;

                if (!iscreator && !isAdmin) {
                   try {
                      console.log(chalk.yellow(`[Anti-Link] Removing user ${sender} from group ${from} for sending link.`));
                      await client.sendMessage(from, { delete: m.key });
                      await client.groupParticipantsUpdate(from, [sender], "remove");
                   } catch (e) {
                      console.error(chalk.red(`[Anti-Link] Failed to remove user ${sender}:`), e);
                      m.reply(`Link detected! Failed to remove user.`); 
                   }
                   return; 
                }
             }
        }
    }
    
    if (!isCmd || !cmd) return; 
    
    const ownerArrayForCmd = Array.isArray(global.owner) ? global.owner : [global.owner];
    const iscreator = ownerArrayForCmd.map((v) => String(v).replace(/[^0-9]/g, "") + "@s.whatsapp.net").includes(sender);
    
    if (cmd.owner && !iscreator) return m.reply("Only the bot owner can use this command.");
    if (cmd.group && !isGroup) return m.reply("This command can only be used in groups.");

    let metadataForAdminCheck = isGroup ? await client.groupMetadata(from).catch(()=>null) : {};
    let participantsForAdminCheck = isGroup && metadataForAdminCheck ? metadataForAdminCheck.participants : [];
    participantsForAdminCheck = participantsForAdminCheck || [];
    let groupAdminForCmd = isGroup ? participantsForAdminCheck.filter((v) => v.admin !== null).map((v) => v.id) : [];
    const botNumber = client.user?.id ? await client.decodeJid(client.user.id) : "";
    let isBotAdmin = isGroup ? groupAdminForCmd.includes(botNumber) : false;
    let isAdmin = isGroup ? groupAdminForCmd.includes(sender) : false;


    if (cmd.admin && isGroup && !isAdmin) return m.reply("You need to be a group admin to use this command.");
    if (cmd.botAdmin && isGroup && !isBotAdmin) return m.reply("I need to be an admin in this group to execute this command.");
    
    const nsfwList = global.db ? await global.db.get("nsfw").catch(()=>[]) || [] : [];
    if (cmd.nsfw && isGroup && (!Array.isArray(nsfwList) || !nsfwList.includes(from)) ) {
       return m.reply("NSFW commands are not enabled in this group.");
    }

    // Cooldown
    if (!iscreator) { 
        if (!cool.has(sender)) {
            cool.set(sender, new Collection());
        }
        const now = Date.now();
        const timestamps = cool.get(sender);
        const cdAmount = (cmd.cool || 3) * 1000; 
        if (timestamps.has(cmd.name)) { 
            const expiration = timestamps.get(cmd.name) + cdAmount;
            if (now < expiration) {
                let timeLeft = (expiration - now) / 1000;
                return await client.sendMessage(
                    m.from, 
                    { text: `⏳ Please wait ${timeLeft.toFixed(1)}s before using *${prefix}${cmd.name}* again.` }, 
                    { quoted: m }
                ).catch(e => console.error("Error sending cooldown message:", e)); 
            }
        }
        if (cdAmount > 0) {
            timestamps.set(cmd.name, now);
            setTimeout(() => timestamps.delete(cmd.name), cdAmount);
        }
    }

    // React
    if (cmd.react) {
       const reactm = { react: { text: cmd.react, key: m.key } };
       await client.sendMessage(m.from, reactm).catch(e => console.error("Error sending react:", e)); 
    }
    
    // XP System
    if (global.Levels && typeof Levels.appendXp === 'function' && process.env.MONGODB_URI) { 
       try {
          const randomXp = Math.floor(Math.random() * 3) + 1; 
          await Levels.appendXp(m.sender, "bot", randomXp); 
       } catch (xpError) {
          console.error("[XP System] Error appending XP:", xpError);
       }
    }
    
    // Execute Command
    console.log(chalk.greenBright(`Executing command: ${prefix}${cmd.name} by ${pushName} (${sender})`));
    await cmd.start(client, m, {
      name: "client", 
      metadata: isGroup ? await client.groupMetadata(from).catch(()=>null) : {}, 
      pushName: pushName,
      participants,
      body: m.body, 
      ban: global.ban || [], 
      args: commandArgs, 
      ar: commandArgs.map(a => a.toLowerCase()), 
      nsfw: global.nsfw || [], 
      isAdmin,
      groupAdmin: groupAdminForCmd, // Use the locally fetched one
      groupName: isGroup ? (await client.groupMetadata(from).catch(()=>null))?.subject : "Private Chat",
      text: commandInputText, 
      q: commandInputText, 
      wlc: global.wlc || [], 
      mods: global.mods || [], 
      quoted,
      flags, 
      mentionByTag,
      mime,
      isBotAdmin,
      prefix,
      iscreator,
      command: cmd.name,
      commands: Commands, 
      Function: Func, 
      toUpper: function toUpper(query) { 
        return String(query).replace(/^\w/, (c) => c.toUpperCase()); 
      },
    });

  } catch (e) {
    console.error(chalk.redBright("--- Error in MessageHandler ---"));
    console.error(e); 
  }
}

// --- Export the handler function correctly for index.js ---
module.exports = { messageHandler: handleMessage }; 
