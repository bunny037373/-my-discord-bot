// Import necessary modules
const {
  Client,
  GatewayIntentBits,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  REST,
  Routes,
  SlashCommandBuilder,
  PermissionsBitField
} = require('discord.js');
const http = require('http');

if (!process.env.TOKEN) {
  console.error("❌ TOKEN not found. Add TOKEN in Render Environment Variables.");
  process.exit(1);
}

// ====================== CONFIG ======================
const TARGET_CHANNEL_ID = '1415134887232540764';
const GUILD_ID = '1369477266958192720';
const LOG_CHANNEL_ID = '1414286807360602112';          // existing log channel
const TRANSCRIPT_CHANNEL_ID = '1414354204079689849';   // transcript channel for closed tickets
const SETUP_POST_CHANNEL = '1445628128423579660';      // where /setup posts the Create Ticket message
const MUTE_ROLE_ID = '1446530920650899536';           // Placeholder: **REPLACE THIS WITH YOUR ACTUAL MUTE ROLE ID**

// NEW RP CONFIGURATION
const RP_CHANNEL_ID = '1421219064985948346';
const RP_CATEGORY_ID = '1446530920650899536';

const HELP_MESSAGE = `hello! Do you need help?
Please go to https://discord.com/channels/1369477266958192720/1414304297122009099
and for more assistance please use
https://discord.com/channels/1369477266958192720/1414352972304879626
channel to create a more helpful environment to tell a mod`;

// ================= STRICT FILTER CONFIG =================
// Comprehensive list of bad words, slurs, and bypass attempts (Includes Harassment Jokes/Trolling)
const BAD_WORDS = [
  "fuck", "f*ck", "f**k", "shit", "s*it", "s**t", "ass", "bitch", "hoe", "whore", "slut", "cunt", 
  "dick", "pussy", "cock", "bastard", 
  "nigger", "nigga", "niga", "faggot", "fag", "dyke", "tranny", "chink", "kike", "paki", "gook", "spic", "beaner", "coon", 
  "retard", "spastic", "mong", "autist",
  "kys", "kill yourself", "suicide", "rape", "molest",
  "hitler", "nazi", "kkk",
  "sexy",
  // Added Harassment/Trolling joke terms
  "joke about harassing", "troll joke", "harassment funny", "trolling funny", "trollin", "troller"
];

// Map for detecting Leetspeak bypasses (e.g. h0e -> hoe)
const LEET_MAP = {
  '0': 'o', '1': 'i', '3': 'e', '4': 'a', '5': 's', '7': 't', '@': 'a', '$': 's', '!': 'i', '(': 'c'
};

// ================= JOIN/LEAVE TRACKER =================
// Stores user ID -> { count: number, lastJoin: timestamp }
const joinTracker = new Map(); 

// =====================================================

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildMembers // Critical for join/leave detection
  ]
});

// Helper: find mod roles (roles that have ManageMessages or ModerateMembers)
function getModeratorRoles(guild) {
  return guild.roles.cache.filter(role => {
    if (role.managed) return false;
    const p = role.permissions;
    return p.has(PermissionsBitField.Flags.ManageMessages) || p.has(PermissionsBitField.Flags.ModerateMembers) || p.has(PermissionsBitField.Flags.KickMembers) || p.has(PermissionsBitField.Flags.BanMembers);
  });
}

// Helper: Normalize text to catch bypasses
function containsBadWord(text) {
  if (!text) return false;
  
  const lower = text.toLowerCase();
  
  // 1. Direct check
  if (BAD_WORDS.some(word => lower.includes(word))) return true;

  // 2. Normalize (Remove spaces, symbols, convert leetspeak)
  let normalized = lower.split('').map(char => LEET_MAP[char] || char).join('');
  normalized = normalized.replace(/[^a-z]/g, ''); // Remove non-letters

  // Check normalized string against bad words
  return BAD_WORDS.some(word => normalized.includes(word));
}

