const { Client, GatewayIntentBits, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
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

  // Only check the specific channel
  if (message.channel.id === TARGET_CHANNEL_ID) {
    // 1️⃣ Delete text-only messages (from previous requirement)
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
      return; // stop here if deleted
    }

    // 2️⃣ Create a thread automatically for this message
    try {
      const thread = await message.startThread({
        name: `Thread: ${message.author.username}`,
        autoArchiveDuration: 60, // in minutes
        reason: 'Automatic thread creation'
      });

      // 3️⃣ Add buttons
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

// Handle button clicks
client.on('interactionCreate', async (interaction) => {
  if (!interaction.isButton()) return;

  if (interaction.customId === 'archive_thread') {
    if (interaction.channel.isThread()) {
      await interaction.channel.setArchived(true);
      await interaction.reply({ content: 'Thread archived ✅', ephemeral: true });
    } else {
      await interaction.reply({ content: 'This button must be used in a thread.', ephemeral: true });
    }
  }

  if (interaction.customId === 'edit_title') {
    if (interaction.channel.isThread()) {
      await interaction.reply({ content: 'Send the new thread title now.', ephemeral: true });

      const filter = m => m.author.id === interaction.user.id;
      const collector = interaction.channel.parent.messages.createMessageCollector({ filter, time: 30000, max: 1 });

      collector.on('collect', async (msg) => {
        try {
          await interaction.channel.setName(msg.content);
          await msg.delete(); // remove the user's message for cleanliness
          await interaction.followUp({ content: 'Thread title updated ✅', ephemeral: true });
        } catch (err) {
          console.error(err);
        }
      });
    } else {
      await interaction.reply({ content: 'This button must be used in a thread.', ephemeral: true });
    }
  }
});

// Login
client.login(process.env.TOKEN);

// Web server for Render + UptimeRobot
const PORT = process.env.PORT || 3000;
http.createServer((req, res) => {
  res.writeHead(200, { 'Content-Type': 'text/plain' });
  res.end('Bot is running!');
}).listen(PORT, () => {
  console.log(`🌐 Web server running on port ${PORT}`);
});
