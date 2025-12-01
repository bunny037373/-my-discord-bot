const { Client, GatewayIntentBits } = require('discord.js');

// Make sure only to use intents you actually enabled
const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,           // Required for most basic functionality
        GatewayIntentBits.GuildMessages,    // For reading messages
        GatewayIntentBits.MessageContent    // Privileged, must be enabled in Dev Portal
    ]
});

client.once('ready', () => {
    console.log(`✅ Logged in as ${client.user.tag}`);
});

// Example test command
client.on('messageCreate', message => {
    if (message.author.bot) return; // ignore bot messages

    console.log(`${message.author.tag} said: ${message.content}`);

    if (message.content.toLowerCase() === '!ping') {
        message.channel.send('Pong! 🏓');
        console.log(`Responded to !ping from ${message.author.tag}`);
    }
});

client.login(process.env.TOKEN);
