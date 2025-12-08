// =====================================================
// FIXED INDEX.JS
// =====================================================

const {
  Client,
  GatewayIntentBits,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  REST,
  Routes,
  SlashCommandBuilder,
  PermissionsBitField,
  Partials,
  AttachmentBuilder
} = require('discord.js');
const http = require('http');
const fs = require('fs');

// --- SAFETY CHECK ---
if (!process.env.TOKEN) {
  console.error("❌ TOKEN not found. Add TOKEN in Render Environment Variables.");
  // On some hosts, we might want to keep the web server alive even if token fails
}

// ====================== CONFIGURATION ======================

// IMPORTANT: ENSURE THESE IDs ARE CORRECT FOR YOUR SERVER
const TARGET_CHANNEL_ID      = '1415134887232540764'; // Image-only channel
const GUILD_ID               = '1369477266958192720'; 
const LOG_CHANNEL_ID         = '1414286807360602112';           
const TRANSCRIPT_CHANNEL_ID  = '1414354204079689849';   
const SETUP_POST_CHANNEL     = '1445628128423579660';       
const MUTE_ROLE_ID           = '1446530920650899536';            
const RP_CHANNEL_ID          = '1421219064985948346';
const RP_CATEGORY_ID         = '1446530920650899536'; // Category to lock down

// IMAGE CONFIG - Uses local file instead of URL
const STORMY_LOCAL_FILE = './stormy.png'; 

// TIMINGS
const NICKNAME_SCAN_INTERVAL = 10 * 1000; // 10 seconds (optimized)
const JOIN_TRACKER_CLEANUP   = 60 * 60 * 1000; // 1 hour

const HELP_MESSAGE = `hello! Do you need help?
Please go to <#1414304297122009099>
and for more assistance please use the ticket channel to tell a mod.`;

// ====================== FILTER LISTS ======================

const ALLOWED_WORDS = [
  "assist", "assistance", "assistant", "associat", 
  "class", "classic", "glass", "grass", "pass", "bass", "compass", 
  "hello", "shell", "peacock", "cocktail", "babcock"
];

// 1. DELETE ONLY (Mild)
const MILD_BAD_WORDS = [
  "fuck", "f*ck", "f**k", "f-ck", "fck", "fu-", "f-", "f*cking", "fucking",
  "shit", "s*it", "s**t", "sh!t",
  "ass", "bitch", "hoe", "whore", "slut", "cunt", 
  "dick", "pussy", "cock", "bastard", "sexy",
];

// 2. TIMEOUT (Severe)
const SEVERE_WORDS = [
  "nigger", "nigga", "niga", "faggot", "fag", "dyke", "tranny", "chink", "kike", "paki", "gook", "spic", "beaner", "coon", 
  "retard", "spastic", "mong", "autist",
  "kys", "kill yourself", "suicide", "rape", "molest",
  "hitler", "nazi", "kkk",
  "joke about harassing", "troll joke", "harassment funny", "trolling funny", "trollin", "troller"
];

const BAD_WORDS = [...MILD_BAD_WORDS, ...SEVERE_WORDS];

const LEET_MAP = {
  '0': 'o', '1': 'i', '3': 'e', '4': 'a', '5': 's', '7': 't', '@': 'a', '$': 's', '!': 'i', '(': 'c', '+': 't'
};

// ====================== STATE TRACKING ======================
const joinTracker = new Map(); 

// Cleanup function to prevent memory leaks in joinTracker
setInterval(() => {
  const now = Date.now();
  joinTracker.forEach((value, key) => {
    if (now - value.lastJoin > 30 * 60 * 1000) { // If inactive for 30 mins
      joinTracker.delete(key);
    }
  });
}, JOIN_TRACKER_CLEANUP);

// ====================== CLIENT SETUP ======================
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildMembers 
  ],
  partials: [Partials.Channel, Partials.Message]
});

// ====================== HELPERS ======================

