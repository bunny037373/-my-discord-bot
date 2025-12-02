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
const LOG_CHANNEL_ID = '1414286807360602112';

const HELP_MESSAGE = `hello! Do you need help?
Please go to https://discord.com/channels/1369477266958192720/1414304297122009099
and for more assistance please use
https://discord.com/channels/1369477266958192720/1414352972304879626
channel to create a more helpful environment to tell a mod`;

const BAD_WORDS = ["fuck", "shit", "ass", "bitch"];

// =====================================================

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildMembers
  ]
});

// ================= READY =================
client.once('ready', async () => {
  console.log(`✅ Logged in as ${client.user.tag}`);

  client.user.setPresence({
    activities: [{ name: 'hopping all around Toon Springs 🐇', type: 0 }],
    status: 'online'
  });

  const commands = [

    new SlashCommandBuilder()
      .setName('say')
      .setDescription('Make the bot say something anonymously')
      .addStringOption(option =>
        option.setName('text')
          .setDescription('Text for the bot to say')
          .setRequired(true)
      ),

    new SlashCommandBuilder()
      .setName('help')
      .setDescription('Get help'),

    new SlashCommandBuilder()
      .setName('serverinfo')
      .setDescription('Get server information'),

    new SlashCommandBuilder()
      .setName('kick')
      .setDescription('Kick a member')
      .addUserOption(option =>
        option.setName('user').setDescription('User to kick').setRequired(true)
      ),

    new SlashCommandBuilder()
      .setName('ban')
      .setDescription('Ban a member')
      .addUserOption(option =>
        option.setName('user').setDescription('User to ban').setRequired(true)
      ),

    new SlashCommandBuilder()
      .setName('unban')
      .setDescription('Unban a user by ID')
      .addStringOption(option =>
        option.setName('userid').setDescription('User ID').setRequired(true)
      ),

    new SlashCommandBuilder()
      .setName('timeout')
      .setDescription('Timeout a member (minutes)')
      .addUserOption(option =>
        option.setName('user').setDescription('User').setRequired(true)
      )
      .addIntegerOption(option =>
        option.setName('minutes').setDescription('Minutes').setRequired(true)
      )

  ].map(cmd => cmd.toJSON());

  const rest = new REST({ version: '10' }).setToken(process.env.TOKEN);

  try {
    console.log('⚡ Registering commands...');
    await rest.put(
      Routes.applicationGuildCommands(client.user.id, GUILD_ID),
      { body: commands }
    );
    console.log('✅ Slash commands registered.');
  } catch (err) {
    console.error(err);
  }
});

// ================= SLASH COMMANDS =================
client.on('interactionCreate', async (interaction) => {
  if (!interaction.isChatInputCommand()) return;

  const isMod = interaction.member.permissions.has(PermissionsBitField.Flags.ModerateMembers);

  if (interaction.commandName === 'say') {
    const text = interaction.options.getString('text');
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

  if (!isMod) {
    return interaction.reply({ content: '❌ Mods only', ephemeral: true });
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
});


// ================= AUTO MODERATION =================
client.on('messageCreate', async (message) => {
  if (message.author.bot) return;

  const content = message.content.toLowerCase();

  // DELETE CUSS WORDS
  if (BAD_WORDS.some(word => content.includes(word))) {
    await message.delete();
    return;
  }

  // DETECT SCAM / SPAM
  const suspicious =
    content.includes('free nitro') ||
    content.includes('bitcoin') ||
    content.includes('steam gift') ||
    content.includes('http://') ||
    content.includes('https://');

  if (suspicious) {
    await message.delete();

    try {
      const member = message.member;
      await member.timeout(5 * 60 * 1000);

      const log = client.channels.cache.get(LOG_CHANNEL_ID);
      if (log) {
        log.send(`🚨 **Auto Timeout**  
User: ${message.author.tag}
Message: ${message.content}`);
      }
    } catch {}
    return;
  }

  // IMAGE ONLY CHANNEL THREAD SYSTEM
  if (message.channel.id === TARGET_CHANNEL_ID) {
    const hasImage = message.attachments.some(att =>
      att.contentType?.startsWith('image/') ||
      att.name?.match(/\.(jpg|jpeg|png|gif)$/i)
    );

    if (!hasImage) {
      await message.delete().catch(() => {});
      return;
    }

    const thread = await message.startThread({
      name: `Thread: ${message.author.username}`,
      autoArchiveDuration: 60,
      reason: 'Automatic'
    });

    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId('archive_thread')
        .setLabel('Archive Thread')
        .setStyle(ButtonStyle.Danger),

      new ButtonBuilder()
        .setCustomId('edit_title')
        .setLabel('Edit Title')
        .setStyle(ButtonStyle.Primary)
    );

    await thread.send({ content: "Thread controls:", components: [row] });
  }
});


// ================= THREAD BUTTONS =================
client.on('interactionCreate', async (interaction) => {
  if (!interaction.isButton()) return;

  const thread = interaction.channel;
  if (!thread.isThread()) {
    return interaction.reply({ content: "Use inside a thread", ephemeral: true });
  }

  if (interaction.customId === 'archive_thread') {
    await thread.setArchived(true);
    return interaction.reply({ content: "✅ Archived", ephemeral: true });
  }

  if (interaction.customId === 'edit_title') {
    await interaction.reply({ content: "Send new title. 30s.", ephemeral: true });

    const filter = m => m.author.id === interaction.user.id;
    const collector = thread.createMessageCollector({ filter, time: 30000, max: 1 });

    collector.on('collect', async (msg) => {
      await thread.setName(msg.content);
      await msg.delete();
      await interaction.followUp({ content: "✅ Title updated", ephemeral: true });
    });
  }
});


// ================= LOGIN + SERVER =================
client.login(process.env.TOKEN);

const PORT = process.env.PORT || 3000;
http.createServer((req, res) => {
  res.writeHead(200);
  res.end("Bot is running!");
}).listen(PORT, () => console.log(`🌐 Server running on ${PORT}`));
