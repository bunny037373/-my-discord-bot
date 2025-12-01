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
    console.log(`✅ Logged in as ${client.user.tag}`);
});

client.on('messageCreate', message => {
    if (message.author.bot) return;
    if (message.content === '!ping') message.channel.send('Pong! 🏓');
});

client.login(process.env.TOKEN);

// Minimal HTTP server to keep Render alive
const server = http.createServer((req, res) => {
    res.writeHead(200);
    res.end('Bot is running!');
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`🌐 Web server running on port ${PORT}`));
