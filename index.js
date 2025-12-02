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

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildMembers
  ]
});

const TARGET_CHANNEL_ID = '1415134887232540764';
const GUILD_ID = '1369477266958192720';
const LOG_CHANNEL_ID = '1414286807360602112';

// BAD WORD FILTER
const BAD_WORDS = ['fuck','shit','ass','bitch'];

// SCAM FILTER
const SCAM_WORDS = ['free nitro','steam gift','crypto','wallet','airdrop','bitcoin','@everyone'];

/* ----------------------- READY + SLASH CMDS ----------------------- */

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
      ),

    new SlashCommandBuilder()
      .setName('help')
      .setDescription('Get help info (Only you can see)')
  ].map(cmd => cmd.toJSON());

  const rest = new REST({ version: '10' }).setToken(process.env.TOKEN);

  try {
    console.log('⚡ Registering slash commands...');
    await rest.put(
      Routes.applicationGuildCommands(client.user.id, GUILD_ID),
      { body: commands }
    );
    console.log('✅ Commands registered!');
  } catch (err) {
    console.error(err);
  }
});

/* ----------------------- SLASH COMMAND HANDLER ----------------------- */

client.on('interactionCreate', async (interaction) => {

  /* /SAY */
  if (interaction.isChatInputCommand() && interaction.commandName === 'say') {
    const text = interaction.options.getString('text');

    await interaction.channel.send(text);
    return interaction.reply({ content: '✅ Sent as bot (anonymous)', ephemeral: true });
  }

  /* /HELP */
  if (interaction.isChatInputCommand() && interaction.commandName === 'help') {
    return interaction.reply({
      content:
        "hello! Do you need help?\n\n" +
        "Please go to:\n" +
        "https://discord.com/channels/1369477266958192720/1414304297122009099\n\n" +
        "For more assistance please use:\n" +
        "https://discord.com/channels/1369477266958192720/1414352972304879626\n\n" +
        "To tell a mod: <@557628352828014614>",
      ephemeral: true
    });
  }



  /* BUTTONS - BAN & KICK */

  if (interaction.isButton()) {
    const member = interaction.guild.members.cache.get(interaction.customId.split('_')[1]);

    if (!interaction.member.permissions.has(PermissionsBitField.Flags.ModerateMembers)) {
      return interaction.reply({ content: "❌ You don't have permission.", ephemeral: true });
    }

    if (interaction.customId.startsWith('kick_')) {
      await member.kick();
      await interaction.reply({ content: `✅ Kicked ${member.user.tag}`, ephemeral: true });
    }

    if (interaction.customId.startsWith('ban_')) {
      await member.ban();
      await interaction.reply({ content: `✅ Banned ${member.user.tag}`, ephemeral: true });
    }
  }
});

/* ----------------------- MESSAGE FILTER SYSTEM ----------------------- */

client.on('messageCreate', async (message) => {
  if (message.author.bot) return;

  const text = message.content.toLowerCase();

  /* DELETE CUSS WORDS */
  if (BAD_WORDS.some(word => text.includes(word))) {
    await message.delete().catch(()=>{});
    return;
  }

  /* SCAM / SPAM DETECT */
  if (SCAM_WORDS.some(w => text.includes(w)) || message.mentions.everyone) {

    await message.delete().catch(()=>{});

    try {
      const member = message.member;

      // Timeout for 5 minutes
      await member.timeout(5 * 60 * 1000, 'Spam/Scam detected');

      // Send mod buttons in LOG channel
      const log = client.channels.cache.get(LOG_CHANNEL_ID);

      const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId(`kick_${member.id}`)
          .setLabel("KICK")
          .setStyle(ButtonStyle.Danger),
        new ButtonBuilder()
          .setCustomId(`ban_${member.id}`)
          .setLabel("BAN")
          .setStyle(ButtonStyle.Danger)
      );

      await log.send({
        content: `🚨 **SCAM/SPAM DETECTED**\nUser: ${member}\nMessage: ${message.content}`,
        components: [row]
      });

    } catch (err) {
      console.error(err);
    }
    return;
  }

  /* FOREIGN LANGUAGE DETECT (simple unicode scan) */
  if (/[^\u0000-\u007F]/.test(message.content)) {
    await message.channel.send(
      "🌐 **Translation:** (Feature coming soon — detected non-English text)"
    );
  }

  /* IMAGE THREAD SYSTEM */
  if (message.channel.id === TARGET_CHANNEL_ID) {
    const hasImage = message.attachments.some(att =>
      att.contentType?.startsWith('image/') ||
      att.name?.match(/\.(jpg|jpeg|png|gif)$/i)
    );

    if (!hasImage) {
      await message.delete().catch(()=>{});
      return;
    }

    const thread = await message.startThread({
      name: `Thread: ${message.author.username}`,
      autoArchiveDuration: 60
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

    await thread.send({ content: 'Thread controls:', components: [row] });
  }
});


/* ----------------------- LOGIN + KEEP ALIVE ----------------------- */

client.login(process.env.TOKEN);

const PORT = process.env.PORT || 3000;
http.createServer((req, res) => {
  res.writeHead(200);
  res.end('Bot is running!');
}).listen(PORT, () => console.log(`🌐 Web server running on ${PORT}`));
