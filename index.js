const { Client, GatewayIntentBits, ActionRowBuilder, ButtonBuilder, ButtonStyle, Events } = require('discord.js');
const http = require('http');

if (!process.env.TOKEN) {
  console.error("❌ TOKEN not found. Add TOKEN in Render Environment Variables.");
  process.exit(1);
}

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent
  ]
});

const TARGET_CHANNEL_ID = '1415134887232540764';

client.once('ready', () => {
  console.log(`✅ Logged in as ${client.user.tag}`);
});

client.on('messageCreate', async (message) => {
  if (message.author.bot) return;

  if (message.channel.id === TARGET_CHANNEL_ID) {
    const hasImage = message.attachments.some(att => 
      att.contentType?.startsWith('image/') || 
      att.name?.match(/\.(jpg|jpeg|png|gif)$/i)
    );

    if (!hasImage) {
      try {
        await message.delete();
      } catch (err) {
        console.error("Failed to delete message:", err);
      }
      return;
    }

    try {
      const thread = await message.startThread({
        name: `Thread: ${message.author.username}`,
        autoArchiveDuration: 60,
        reason: 'Automatic thread creation'
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
    } catch (err) {
      console.error('Failed to create thread or add buttons:', err);
    }
  }
});

client.on('interactionCreate', async (interaction) => {
  if (!interaction.isButton()) return;

  if (!interaction.channel.isThread()) {
    return interaction.reply({ content: 'This button must be used in a thread.', ephemeral: true });
  }

  const thread = interaction.channel;

  if (interaction.customId === 'archive_thread') {
    try {
      await thread.setArchived(true);
      await interaction.reply({ content: 'Thread archived ✅', ephemeral: true });
    } catch (err) {
      console.error(err);
    }
  }

  if (interaction.customId === 'edit_title') {
    await interaction.reply({ content: 'Reply here with the new thread title. You have 30 seconds.', ephemeral: true });

    const filter = m => m.author.id === interaction.user.id;
    const collector = thread.createMessageCollector({ filter, time: 30000, max: 1 });

    collector.on('collect', async (msg) => {
      try {
        await thread.setName(msg.content);
        await msg.delete(); // clean up the user's message
        await interaction.followUp({ content: 'Thread title updated ✅', ephemeral: true });
      } catch (err) {
        console.error(err);
      }
    });

    collector.on('end', collected => {
      if (collected.size === 0) {
        interaction.followUp({ content: 'No new title received. Cancelled.', ephemeral: true });
      }
    });
  }
});

// Login
client.login(process.env.TOKEN);

// Web server for Render + UptimeRobot
const PORT = process.env.PORT || 3000;
http.createServer((req, res) => {
  res.writeHead(200, { 'Content-Type': 'text/plain' });
  res.end('Bot is running!');
}).listen(PORT, () => console.log(`🌐 Web server running on port ${PORT}`));