function getModeratorRoles(guild) {
  return guild.roles.cache.filter(role => {
    if (role.managed) return false;
    const p = role.permissions;
    return p.has(PermissionsBitField.Flags.ManageMessages) || 
           p.has(PermissionsBitField.Flags.ModerateMembers) || 
           p.has(PermissionsBitField.Flags.KickMembers) || 
           p.has(PermissionsBitField.Flags.BanMembers);
  });
}

function containsFilteredWord(text, wordList) {
  if (!text) return false;
  let lower = text.toLowerCase();

  // Remove Allowed Words first
  ALLOWED_WORDS.forEach(safeWord => {
      if (lower.includes(safeWord)) lower = lower.replaceAll(safeWord, '');
  });

  if (wordList.some(word => lower.includes(word))) return true;

  // Normalize Leetspeak
  let normalized = lower.split('').map(char => LEET_MAP[char] || char).join('');
  normalized = normalized.replace(/[^a-z]/g, ''); 

  return wordList.some(word => normalized.includes(word));
}

function containsBadWord(text) {
    return containsFilteredWord(text, BAD_WORDS);
}

async function moderateNickname(member) {
  if (!member.manageable) return false; // Bot can't change this user (Admin/Higher Role)

  if (containsFilteredWord(member.displayName, SEVERE_WORDS) || containsFilteredWord(member.displayName, MILD_BAD_WORDS)) {
    try {
      await member.setNickname("[moderated name]");
      const log = member.guild.channels.cache.get(LOG_CHANNEL_ID);
      if (log) log.send(`🛡️ **Nickname Moderated**\nUser: <@${member.id}>\nOld Name: ||${member.user.username}||`);
      return true; 
    } catch (err) {
      console.error(`Failed to moderate nickname for ${member.user.tag}:`, err);
    }
  }
  return false; 
}

async function runAutomatedNicknameScan(guild) {
    if (!guild) return; 
    let moderatedCount = 0;
    try {
        const members = await guild.members.fetch(); 
        for (const [id, member] of members) {
            if (member.user.bot) continue;
            if (await moderateNickname(member)) moderatedCount++;
        }
        // Only log if something actually happened to avoid spam
        if (moderatedCount > 0) {
            const log = guild.channels.cache.get(LOG_CHANNEL_ID);
            if (log) log.send(`✅ **Scan:** Moderated **${moderatedCount}** names.`);
        }
    } catch (error) {
        console.error('Automated Nickname Scan failed:', error);
    }
}

// ====================== EVENTS ======================

client.once('ready', async () => {
  console.log(`✅ Logged in as ${client.user.tag}`);

  // Anti-Invite / Wrong Server Protection
  client.guilds.cache.forEach(async (guild) => {
    if (guild.id !== GUILD_ID) {
        console.log(`❌ Unauthorized server: ${guild.name}. Leaving...`);
        await guild.leave().catch(console.error);
    }
  });

  client.user.setPresence({
    activities: [{ name: 'hopping around Toon Springs', type: 0 }],
    status: 'online'
  });

  // Start Scan Interval
  const guild = client.guilds.cache.get(GUILD_ID);
  if (guild) {
      runAutomatedNicknameScan(guild);
      setInterval(() => runAutomatedNicknameScan(guild), NICKNAME_SCAN_INTERVAL);
  }

  // Register Commands
  const commands = [
    new SlashCommandBuilder()
      .setName('say')
      .setDescription('Make the bot say something anonymously')
      .addStringOption(opt => opt.setName('text').setDescription('Text').setRequired(true)),

    new SlashCommandBuilder()
      .setName('sayrp')
      .setDescription('Speak as a character (Stormy or Hops)')
      .addStringOption(opt => 
        opt.setName('character')
          .setDescription('Character')
          .setRequired(true)
          .addChoices(
            { name: 'Stormy', value: 'stormy' },
            { name: 'Hops', value: 'hops' }
          ))
      .addStringOption(opt => opt.setName('message').setDescription('Message').setRequired(true)),

    new SlashCommandBuilder().setName('help').setDescription('Get help'),
    new SlashCommandBuilder().setName('serverinfo').setDescription('Server info'),
    new SlashCommandBuilder()
      .setName('kick').setDescription('Kick user')
      .addUserOption(opt => opt.setName('user').setDescription('User').setRequired(true)),
    new SlashCommandBuilder()
      .setName('ban').setDescription('Ban user')
      .addUserOption(opt => opt.setName('user').setDescription('User').setRequired(true)),
    new SlashCommandBuilder()
      .setName('timeout').setDescription('Timeout user')
      .addUserOption(opt => opt.setName('user').setDescription('User').setRequired(true))
      .addIntegerOption(opt => opt.setName('minutes').setDescription('Minutes').setRequired(true)),
    new SlashCommandBuilder()
      .setName('setup').setDescription('Post ticket panel'),
  ].map(c => c.toJSON());

  const rest = new REST({ version: '10' }).setToken(process.env.TOKEN);
  try {
    await rest.put(Routes.applicationGuildCommands(client.user.id, GUILD_ID), { body: commands });
    console.log('✅ Commands Registered');
  } catch (err) {
    console.error('Command Register Error:', err);
  }
});

