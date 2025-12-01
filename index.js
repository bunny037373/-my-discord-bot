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
client.on('messageCreate', (message) => {
    if (message.author.bot) return;
    if (message.content === '!ping') {
        message.channel.send('Pong! 🏓').catch(console.error);
    }
});

// Login using environment variable (set TOKEN in Render)
if (!process.env.TOKEN) {
    console.error('❌ No TOKEN environment variable found!');
    process.exit(1);
}
client.login(process.env.TOKEN).catch(console.error);

// Minimal HTTP server to keep Render alive
const PORT = process.env.PORT || 3000;
http.createServer((req, res) => {
    res.writeHead(200, { 'Content-Type': 'text/plain' });
    res.end('Bot is running!');
}).listen(PORT, () => console.log(`🌐 Web server running on port ${PORT}`));
+