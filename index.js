const { Client, GatewayIntentBits } = require('discord.js');
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
    const hasImage = message.attachments.some(att => 
      att.contentType?.startsWith('image/') || 
      att.name?.match(/\.(jpg|jpeg|png|gif)$/i)
    );

    if (!hasImage) {
      try {
        await message.delete(); // delete text-only message instantly
      } catch (err) {
        console.error("Failed to delete message:", err);
      }
    }
  }
});

// Login
client.login(process.env.TOKEN);

// Minimal web server for Render uptime
const PORT = process.env.PORT || 3000;

http.createServer((req, res) => {
  res.writeHead(200, { 'Content-Type': 'text/plain' });
  res.end('Bot is running!');
}).listen(PORT, () => {
  console.log(`🌐 Web server running on port ${PORT}`);
});
