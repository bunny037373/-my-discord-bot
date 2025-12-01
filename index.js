// Import necessary modules
const { Client, GatewayIntentBits } = require('discord.js');
const http = require('http');

// Create Discord client with required intents
const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent
    ]
});

// Bot ready event
client.once('ready', () => {
    console.log(`✅ Logged in as ${client.user.tag}`);
});

// Example command
client.on('messageCreate', message => {
    if (message.author.bot) return;
    if (message.content === '!ping') message.channel.send('Pong! 🏓');
});

// Login using environment variable (set on Render)
client.login(process.env.TOKEN);

// Minimal HTTP server to keep Render alive
const PORT = process.env.PORT || 3000;
http.createServer((req, res) => {
    res.writeHead(200);
    res.end('Bot is running!');
}).listen(PORT, () => console.log(`🌐 Web server running on port ${PORT}`));
