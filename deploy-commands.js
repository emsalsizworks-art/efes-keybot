import { REST, Routes } from 'discord.js';
import { readFileSync, existsSync } from 'fs';
import { data as ping } from './commands/ping.js';
import { data as key } from './commands/key.js';

let config;
if (process.env.TOKEN) {
    config = { token: process.env.TOKEN, clientId: process.env.CLIENT_ID, guildId: process.env.GUILD_ID };
} else {
    config = JSON.parse(readFileSync('./config.json', 'utf-8'));
}
const commands = [ping, key.toJSON()];

const rest = new REST({ version: '10' }).setToken(config.token);

try {
    console.log('Eski komutlar temizleniyor...');
    await rest.put(Routes.applicationGuildCommands(config.clientId, config.guildId), { body: [] });

    console.log('Yeni komutlar kaydediliyor...');
    await rest.put(Routes.applicationGuildCommands(config.clientId, config.guildId), { body: commands });

    console.log(`✅ ${commands.length} komut kaydedildi.`);
} catch (e) {
    console.error('❌ Hata:', e);
}
