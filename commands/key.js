import { SlashCommandBuilder, PermissionFlagsBits, EmbedBuilder } from 'discord.js';
import { readFileSync } from 'fs';
import { getKey, insertKey, deleteKey, getAllKeys, getActiveKeyCount, getActivation, getKeyByHwid, banKey, unbanKey, banHwid, unbanHwid } from '../db.js';

const CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

function generateKey() {
    const segs = Array.from({ length: 4 }, () =>
        Array.from({ length: 4 }, () => CHARS[Math.floor(Math.random() * CHARS.length)]).join('')
    );
    return 'EFES-' + segs.join('-');
}

function parseDuration(str) {
    const s = str.toLowerCase();
    if (s === 'lifetime' || s === 'suresiz' || s === '0') return null;
    const d = s.match(/^(\d+)([shdmy])$/);
    if (!d) return null;
    const n = parseInt(d[1]);
    const now = new Date();
    switch (d[2]) {
        case 's': return new Date(now.getTime() + n * 1000);
        case 'h': return new Date(now.getTime() + n * 3600000);
        case 'd': return new Date(now.setDate(now.getDate() + n));
        case 'm': return new Date(now.setMonth(now.getMonth() + n));
        case 'y': return new Date(now.setFullYear(now.getFullYear() + n));
    }
    return null;
}

export const data = new SlashCommandBuilder()
    .setName('key')
    .setDescription('Key yönetim komutları')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)

    .addSubcommand(sub => sub
        .setName('create')
        .setDescription('Yeni key oluşturur')
        .addStringOption(opt => opt.setName('sure').setDescription('30s, 2h, 7d, 1m, 1y, lifetime').setRequired(true))
        .addIntegerOption(opt => opt.setName('adet').setDescription('Adet (1-50)').setMinValue(1).setMaxValue(50)))

    .addSubcommand(sub => sub
        .setName('list')
        .setDescription('Tüm keyleri listeler'))

    .addSubcommand(sub => sub
        .setName('delete')
        .setDescription('Key siler')
        .addStringOption(opt => opt.setName('key').setDescription('Silinecek key').setRequired(true)))

    .addSubcommand(sub => sub
        .setName('info')
        .setDescription('Key detayını gösterir')
        .addStringOption(opt => opt.setName('key').setDescription('Sorgulanacak key').setRequired(true)))

    .addSubcommand(sub => sub
        .setName('ban')
        .setDescription('Key banlar')
        .addStringOption(opt => opt.setName('key').setDescription('Banlanacak key').setRequired(true)))

    .addSubcommand(sub => sub
        .setName('unban')
        .setDescription('Key banını kaldırır')
        .addStringOption(opt => opt.setName('key').setDescription('Banı kaldırılacak key').setRequired(true)))

    .addSubcommand(sub => sub
        .setName('hwid-lookup')
        .setDescription('HWID ile key sorgular')
        .addStringOption(opt => opt.setName('hwid').setDescription('Sorgulanacak HWID').setRequired(true)))

    .addSubcommand(sub => sub
        .setName('ban-hwid')
        .setDescription('HWID banlar')
        .addStringOption(opt => opt.setName('hwid').setDescription('Banlanacak HWID').setRequired(true))
        .addStringOption(opt => opt.setName('sebep').setDescription('Ban sebebi')))

    .addSubcommand(sub => sub
        .setName('unban-hwid')
        .setDescription('HWID banını kaldırır')
        .addStringOption(opt => opt.setName('hwid').setDescription('Banı kaldırılacak HWID').setRequired(true)))

    .addSubcommand(sub => sub
        .setName('stats')
        .setDescription('İstatistikleri gösterir'));