// --- COMMAND HANDLING ---
client.on('interactionCreate', async (interaction) => {
  if (interaction.isChatInputCommand()) {
    
    // Permission Check
    const isMod = interaction.member.permissions.has(PermissionsBitField.Flags.ModerateMembers);
    if (['kick','ban','timeout','setup'].includes(interaction.commandName) && !isMod) {
      return interaction.reply({ content: '❌ Mods only.', ephemeral: true });
    }

    // /say
    if (interaction.commandName === 'say') {
      const text = interaction.options.getString('text');
      if (containsBadWord(text)) return interaction.reply({ content: "❌ Filtered.", ephemeral: true });
      await interaction.channel.send(text);
      return interaction.reply({ content: "✅ Sent.", ephemeral: true });
    }

    // /sayrp
    if (interaction.commandName === 'sayrp') {
      const char = interaction.options.getString('character');
      const msg = interaction.options.getString('message');
      
      if (containsBadWord(msg)) return interaction.reply({ content: "❌ Filtered.", ephemeral: true });

      let payload = { content: '', files: [] };

      if (char === 'stormy') {
        payload.content = `**Stormy Bunny:** ${msg}`;
        // Check if local file exists
        if (fs.existsSync(STORMY_LOCAL_FILE)) {
            const attachment = new AttachmentBuilder(STORMY_LOCAL_FILE, { name: 'stormy.png' });
            payload.files = [attachment];
        }
      } else {
        payload.content = `**Hops (Bot):** ${msg}`;
      }

      await interaction.channel.send(payload);
      return interaction.reply({ content: `✅ Sent as ${char}`, ephemeral: true });
    }

    // /help
    if (interaction.commandName === 'help') return interaction.reply({ content: HELP_MESSAGE, ephemeral: true });

    // /serverinfo
    if (interaction.commandName === 'serverinfo') {
      return interaction.reply({
        content: `**Server:** ${interaction.guild.name}\n**Members:** ${interaction.guild.memberCount}`,
        ephemeral: true
      });
    }

    // /kick
    if (interaction.commandName === 'kick') {
      const user = interaction.options.getUser('user');
      const member = interaction.guild.members.cache.get(user.id);
      if (member && member.kickable) {
          await member.kick();
          return interaction.reply({ content: `✅ Kicked ${user.tag}`, ephemeral: true });
      } else {
          return interaction.reply({ content: `❌ Cannot kick this user (missing perms or higher role).`, ephemeral: true });
      }
    }

    // /ban
    if (interaction.commandName === 'ban') {
      const user = interaction.options.getUser('user');
      if (interaction.guild.members.cache.get(user.id)?.bannable === false) {
           return interaction.reply({ content: `❌ Cannot ban this user.`, ephemeral: true });
      }
      await interaction.guild.members.ban(user.id);
      return interaction.reply({ content: `✅ Banned ${user.tag}`, ephemeral: true });
    }

    // /timeout
    if (interaction.commandName === 'timeout') {
      const user = interaction.options.getUser('user');
      const mins = interaction.options.getInteger('minutes');
      const member = interaction.guild.members.cache.get(user.id);
      if (member && member.moderatable) {
          await member.timeout(mins * 60 * 1000);
          return interaction.reply({ content: `✅ Timed out ${user.tag} for ${mins}m`, ephemeral: true });
      }
      return interaction.reply({ content: `❌ Cannot timeout this user.`, ephemeral: true });
    }

    // /setup
    if (interaction.commandName === 'setup') {
      const ch = client.channels.cache.get(SETUP_POST_CHANNEL);
      if (!ch) return interaction.reply({ content: '❌ Setup channel ID invalid.', ephemeral: true });
      
      const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('create_ticket').setLabel('Create Ticket').setStyle(ButtonStyle.Primary)
      );
      await ch.send({ content: 'Need help? Click below.', components: [row] });
      return interaction.reply({ content: '✅ Panel posted.', ephemeral: true });
    }
  }

  // --- BUTTON HANDLING (Tickets & Threads) ---
  if (interaction.isButton()) {
      
    // Ticket Creation
    if (interaction.customId === 'create_ticket') {
        const username = interaction.user.username.replace(/[^a-z0-9]/gi, '').substring(0, 10);
        const channelName = `ticket-${username}-${Math.floor(Math.random() * 1000)}`;
        
        const overwrites = [
            { id: interaction.guild.roles.everyone, deny: [PermissionsBitField.Flags.ViewChannel] },
            { id: interaction.user.id, allow: [PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.SendMessages] },
            { id: client.user.id, allow: [PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.SendMessages] }
        ];

        // Add mods
        getModeratorRoles(interaction.guild).forEach(r => {
            overwrites.push({ id: r.id, allow: [PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.SendMessages] });
        });

        const tChannel = await interaction.guild.channels.create({
            name: channelName,
            type: 0, // Guild Text
            permissionOverwrites: overwrites,
            parent: client.channels.cache.get(SETUP_POST_CHANNEL)?.parentId // Try to put in same category
        });

        const row = new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId('close_ticket').setLabel('Close Ticket').setStyle(ButtonStyle.Danger)
        );

        await tChannel.send({ content: `<@${interaction.user.id}> Welcome. Support will be here shortly.`, components: [row] });
        return interaction.reply({ content: `✅ Ticket created: ${tChannel}`, ephemeral: true });
    }

    // Close Ticket
    if (interaction.customId === 'close_ticket') {
        if (!interaction.member.permissions.has(PermissionsBitField.Flags.ManageMessages)) {
             return interaction.reply({ content: 'Mods only.', ephemeral: true });
        }
        
        await interaction.reply({ content: 'Saving transcript and closing...' });
        
        // Transcript Logic
        const msgs = await interaction.channel.messages.fetch({ limit: 100 });
        const transcript = msgs.reverse().map(m => `[${m.createdAt.toLocaleString()}] ${m.author.tag}: ${m.content} ${m.attachments.first()?.url || ''}`).join('\n');
        
        const log = client.channels.cache.get(TRANSCRIPT_CHANNEL_ID);
        if (log) {
            // Send as file if too long
            const attachment = new AttachmentBuilder(Buffer.from(transcript, 'utf-8'), { name: `transcript-${interaction.channel.name}.txt` });
            await log.send({ content: `Ticket Closed: ${interaction.channel.name}`, files: [attachment] });
        }
        
        setTimeout(() => interaction.channel.delete(), 3000);
    }

    // Thread: Archive
    if (interaction.customId === 'archive_thread') {
        if (interaction.channel.ownerId === interaction.user.id || interaction.member.permissions.has(PermissionsBitField.Flags.ManageMessages)) {
            await interaction.channel.setArchived(true);
            return interaction.reply({ content: '✅ Archived', ephemeral: true });
        }
        return interaction.reply({ content: '❌ Not your thread.', ephemeral: true });
    }
  }
});

