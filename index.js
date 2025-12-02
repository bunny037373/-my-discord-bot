// Import necessary modules
const { Client, GatewayIntentBits, ActionRowBuilder, ButtonBuilder, ButtonStyle, REST, Routes, SlashCommandBuilder } = require('discord.js');
const http = require('http');

if (!process.env.TOKEN) {
  console.error("❌ TOKEN not found. Add TOKEN in Render Environment Variables.");
  process.exit(1);
}

// Create Discord client
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent
  ]
});

const TARGET_CHANNEL_ID = '1415134887232540764';
const GUILD_ID = '1369477266958192720'; // Your server ID

// Register /say command when bot is ready
client.once('ready', async () => {
  console.log(`✅ Logged in as ${client.user.tag}`);

  const commands = [
    new SlashCommandBuilder()
      .setName('say')
      .setDescription('Make the bot say something anonymously')
      .addStringOption(option =>
        option.setName('text')
          .setDescription('Text for the bot to say')
          .setRequired(true)
      )
      .toJSON()
  ];

  const rest = new REST({ version: '10' }).setToken(process.env.TOKEN);

  try {
    console.log('⚡ Registering /say command...');
    await rest.put(
      Routes.applicationGuildCommands(client.user.id, GUILD_ID),
      { body: commands }
    );
    console.log('✅ /say command registered.');
  } catch (err) {
    console.error('Failed to register command:', err);
  }
});

// Handle slash commands
client.on('interactionCreate', async (interaction) => {
  if (interaction.isChatInputCommand()) {
    if (interaction.commandName === 'say') {
      const text = interaction.options.getString('text');

      // Send anonymously as the bot in the same channel
      try {
        await interaction.channel.send(text);
        await interaction.reply({ content: '✅ Message sent anonymously!', ephemeral: true });
      } catch (err) {
        console.error(err);
        await interaction.reply({ content: '❌ Failed to send message.', ephemeral: true });
      }
    }
  }

  // Handle buttons (archive/edit title)…
  if (interaction.isButton()) {
    const thread = interaction.channel;
    if (!thread.isThread()) {
      return interaction.reply({ content: 'This button must be used in a thread.', ephemeral: true });
    }

    if (interaction.customId === 'archive_thread') {
      try {
        await thread.setArchived(true);
        await interaction.reply({ content: 'Thread archived ✅', ephemeral: true });
      } catch (err) { console.error(err); }
    }

    if (interaction.customId === 'edit_title') {
      await interaction.reply({ content: 'Reply with the new thread title. You have 30 seconds.', ephemeral: true });

      const filter = m => m.author.id === interaction.user.id;
      const collector = thread.createMessageCollector({ filter, time: 30000, max: 1 });

      collector.on('collect', async (msg) => {
        try {
          await thread.setName(msg.content);
          await msg.delete();
          await interaction.followUp({ content: 'Thread title updated ✅', ephemeral: true });
        } catch (err) { console.error(err); }
      });

      collector.on('end', collected => {
        if (collected.size === 0) {
          interaction.followUp({ content: 'No new title received. Cancelled.', ephemeral: true });
        }
      });
    }
  }
});

// Message handler (image deletion, thread creation, reactions)
client.on('messageCreate', async (message) => {
  if (message.author.bot) return;

  if (message.channel.id !== TARGET_CHANNEL_ID) return;

  const hasImage = message.attachments.some(att =>
    att.contentType?.startsWith('image/') ||
    att.name?.match(/\.(jpg|jpeg|png|gif)$/i)
  );

  if (!hasImage) {
    try { await message.delete(); } catch { }
    return;
  }

  try { await message.react('✨'); } catch { }

  let thread;
  try {
    thread = await message.startThread({
      name: `Thread: ${message.author.username}`,
      autoArchiveDuration: 60,
      reason: 'Automatic thread creation'
    });
  } catch { return; }

  try {
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
    await thread.send({ content: 'Thread controls:', components: [row] });
  } catch { }
});

// Login
client.login(process.env.TOKEN);

// Web server for Render + UptimeRobot
const PORT = process.env.PORT || 3000;
http.createServer((req, res) => {
  res.writeHead(200, { 'Content-Type': 'text/plain' });
  res.end('Bot is running!');
}).listen(PORT, () => console.log(`🌐 Web server running on port ${PORT}`));
