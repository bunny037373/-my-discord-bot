const { Client, GatewayIntentBits } = require('discord.js');

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent
  ]
});

// When bot is ready
client.once('ready', () => {
  console.log(`✅ Logged in as ${client.user.tag}`);
});

// Respond to !ping
client.on('messageCreate', message => {
  // Ignore messages from bots
  if (message.author.bot) return;

  console.log(`${message.author.tag} said: ${message.content}`);

  if (message.content.toLowerCase() === '!ping') {
    message.channel.send('Pong! 🏓');
    console.log(`Responded to !ping from ${message.author.tag}`);
  }
});

// Login using token from environment variable
client.login(process.env.TOKEN);