// Helper: Moderate Nickname 
async function moderateNickname(member) {
  // Check display name (which is nickname if set, or username if not)
  if (containsBadWord(member.displayName)) {
    try {
      // **Bot must have a higher role than the user's highest role for this to work**
      if (member.manageable) {
        await member.setNickname("[moderated nickname by hopper]");
        
        const log = member.guild.channels.cache.get(LOG_CHANNEL_ID);
        if (log) log.send(`🛡️ **Nickname Moderated**\nUser: <@${member.id}>\nOld Name: ||${member.user.username}||\nReason: Inappropriate Username`);
        return true; // Nickname was moderated
      } else {
         console.log(`Failed to moderate nickname for ${member.user.tag}: Bot role is lower than user's highest role.`);
         return false; // Nickname could not be moderated due to permissions
      }
    } catch (err) {
      console.error(`Failed to moderate nickname for ${member.user.tag}:`, err);
      return false;
    }
  }
  return false; // No moderation needed
}

/**
 * NEW AUTOMATION FUNCTION: Checks all nicknames in the guild.
 * This runs when the bot is ready to cover all existing members.
 */
async function runInitialNicknameScan(guild) {
    console.log('Starting automated initial nickname scan...');
    let moderatedCount = 0;
    
    try {
        const members = await guild.members.fetch();
        
        for (const [id, member] of members) {
            if (member.user.bot) continue;
            
            if (await moderateNickname(member)) {
                moderatedCount++;
            }
        }
        
        const log = guild.channels.cache.get(LOG_CHANNEL_ID);
        if (log) log.send(`✅ **Automated Nickname Scan Complete:** Checked ${members.size} members. Moderated **${moderatedCount}** inappropriate names.`);
        console.log(`Automated nickname scan complete. Moderated: ${moderatedCount}`);
        
    } catch (error) {
        console.error('Automated Nickname Scan failed:', error);
    }
}


// ================= READY (UPDATED) =================
client.once('ready', async () => {
  console.log(`✅ Logged in as ${client.user.tag}`);

  client.user.setPresence({
    activities: [{ name: 'hopping all around Toon Springs', type: 0 }],
    status: 'online'
  });

  // AUTOMATED NICKNAME CHECK ON STARTUP
  const guild = client.guilds.cache.get(GUILD_ID);
  if (guild) {
      // Run the full scan once when the bot starts/reconnects
      runInitialNicknameScan(guild); 
  }


  // Register slash commands (removed checknames)
  const commands = [
    new SlashCommandBuilder()
      .setName('say')
      .setDescription('Make the bot say something anonymously')
      .addStringOption(opt => opt.setName('text').setDescription('Text for the bot to say').setRequired(true)),

    new SlashCommandBuilder().setName('help').setDescription('Get help'),
    new SlashCommandBuilder().setName('serverinfo').setDescription('Get server information'),

    new SlashCommandBuilder()
      .setName('kick')
      .setDescription('Kick a member')
      .addUserOption(opt => opt.setName('user').setDescription('User to kick').setRequired(true)),

    new SlashCommandBuilder()
      .setName('ban')
      .setDescription('Ban a member')
      .addUserOption(opt => opt.setName('user').setDescription('User to ban').setRequired(true)),

    new SlashCommandBuilder()
      .setName('unban')
      .setDescription('Unban a user by ID')
      .addStringOption(opt => opt.setName('userid').setDescription('User ID').setRequired(true)),

    new SlashCommandBuilder()
      .setName('timeout')
      .setDescription('Timeout a member (minutes)')
      .addUserOption(opt => opt.setName('user').setDescription('User').setRequired(true))
      .addIntegerOption(opt => opt.setName('minutes').setDescription('Minutes').setRequired(true)),

    new SlashCommandBuilder()
      .setName('setup')
      .setDescription('Post the ticket creation message in the tickets channel'),
      
  ].map(c => c.toJSON());

  const rest = new REST({ version: '10' }).setToken(process.env.TOKEN);
  try {
    console.log('⚡ Registering commands...');
    await rest.put(Routes.applicationGuildCommands(client.user.id, GUILD_ID), { body: commands });
    console.log('✅ Slash commands registered.');
  } catch (err) {
    console.error('Failed to register commands:', err);
  }
});