export async function execute(interaction) {
    const sub = interaction.options.getSubcommand();
    const adminRole = process.env.ADMIN_ROLE || JSON.parse(readFileSync('./config.json', 'utf-8')).adminRole;

    if (!interaction.member.roles.cache.some(r => r.name === adminRole) && !interaction.member.permissions.has(PermissionFlagsBits.Administrator)) {
        return interaction.reply({ content: '❌ Yetkiniz yok.', ephemeral: true });
    }

    try {
        switch (sub) {
            case 'create': return await createKey(interaction);
            case 'list': return await listKeys(interaction);
            case 'delete': return await deleteKeyCmd(interaction);
            case 'info': return await keyInfo(interaction);
            case 'ban': return await banKeyCmd(interaction);
            case 'unban': return await unbanKeyCmd(interaction);
            case 'hwid-lookup': return await hwidLookup(interaction);
            case 'ban-hwid': return await banHwidCmd(interaction);
            case 'unban-hwid': return await unbanHwidCmd(interaction);
            case 'stats': return await stats(interaction);
        }
    } catch (e) {
        console.error(e);
        const msg = interaction.replied || interaction.deferred ? 'editReply' : 'reply';
        await interaction[msg]({ content: '❌ Bir hata oluştu.', ephemeral: true });
    }
}

async function createKey(interaction) {
    const sure = interaction.options.getString('sure');
    const adet = interaction.options.getInteger('adet') || 1;
    await interaction.deferReply({ ephemeral: true });

    const expiresAt = parseDuration(sure);

    const created = [];
    for (let i = 0; i < adet; i++) {
        const keyString = generateKey();
        await insertKey({ key_string: keyString, created_by: interaction.user.username, expires_at: expiresAt, max_uses: 1 });
        created.push(keyString);
    }

    const embed = new EmbedBuilder()
        .setColor(0x00ff00)
        .setTitle('✅ Key\'ler Oluşturuldu')
        .setDescription(created.map(k => `\`${k}\``).join('\n'))
        .addFields({ name: 'Süre', value: sure, inline: true }, { name: 'Adet', value: String(adet), inline: true })
        .setTimestamp();

    await interaction.editReply({ embeds: [embed] });
}

async function listKeys(interaction) {
    await interaction.deferReply({ ephemeral: true });
    const keys = await getAllKeys();
    if (!keys.length) return interaction.editReply('📭 Hiç key bulunamadı.');

    const activeCount = await getActiveKeyCount();
    const lines = keys.slice(0, 25).map(k => {
        const status = k.is_banned ? '🔴 Banlı' :
            (k.expires_at && new Date(k.expires_at) < new Date() ? '⚫ Süresi Dolmuş' : '🟢 Aktif');
        const expire = k.expires_at ? new Date(k.expires_at).toISOString().slice(0, 10) : 'Süresiz';
        return `\`${k.key_string}\` | ${status} | Bitiş: ${expire}`;
    });

    const embed = new EmbedBuilder()
        .setColor(0x3498db)
        .setTitle(`📋 Key Listesi (${keys.length} toplam, ${activeCount} aktif)`)
        .setDescription(lines.join('\n'))
        .setTimestamp();

    await interaction.editReply({ embeds: [embed] });
}

async function deleteKeyCmd(interaction) {
    const keyString = interaction.options.getString('key');
    const deleted = await deleteKey(keyString);
    await interaction.reply({ content: deleted ? `✅ \`${keyString}\` silindi.` : `❌ \`${keyString}\` bulunamadı.`, ephemeral: true });
}

