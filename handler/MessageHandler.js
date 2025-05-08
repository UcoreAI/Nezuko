// No need to require settings or heart here anymore, index.js handles setup

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
// This function is called by index.js for every new message
async function handleMessage(client, m, commands, chatUpdate) { 
  try {
    // Basic message validation
    if (!m || !m.key || !m.sender || !m.from) {
       console.warn(chalk.yellow("[MessageHandler] Received incomplete message object:"), m);
       return; // Ignore incomplete messages
    }
    // Ignore status updates and potential Baileys noise
    if (m.key.remoteJid === "status@broadcast") return;
    if (m.key.id?.startsWith("BAE5") && m.key.id?.length === 16) return;
    if (m.key.id?.startsWith("3EB0") && m.key.id?.length === 12) return;

    // Essential data extraction (using smsg results from index.js)
    let { type, isGroup, sender, from, text: body, args, pushName, quoted, mime, isMedia } = m; 
    body = body || ""; // Ensure body is a string

    // Get prefix from global (set in index.js)
    const prefix = Commands.prefix || '!'; // Use prefix from Commands collection or default

    // Command Parsing Logic (improved)
    let isCmd = body.startsWith(prefix);
    let commandName = "";
    let commandArgs = []; // Use a different name than 'args' from smsg if needed
    let commandInputText = ""; // Text after command name

    if (isCmd) {
        const commandBody = body.slice(prefix.length).trim();
        const commandParts = commandBody.split(/ +/);
        commandName = commandParts.shift().toLowerCase();
        commandArgs = commandParts; // Arguments after the command name
        commandInputText = commandArgs.join(" ");
    }
    
    // Find the command
    const cmd = commandName ? ( 
      commands.get(commandName) ||
      Array.from(commands.values()).find((v) =>
        v.alias && Array.isArray(v.alias) && v.alias.find((x) => x.toLowerCase() == commandName) // Ensure alias is array
      )) : null; // Use null if no command name

    // Logging (only for valid commands)
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

    // --- Database Checks (ensure global.db is ready) ---
    if (!global.db) {
        console.error(chalk.red("[MessageHandler] DB not ready, cannot perform checks."));
        // Decide if commands that NEED db should be blocked here
        // if (cmd && cmd.needsDb) return m.reply("Database not ready, please wait.");
    } else {
        // Ban Check
        const banList = await global.db.get("ban").catch(() => []) || [];
        if (Array.isArray(banList) && banList.includes(sender)) {
            console.log(chalk.red(`User ${sender} is banned, blocking command.`));
            return m.reply(`You are banned from using commands ❌`);
        }
        
        // Anti-link Check (only if global.mods is available and setup)
        const modsList = await global.db.get("mods").catch(() => []) || [];
        if (isGroup && Array.isArray(modsList) && modsList.includes(from)) {
             if (body.includes("://chat.whatsapp.com/") || body.includes("://api.whatsapp.com/")) {
                const ownerArray = Array.isArray(global.owner) ? global.owner : [global.owner];
                const iscreator = ownerArray.map((v) => String(v).replace(/[^0-9]/g, "") + "@s.whatsapp.net").includes(sender);
                let groupAdmin = isGroup ? (await client.groupMetadata(from).catch(()=>({participants:[]}))).participants.filter(p=>p.admin).map(p=>p.id) : [];
                let isAdmin = isGroup ? groupAdmin.includes(sender) : false;

                if (!iscreator && !isAdmin) {
                   try {
                      console.log(chalk.yellow(`[Anti-Link] Removing user ${sender} from group ${from} for sending link.`));
                      await client.sendMessage(from, { delete: m.key });
                      await client.groupParticipantsUpdate(from, [sender], "remove");
                      // Maybe send a notification message?
                      // await client.sendText(from, `User @${sender.split('@')[0]} removed for sending a group link.`, null, { mentions: [sender] });
                   } catch (e) {
                      console.error(chalk.red(`[Anti-Link] Failed to remove user ${sender}:`), e);
                      m.reply(`Link detected! Failed to remove user.`); // Inform user if removal fails
                   }
                   return; // Stop further processing after removal
                }
             }
        }
    }
    
    // --- Command Execution ---
    
    // If it's not a command, stop here
    if (!isCmd || !cmd) return; 

    // Check if command is owner only
    if (cmd.owner && !iscreator) {
       return m.reply("Only the bot owner can use this command.");
    }

    // Check if command is group only
    if (cmd.group && !isGroup) {
        return m.reply("This command can only be used in groups.");
    }

    // Check if command requires admin
    if (cmd.admin && isGroup && !isAdmin) {
        return m.reply("You need to be a group admin to use this command.");
    }

    // Check if command requires bot to be admin
    if (cmd.botAdmin && isGroup && !isBotAdmin) {
        return m.reply("I need to be an admin in this group to execute this command.");
    }
    
    // Check if command requires NSFW enabled (assuming nsfw is stored per-group in DB)
    const nsfwList = global.db ? await global.db.get("nsfw").catch(()=>[]) || [] : [];
    if (cmd.nsfw && isGroup && (!Array.isArray(nsfwList) || !nsfwList.includes(from)) ) {
       return m.reply("NSFW commands are not enabled in this group.");
    }

    // Cooldown logic
    if (!iscreator) { // Owners bypass cooldown
        if (!cool.has(sender)) {
            cool.set(sender, new Collection());
        }
        const now = Date.now();
        const timestamps = cool.get(sender);
        const cdAmount = (cmd.cool || 3) * 1000; // Default 3 seconds cooldown if not specified
        if (timestamps.has(cmd.name)) { // Cooldown per command
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
        timestamps.set(cmd.name, now);
        setTimeout(() => timestamps.delete(cmd.name), cdAmount);
    }

    // React if configured
    if (cmd.react) {
       const reactm = { react: { text: cmd.react, key: m.key } };
       await client.sendMessage(m.from, reactm).catch(e => console.error("Error sending react:", e)); 
    }
    
    // --- Execute the command's start function ---
    console.log(chalk.greenBright(`Executing command: ${prefix}${cmd.name} by ${pushName} (${sender})`));
    await cmd.start(client, m, {
      name: "client", // Consider removing or making dynamic
      metadata: isGroup ? await client.groupMetadata(from).catch(()=>null) : {}, // Re-fetch or pass from above
      pushName: pushName,
      participants,
      body: m.body, // Pass the processed body from smsg
      ban: global.ban || [], 
      args: commandArgs, // Pass the parsed args
      ar: commandArgs.map(a => a.toLowerCase()), // Pass lowercase parsed args
      nsfw: global.nsfw || [], 
      isAdmin,
      groupAdmin,
      groupName,
      text: commandInputText, // Pass text after command name
      q: commandInputText, // Common alias for text
      wlc: global.wlc || [], 
      mods: global.mods || [], 
      quoted,
      flags, // Pass flags if your commands use them
      mentionByTag,
      mime,
      isBotAdmin,
      prefix,
      iscreator,
      command: cmd.name,
      commands: Commands, 
      Function: Func, 
      toUpper: function toUpper(query) { 
        return String(query).replace(/^\w/, (c) => c.toUpperCase()); // Ensure query is string
      },
    });

  } catch (e) {
    console.error(chalk.redBright("--- Error in MessageHandler ---"));
    console.error(e); 
    // Send error to owner (optional)
    // try {
    //    const ownerJid = (Array.isArray(global.owner) ? global.owner[0] : global.owner)?.replace(/[^0-9]/g, "") + "@s.whatsapp.net";
    //    if (ownerJid) {
    //       await client.sendText(ownerJid, `Error processing command from ${m.sender} in ${m.from}:\n${e.stack || e}`);
    //    }
    // } catch (errSend) {
    //    console.error("Failed to send error notification to owner:", errSend);
    // }
  }
}

// --- Export the handler function correctly for index.js ---
module.exports = { messageHandler: handleMessage }; 
