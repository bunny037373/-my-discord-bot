const { Client, GatewayIntentBits, Events } = require('discord.js');
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

  // Example ping command
  if (message.content === '!ping') {
    message.channel.send('Pong! 🏓').catch(console.error);
    return;
  }

  // Only check messages in the specific channel
  if (message.channel.id === TARGET_CHANNEL_ID) {
    // Check if message has attachments (images)
    const hasImage = message.attachments.some(att => att.contentType?.startsWith('image/') || att.name?.match(/\.(jpg|jpeg|png|gif)$/i));

    if (!hasImage) {
      try {
        await message.delete(); // delete message
        await message.reply({ 
          content: "I think you accidentally forgot to put in an image with your text.", 
          ephemeral: true // only visible to the user
        }).catch(() => {}); // catch errors silently
      } catch (err) {
        console.error("Failed to delete message or send ephemeral reply:", err);
      }
    }
  }
});

// Login
client.login(process.env.TOKEN);

// Web server for Render + UptimeRobot
const PORT = process.env.PORT || 30