// ====================== MESSAGE FILTERS ======================
client.on('messageCreate', async (message) => {
  if (message.author.bot) return;

  const content = message.content.toLowerCase();
  const member = message.member;

  // 1. RP Channel Lockdown
  if (message.channel.id === RP_CHANNEL_ID && containsBadWord(content)) {
      try {
          // Lock the category
          const cat = message.guild.channels.cache.get(RP_CATEGORY_ID);
          if (cat) await cat.permissionOverwrites.edit(message.guild.roles.everyone, { ViewChannel: false });
          
          await message.delete();
          const log = client.channels.cache.get(LOG_CHANNEL_ID);
          if (log) log.send(`🔒 **Lockdown Triggered** by <@${message.author.id}> in RP Channel.`);
      } catch (e) { console.error(e); }
      return;
  }

  // 2. Anti-Harassment (Mute)
  if (/(^|\s)(mute|ban|harass|troll|bullying)\s+(that|him|her|them)|you\s+(are|re)\s+(a|an)?\s+(troll|bully)/i.test(content)) {
      await message.delete();
      if (member && member.moderatable) await member.timeout(60 * 60 * 1000, "Harassment/Trolling");
      return;
  }

  // 3. Ad Filter
  if (/(subscribe|check out|follow).*(youtube|twitch|tiktok|insta)/i.test(content) && !content.includes('stormy')) {
      await message.delete();
      return;
  }

  // 4. Bad Words
  if (containsFilteredWord(content, SEVERE_WORDS)) {
      await message.delete();
      if (member && member.moderatable) await member.timeout(30 * 60 * 1000, "Severe Slur/Hate");
      const log = client.channels.cache.get(LOG_CHANNEL_ID);
      if (log) log.send(`🚨 **Filter (Severe):** <@${message.author.id}> ||${message.content}||`);
      return;
  }
  
  if (containsFilteredWord(content, MILD_BAD_WORDS)) {
      await message.delete();
      return;
  }

  // 5. Image Only Channel Logic
  if (message.channel.id === TARGET_CHANNEL_ID) {
      if (message.attachments.size === 0) {
          await message.delete();
      } else {
          // Auto Thread
          await message.react('✨');
          const thread = await message.startThread({
              name: `Thread: ${message.author.username}`,
              autoArchiveDuration: 60
          });
          
          const row = new ActionRowBuilder().addComponents(
             new ButtonBuilder().setCustomId('archive_thread').setLabel('Archive').setStyle(ButtonStyle.Danger)
          );
          await thread.send({ content: 'Controls:', components: [row] });
      }
  }
});

// ====================== JOIN/LEAVE TROLLING ======================
client.on('guildMemberAdd', async (member) => {
    // Check Name
    moderateNickname(member);

    // Check Rapid Joins
    const now = Date.now();
    const data = joinTracker.get(member.id) || { count: 0, lastJoin: 0 };
    
    // Reset if it's been over 15 mins since last join
    if (now - data.lastJoin > 15 * 60 * 1000) data.count = 0;

    data.count++;
    data.lastJoin = now;
    joinTracker.set(member.id, data);

    if (data.count >= 10) {
        if (member.bannable) {
            await member.ban({ reason: "Rapid Join/Leave Trolling" });
            const log = client.channels.cache.get(LOG_CHANNEL_ID);
            if (log) log.send(`🔨 **Auto-Ban:** ${member.user.tag} (Joined 10 times in 15m)`);
        }
    }
});

// ====================== START SERVER ======================
client.login(process.env.TOKEN);

// Keep-Alive for Render/Replit
const PORT = process.env.PORT || 3000;
http.createServer((req, res) => {
  res.writeHead(200);
  res.end("Bot is online.");
}).listen(PORT, () => console.log(`🌐 Web Server running on ${PORT}`));