// ================= SLASH COMMANDS (MODIFIED) =================
client.on('interactionCreate', async (interaction) => {
  if (interaction.isChatInputCommand()) {
    const isMod = interaction.member.permissions.has(PermissionsBitField.Flags.ModerateMembers) || interaction.member.permissions.has(PermissionsBitField.Flags.ManageMessages);

    // --- MOD ONLY COMMANDS CHECK ---
    // NOTE: The 'checknames' command is removed since it's now automated on startup.
    if (['kick','ban','unban','timeout','setup'].includes(interaction.commandName) && !isMod) {
      return interaction.reply({ content: '❌ Mods only', ephemeral: true });
    }
    
    // --- COMMAND LOGIC ---

    // Removed the 'checknames' command logic here.


    if (interaction.commandName === 'say') {
      const text = interaction.options.getString('text');
      // Filter /say command too
      if (containsBadWord(text)) return interaction.reply({ content: "❌ You cannot make me say that.", ephemeral: true });
      await interaction.channel.send(text);
      return interaction.reply({ content: "✅ Sent anonymously", ephemeral: true });
    }

    if (interaction.commandName === 'help') {
      return interaction.reply({ content: HELP_MESSAGE, ephemeral: true });
    }

    if (interaction.commandName === 'serverinfo') {
      const guild = interaction.guild;
      return interaction.reply({
        content:
          `**Server Name:** ${guild.name}\n**Members:** ${guild.memberCount}\n**Created:** ${guild.createdAt.toDateString()}`,
        ephemeral: true
      });
    }

    if (interaction.commandName === 'kick') {
      const user = interaction.options.getUser('user');
      const member = interaction.guild.members.cache.get(user.id);
      if (!member) return interaction.reply({ content: "User not found", ephemeral: true });
      await member.kick();
      return interaction.reply({ content: `✅ Kicked ${user.tag}`, ephemeral: true });
    }

    if (interaction.commandName === 'ban') {
      const user = interaction.options.getUser('user');
      await interaction.guild.members.ban(user.id);
      return interaction.reply({ content: `✅ Banned ${user.tag}`, ephemeral: true });
    }

    if (interaction.commandName === 'unban') {
      const id = interaction.options.getString('userid');
      await interaction.guild.members.unban(id);
      return interaction.reply({ content: `✅ Unbanned ${id}`, ephemeral: true });
    }

    if (interaction.commandName === 'timeout') {
      const user = interaction.options.getUser('user');
      const minutes = interaction.options.getInteger('minutes');
      const member = interaction.guild.members.cache.get(user.id);
      const duration = minutes * 60 * 1000;
      await member.timeout(duration);
      return interaction.reply({ content: `✅ Timed out ${user.tag} for ${minutes} minutes`, ephemeral: true });
    }

    if (interaction.commandName === 'setup') {
      try {
        const postChannel = await client.channels.fetch(SETUP_POST_CHANNEL);
        if (!postChannel) return interaction.reply({ content: 'Setup channel not found', ephemeral: true });

        const createRow = new ActionRowBuilder().addComponents(
          new ButtonBuilder().setCustomId('create_ticket').setLabel('Create Ticket').setStyle(ButtonStyle.Primary)
        );

        await postChannel.send({ content: 'Hello! Do you want to create a ticket?', components: [createRow] });
        return interaction.reply({ content: '✅ Setup message posted.', ephemeral: true });
      } catch (err) {
        console.error('Setup failed:', err);
        return interaction.reply({ content: '❌ Setup failed', ephemeral: true });
      }
    }
  }

  // Button interactions (tickets + thread buttons)
  if (interaction.isButton()) {
    // ... (Ticket button interaction logic remains the same) ...

    if (interaction.customId === 'create_ticket') {
      await interaction.deferReply({ ephemeral: true });

      try {
        const guild = interaction.guild;
        const member = interaction.member;
        const username = member.user.username.toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 12);
        const short = Math.floor(Math.random() * 9000 + 1000);
        const chanName = `ticket-${username}-${short}`;

        const modRoles = getModeratorRoles(guild);
        const overwrites = [
          { id: guild.roles.everyone.id, deny: [PermissionsBitField.Flags.ViewChannel] },
          { id: member.user.id, allow: [PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.SendMessages, PermissionsBitField.Flags.ReadMessageHistory] },
          { id: client.user.id, allow: [PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.SendMessages, PermissionsBitField.Flags.ManageChannels, PermissionsBitField.Flags.ReadMessageHistory] }
        ];

        modRoles.forEach(role => {
          overwrites.push({ id: role.id, allow: [PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.SendMessages, PermissionsBitField.Flags.ReadMessageHistory, PermissionsBitField.Flags.ManageMessages] });
        });

        let parent = null;
        try {
          const setupChan = await client.channels.fetch(SETUP_POST_CHANNEL);
          parent = setupChan.parentId || null;
        } catch {}

        const ticketChannel = await interaction.guild.channels.create({
          name: chanName,
          type: 0,
          permissionOverwrites: overwrites,
          parent: parent,
          reason: `Ticket created by ${member.user.tag}`
        });

        await interaction.editReply({ content: `Ticket created: ${ticketChannel}`, ephemeral: true });

        try {
          const setupChan = await client.channels.fetch(SETUP_POST_CHANNEL);
          await setupChan.send(`Ticket created ${ticketChannel} — added to Tickets catalog`);
        } catch {}

        let modMention = '';
        if (modRoles.size > 0) {
          modMention = modRoles.map(r => `<@&${r.id}>`).slice(0, 5).join(' ');
        } else {
          modMention = '@moderators';
        }

        const closeRow = new ActionRowBuilder().addComponents(
          new ButtonBuilder().setCustomId('claim_ticket').setLabel('Claim').setStyle(ButtonStyle.Success),
          new ButtonBuilder().setCustomId('close_ticket').setLabel('Close').setStyle(ButtonStyle.Danger)
        );

        await ticketChannel.send({
          content:
`hello! So ${modMention} Will be here any minute to claim the ticket, and whoever has that role and says something in the chat will automatically claim the ticket.
If they want to close it there will be a Close button on top. When close is confirmed, the transcript will be sent to <#${TRANSCRIPT_CHANNEL_ID}>.`,
          components: [closeRow]
        });

      } catch (err) {
        console.error('create_ticket error:', err);
        return interaction.editReply({ content: '❌ Failed to create ticket.', ephemeral: true });
      }
    }

    if (interaction.customId === 'claim_ticket') {
      const isMod = interaction.member.permissions.has(PermissionsBitField.Flags.ManageMessages) || interaction.member.permissions.has(PermissionsBitField.Flags.ModerateMembers) || interaction.member.permissions.has(PermissionsBitField.Flags.KickMembers);
      if (!isMod) return interaction.reply({ content: 'Only moderators can claim tickets.', ephemeral: true });

      const ch = interaction.channel;
      if (!ch || !ch.name.startsWith('ticket-')) return interaction.reply({ content: 'This button must be used in a ticket channel.', ephemeral: true });

      const topic = ch.topic || '';
      if (topic.startsWith('claimed:')) {
        return interaction.reply({ content: 'Ticket already claimed.', ephemeral: true });
      }

      try {
        await ch.setTopic(`claimed:${interaction.user.id}`);
        await interaction.reply({ content: `✅ Ticket claimed by ${interaction.user.tag}`, ephemeral: true });
        await ch.send(`✅ Ticket claimed by <@${interaction.user.id}>`);
      } catch (err) {
        console.error('claim_ticket error:', err);
        await interaction.reply({ content: 'Failed to claim ticket', ephemeral: true });
      }
    }

    if (interaction.customId === 'close_ticket') {
      const isMod = interaction.member.permissions.has(PermissionsBitField.Flags.ManageMessages) || interaction.member.permissions.has(PermissionsBitField.Flags.ModerateMembers) || interaction.member.permissions.has(PermissionsBitField.Flags.KickMembers);
      if (!isMod) return interaction.reply({ content: 'Only moderators can close tickets.', ephemeral: true });

      const ch = interaction.channel;
      if (!ch || !ch.name.startsWith('ticket-')) return interaction.reply({ content: 'This button must be used in a ticket channel.', ephemeral: true });

      const confirmRow = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('confirm_close_yes').setLabel('Yes, close').setStyle(ButtonStyle.Danger),
        new ButtonBuilder().setCustomId('confirm_close_no').setLabel('No, keep open').setStyle(ButtonStyle.Secondary)
      );

      await interaction.reply({ content: 'Are you sure you want to close this ticket? This will delete the channel after saving transcript.', components: [confirmRow], ephemeral: true });
    }

    if (interaction.customId === 'confirm_close_yes') {
      const isMod = interaction.member.permissions.has(PermissionsBitField.Flags.ManageMessages) || interaction.member.permissions.has(PermissionsBitField.Flags.ModerateMembers) || interaction.member.permissions.has(PermissionsBitField.Flags.KickMembers);
      if (!isMod) return interaction.reply({ content: 'Only moderators can close tickets.', ephemeral: true });

      const ch = interaction.channel;
      if (!ch || !ch.name.startsWith('ticket-')) return interaction.reply({ content: 'This must be used in the ticket channel.', ephemeral: true });

      await interaction.deferReply({ ephemeral: true });

      try {
        const fetched = await ch.messages.fetch({ limit: 100 });
        const msgs = Array.from(fetched.values()).reverse();

        let transcript = `Transcript for ${ch.name} (closed by ${interaction.user.tag})\n\n`;
        for (const m of msgs) {
          const time = m.createdAt.toISOString();
          const author = `${m.author.tag}`;
          const content = m.content || '';
          const atts = m.attachments.map(a => a.url).join(' ');
          transcript += `[${time}] ${author}: ${content} ${atts}\n`;
        }

        const tChan = await client.channels.fetch(TRANSCRIPT_CHANNEL_ID);
        if (tChan) {
          const MAX = 1900;
          if (transcript.length <= MAX) {
            await tChan.send({ content: `📄 **Ticket closed**: ${ch.name}\nClosed by ${interaction.user.tag}\n\n${transcript}` });
          } else {
            await tChan.send({ content: `📄 **Ticket closed**: ${ch.name}\nClosed by ${interaction.user.tag}\n\nTranscript (first part):` });
            while (transcript.length > 0) {
              const part = transcript.slice(0, MAX);
              transcript = transcript.slice(MAX);
              await tChan.send(part);
            }
          }
        }

        await interaction.editReply({ content: '✅ Transcript saved. Deleting ticket channel...', ephemeral: true });
        await ch.delete('Ticket closed');
      } catch (err) {
        console.error('confirm_close_yes error:', err);
        return interaction.editReply({ content: '❌ Failed to close ticket', ephemeral: true });
      }
    }

    if (interaction.customId === 'confirm_close_no') {
      return interaction.reply({ content: 'Close cancelled.', ephemeral: true });
    }
  }
});

