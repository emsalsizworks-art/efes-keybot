import { Client, GatewayIntentBits, Collection } from 'discord.js';
import { readFileSync, existsSync } from 'fs';
import { initDb } from './db.js';
import { execute as pingExecute } from './commands/ping.js';
import { execute as keyExecute } from './commands/key.js';
import { startServer } from './server.js';

let config;
if (process.env.TOKEN) {
    config = { token: process.env.TOKEN };
} else {
    config = JSON.parse(readFileSync('./config.json', 'utf-8'));
}

await initDb();
startServer();

const client = new Client({ intents: [GatewayIntentBits.Guilds] });

client.commands = new Collection();
client.commands.set('ping', pingExecute);
client.commands.set('key', keyExecute);

client.once('ready', () => {
    console.log(`✅ Bot giriş yaptı: ${client.user.tag}`);
});

client.on('interactionCreate', async interaction => {
    if (!interaction.isChatInputCommand()) return;

    const cmd = client.commands.get(interaction.commandName);
    if (!cmd) return;

    try {
        await cmd(interaction);
    } catch (e) {
        console.error(e);
        const msg = interaction.replied || interaction.deferred ? 'editReply' : 'reply';
        await interaction[msg]({ content: '❌ Bir hata oluştu.', ephemeral: true });
    }
});

client.login(config.token).catch(e => console.error('❌ Discord login failed:', e.message));
