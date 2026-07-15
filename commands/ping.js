export const data = {
    name: 'ping',
    description: 'Botun canlı olduğunu test eder'
};

export async function execute(interaction) {
    await interaction.reply({ content: 'Pong! 🏓', ephemeral: true });
}