// ================= AUTO MODERATION + RULES 1-11 + NEW RULES =================
client.on('messageCreate', async (message) => {
  if (message.author.bot) return;

  const content = message.content;
  const lowerContent = content.toLowerCase();
  const member = message.member;

  // RULE: INAPPROPRIATE RP LOCKDOWN 
  if (message.channel.id === RP_CHANNEL_ID && containsBadWord(lowerContent)) {
      const category = message.guild.channels.cache.get(RP_CATEGORY_ID);
      if (category && category.type === 4) { 
          try {
              const everyoneRole = message.guild.roles.cache.find(r => r.name === '@everyone');
              if (everyoneRole) {
                  await category.permissionOverwrites.edit(everyoneRole, { ViewChannel: false });
              }
              await message.delete().catch(() => {});
              const log = client.channels.cache.get(LOG_CHANNEL_ID);
              if (log) log.send(`🔒 **RP Category Lockdown**\nCategory <#${RP_CATEGORY_ID}> locked down due to suspicious/inappropriate RP attempt by <@${message.author.id}> in <#${RP_CHANNEL_ID}>.\nMessage: ||${message.content}||`);
              return; 
          } catch (e) {
              console.error("Failed to lock RP category:", e);
              message.channel.send(`⚠️ WARNING: Inappropriate content detected in <#${RP_CHANNEL_ID}>. Category lockdown failed. Manually review <@${message.author.id}>.`);
          }
      }
  }
  
  // RULE: REPETITIVE CHARACTER SPAM (15+ characters)
  const repetitiveRegex = /(.)\1{14,}/; 
  if (repetitiveRegex.test(content)) {
      await message.delete().catch(() => {});
      try {
          const warning = await message.channel.send(`Woah, sorry <@${message.author.id}>, but your message has been deleted because it contained more than 15 repetitive characters.`);
          setTimeout(() => warning.delete().catch(() => {}), 5000); 
      } catch (e) {
          console.error("Failed to send/delete spam warning:", e);
      }
      return;
  }
  
  // RULE: STRICT PERSONAL INFORMATION FILTER (NEW)
  const personalInfoRegex = /(\d{3}[-.\s]?\d{3}[-.\s]?\d{4})|(\b\d{4}[-.\s]?\d{4}[-.\s]?\d{4}[-.\s]?\d{4}\b)|(\b\d{16}\b)|(\b\d{9}\b)|(\b[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}\b)/;
  if (personalInfoRegex.test(content)) {
      await message.delete().catch(() => {});
      const log = client.channels.cache.get(LOG_CHANNEL_ID);
      if (log) log.send(`🔒 **Personal Info Filter**\nUser: <@${message.author.id}>\nChannel: <#${message.channel.id}>\nReason: Attempted to post sensitive PII (Phone/Card/Email/SSN pattern).`);
      return;
  }
  
  // RULE: ANTI-HARASSMENT / ANTI-TROLLING (MUTE) (NEW)
  // This mutes the user for explicit trolling/harassment directed at others.
  const explicitTrollHarassRegex = /(^|\s)(mute|ban|harass|troll|bullying)\s+(that|him|her|them)\s+(\S+|$)|(you\s+(are|re)\s+(a|an)?\s+(troll|bully|harasser))/i;

  if (explicitTrollHarassRegex.test(lowerContent)) {
      await message.delete().catch(() => {});

      const muteRole = message.guild.roles.cache.get(MUTE_ROLE_ID);
      if (member && muteRole && member.manageable) {
          try {
              // Mute for 60 minutes
              await member.timeout(60 * 60 * 1000, "Trolling/Harassment detected"); 
              
              const log = client.channels.cache.get(LOG_CHANNEL_ID);
              if (log) log.send(`🛑 **Harassment/Trolling Mute**\nUser: <@${message.author.id}> timed out for 60m.\nContent: ||${message.content}||\nReason: Detected explicit command or statement of harassment/trolling/bullying.`);
              
          } catch (e) {
              console.error("Failed to mute/log troll:", e);
          }
      }
      return;
  }
  
  // RULE: SELECTIVE ADVERTISING (NEW)
  const externalAdRegex = /(subscribe to my|go check out my|new video on|follow my insta|patreon|onlyfans|youtube\b|twitch\b|facebook\b|tiktok\b)/i;
  const allowedAds = /(stormy and hops|stormy & hops)/i;
  
  if (externalAdRegex.test(lowerContent) && !allowedAds.test(lowerContent)) {
      await message.delete().catch(() => {});
      const log = client.channels.cache.get(LOG_CHANNEL_ID);
      if (log) log.send(`📢 **Advertising Deleted**\nUser: <@${message.author.id}>\nContent: ||${message.content}||\nReason: External promotion/subscription attempt.`);
      return;
  }
  
  // RULE: POLITICAL CONTENT SOFT FILTER (NEW)
  // If political keyword count >= 4, it's considered "too much."
  const politicalKeywords = ['politics', 'government', 'election', 'congress', 'biden', 'trump', 'conservative', 'liberal', 'democracy', 'republican', 'democrat'];
  let politicalCount = 0;
  for (const keyword of politicalKeywords) {
      if (lowerContent.includes(keyword)) {
          politicalCount++;
      }
  }

  if (politicalCount >= 4) {
      await message.delete().catch(() => {});
      const log = client.channels.cache.get(LOG_CHANNEL_ID);
      if (log) log.send(`🗳️ **Political Content Filter**\nUser: <@${message.author.id}>\nContent: ||${message.content}||\nReason: Excessive political content (Count: ${politicalCount}).`);
      return;
  }


  // RULE 7: UNDERAGE CHECK
  const underageRegex = /\b(i|i'm|im)\s+(am\s+)?(under\s+13|1[0-2]|[1-9])\b/i;
  if (underageRegex.test(lowerContent)) {
    await message.delete().catch(() => {});
    const log = client.channels.cache.get(LOG_CHANNEL_ID);
    if (log) log.send(`👶 **Underage Admission Detected**\nUser: <@${message.author.id}>\nContent: ||${message.content}||\nAction: Deleted immediately.`);
    return;
  }

  // RULE 5: INAPPROPRIATE USERNAME CHECK (on message send)
  if (member) {
    await moderateNickname(member);
  }

  // RULE 1: Be Respectful / Strict Bad Word Filter / Racial Slurs / Bypass Detection (Catching harassment jokes)
  if (containsBadWord(lowerContent)) {
    await message.delete().catch(() => {});
    
    try {
      // 30 minute timeout for violation
      if (member) await member.timeout(30 * 60 * 1000, "Bad Word / Slur / Harassment Joke").catch(() => {});
      
      const log = client.channels.cache.get(LOG_CHANNEL_ID);
      if (log) log.send(`🚨 **Filter Violation**\nUser: <@${message.author.id}>\nContent: ||${message.content}||`);
    } catch {}
    return;
  }

  // RULE 4 & 6: Advertising / Scam / Links
  const isAdOrScam = 
    lowerContent.includes('discord.gg/') || 
    lowerContent.includes('free nitro') ||
    lowerContent.includes('steam gift') ||
    lowerContent.includes('crypto') ||
    lowerContent.includes('bitcoin');

  if (isAdOrScam) {
    await message.delete().catch(() => {});
    return;
  }

  // RULE 10: No Doxing (Basic IP detection)
  const ipRegex = /\b\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}\b/;
  if (ipRegex.test(lowerContent)) {
    await message.delete().catch(() => {});
    const log = client.channels.cache.get(LOG_CHANNEL_ID);
    if (log) log.send(`⚠️ **Possible Dox Attempt**\nUser: <@${message.author.id}>\nContent: ||${message.content}||`);
    return;
  }

  // IMAGE ONLY CHANNEL THREAD SYSTEM (existing)
  if (message.channel.id === TARGET_CHANNEL_ID) {
    const hasImage = message.attachments.some(att =>
      att.contentType?.startsWith('image/') ||
      att.name?.match(/\.(jpg|jpeg|png|gif)$/i)
    );

    if (!hasImage) {
      await message.delete().catch(() => {});
      return;
    }

    try { await message.react('✨'); } catch {}

    let thread;
    try {
      thread = await message.startThread({
        name: `Thread: ${message.author.username}`,
        autoArchiveDuration: 60,
        reason: 'Automatic'
      });
    } catch { return; }

    try {
      const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('archive_thread').setLabel('Archive Thread').setStyle(ButtonStyle.Danger),
        new ButtonBuilder().setCustomId('edit_title').setLabel('Edit Title').setStyle(ButtonStyle.Primary)
      );
      await thread.send({ content: "Thread controls:", components: [row] });
    } catch { }
  }
});