async function keyInfo(interaction) {
    const keyString = interaction.options.getString('key');
    await interaction.deferReply({ ephemeral: true });

    const key = await getKey(keyString);
    if (!key) return interaction.editReply(`❌ \`${keyString}\` bulunamadı.`);

    const activation = await getActivation(key.id);

    const embed = new EmbedBuilder()
        .setColor(key.is_banned ? 0xff0000 : 0x00ff00)
        .setTitle('🔑 Key Bilgisi')
        .addFields(
            { name: 'Key', value: `\`${key.key_string}\``, inline: true },
            { name: 'Durum', value: key.is_banned ? '🔴 Banlı' : '🟢 Aktif', inline: true },
            { name: 'Oluşturan', value: key.created_by, inline: true },
            { name: 'Oluşturulma', value: new Date(key.created_at).toLocaleString('tr-TR'), inline: true },
            { name: 'Bitiş', value: key.expires_at ? new Date(key.expires_at).toISOString().slice(0, 10) : 'Süresiz', inline: true }
        );

    if (activation) {
        embed.addFields(
            { name: 'HWID', value: `\`${activation.hwid.slice(0, 40)}...\`` },
            { name: 'Aktivasyon', value: new Date(activation.activated_at).toLocaleString('tr-TR'), inline: true },
            { name: 'IP', value: activation.ip, inline: true }
        );
    } else {
        embed.addFields({ name: 'Aktivasyon', value: '❌ Henüz kullanılmamış' });
    }

    embed.setTimestamp();
    await interaction.editReply({ embeds: [embed] });
}

async function banKeyCmd(interaction) {
    const keyString = interaction.options.getString('key');
    await banKey(keyString);
    await interaction.reply({ content: `🔴 \`${keyString}\` banlandı.`, ephemeral: true });
}

async function unbanKeyCmd(interaction) {
    const keyString = interaction.options.getString('key');
    await unbanKey(keyString);
    await interaction.reply({ content: `🟢 \`${keyString}\` banı kaldırıldı.`, ephemeral: true });
}

async function hwidLookup(interaction) {
    const hwid = interaction.options.getString('hwid');
    await interaction.deferReply({ ephemeral: true });

    const key = await getKeyByHwid(hwid);
    if (!key) return interaction.editReply('❌ Bu HWID ile eşleşen key bulunamadı.');

    const activation = await getActivation(key.id);

    const embed = new EmbedBuilder()
        .setColor(0x9b59b6)
        .setTitle('🔍 HWID Lookup')
        .addFields(
            { name: 'HWID', value: `\`${hwid.slice(0, 40)}...\`` },
            { name: 'Key', value: `\`${key.key_string}\`` },
            { name: 'Durum', value: key.is_banned ? '🔴 Banlı' : '🟢 Aktif', inline: true }
        );

    if (activation) {
        embed.addFields(
            { name: 'Aktivasyon', value: new Date(activation.activated_at).toLocaleString('tr-TR'), inline: true },
            { name: 'Son Görülme', value: activation.last_seen ? new Date(activation.last_seen).toLocaleString('tr-TR') : '-', inline: true }
        );
    }

    await interaction.editReply({ embeds: [embed] });
}

async function banHwidCmd(interaction) {
    const hwid = interaction.options.getString('hwid');
    const sebep = interaction.options.getString('sebep') || '';
    await banHwid(hwid, sebep);

    const key = await getKeyByHwid(hwid);
    if (key) await banKey(key.key_string);

    await interaction.reply({ content: `🔴 HWID banlandı: \`${hwid.slice(0, 40)}...\``, ephemeral: true });
}

async function unbanHwidCmd(interaction) {
    const hwid = interaction.options.getString('hwid');
    await unbanHwid(hwid);
    await interaction.reply({ content: `🟢 HWID banı kaldırıldı: \`${hwid.slice(0, 40)}...\``, ephemeral: true });
}

async function stats(interaction) {
    await interaction.deferReply({ ephemeral: true });
    const keys = await getAllKeys();
    const activeCount = await getActiveKeyCount();
    const now = new Date();

    const embed = new EmbedBuilder()
        .setColor(0xf1c40f)
        .setTitle('📊 İstatistikler')
        .addFields(
            { name: 'Toplam Key', value: String(keys.length), inline: true },
            { name: 'Aktif (HWID kayıtlı)', value: String(activeCount), inline: true },
            { name: 'Banlı', value: String(keys.filter(k => k.is_banned).length), inline: true },
            { name: 'Süresi Dolmuş', value: String(keys.filter(k => k.expires_at && new Date(k.expires_at) < now).length), inline: true }
        )
        .setTimestamp();

    await interaction.editReply({ embeds: [embed] });
}
