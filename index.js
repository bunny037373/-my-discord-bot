const { Client, GatewayIntentBits } = require('discord.js');
const http = require('http');

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent
  ]
});

client.once('ready', () => {
  console.log('? Logged in as ' + client.user.tag);
});

client.on('messageCreate', message => {
  if (message.author.bot) return;
  if (message.content === '!ping') {
    message.channel.send('Pong! ??');
  }
});

if (!process.env.TOKEN) {
  console.error('? No TOKEN environment variable found!');
  process.exit(1);
}

client.login(process.env.TOKEN);

// Web server to keep Render service alive
const PORT = process.env.PORT || 3000;
http.createServer((req, res) => {
  res.writeHead(200, { 'Content-Type': 'text/plain' });
  res.end('Bot is running!');
}).listen(PORT, () => {
  console.log('?? Web server running on port ' + PORT);
});