// ================= RULE 11: JOIN/LEAVE TROLLING =================
client.on('guildMemberAdd', async (member) => {
  // RULE 5: Check Nickname on Join
  await moderateNickname(member);

  const userId = member.id;
  const now = Date.now();
  
  // Get existing data
  const userData = joinTracker.get(userId) || { count: 0, lastJoin: 0 };

  // Reset count if last join was more than 15 minutes ago
  if (now - userData.lastJoin > 15 * 60 * 1000) {
    userData.count = 0;
  }

  userData.count++;
  userData.lastJoin = now;
  joinTracker.set(userId, userData);

  // Logic: "One is fine... ten there has to be something done."
  if (userData.count >= 10) {
    // Action: Ban the user for trolling
    try {
      await member.ban({ reason: 'Rule 11: Excessive Join/Leave Trolling' });
      const log = client.channels.cache.get(LOG_CHANNEL_ID);
      if (log) log.send(`🔨 **Auto-Ban (Anti-Troll)**\nUser: ${member.user.tag}\nReason: Joined ${userData.count} times rapidly.`);
      // clear tracking
      joinTracker.delete(userId);
    } catch (err) {
      console.error('Failed to ban troll:', err);
    }
  } else if (userData.count >= 6) {
    // Action: Log warning
    const log = client.channels.cache.get(LOG_CHANNEL_ID);
    if (log) log.send(`⚠️ **Troll Warning**\nUser: ${member.user.tag} has joined ${userData.count} times recently.`);
  }
});

// ================= THREAD BUTTONS =================
client.on('interactionCreate', async (interaction) => {
  if (!interaction.isButton()) return;

  if (interaction.customId === 'archive_thread' || interaction.customId === 'edit_title') {
    const thread = interaction.channel;
    if (!thread || !thread.isThread()) {
      return interaction.reply({ content: "Use inside a thread", ephemeral: true });
    }
    
    // Check if the user is the thread starter or a moderator
    const isThreadStarter = thread.ownerId === interaction.user.id;
    const isMod = interaction.member.permissions.has(PermissionsBitField.Flags.ManageMessages);

    if (!isThreadStarter && !isMod) {
        return interaction.reply({ content: "❌ Only the thread creator or a moderator can use these controls.", ephemeral: true });
    }

    if (interaction.customId === 'archive_thread') {
      await thread.setArchived(true);
      return interaction.reply({ content: "✅ Archived", ephemeral: true });
    }

    if (interaction.customId === 'edit_title') {
      await interaction.reply({ content: "Send new title. 30s.", ephemeral: true });
      const filter = m => m.author.id === interaction.user.id && m.channelId === thread.id;
      const collector = thread.createMessageCollector({ filter, time: 30000, max: 1 });
      collector.on('collect', async (msg) => {
        try {
            await thread.setName(msg.content.slice(0, 100)); // Limit length
            await msg.delete();
            await interaction.followUp({ content: "✅ Title updated", ephemeral: true });
        } catch (e) {
            console.error("Failed to edit thread title:", e);
            await interaction.followUp({ content: "❌ Failed to update title (Permissions or length)", ephemeral: true });
        }
      });
    }
  }
});

// ================= LOGIN + SERVER =================
client.login(process.env.TOKEN);

const PORT = process.env.PORT || 3000;
http.createServer((req, res) => {
  res.writeHead(200);
  res.end("Bot is running!");
}).listen(PORT, () => console.log(`🌐 Server running on ${PORT}`));
