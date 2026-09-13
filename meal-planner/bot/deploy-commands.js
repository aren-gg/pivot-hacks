require('dotenv').config();
const { REST, Routes, SlashCommandBuilder } = require('discord.js');

const commands = [
  new SlashCommandBuilder()
    .setName('craving')
    .setDescription("Tell the planner what you're craving this week")
    .addStringOption((o) => o.setName('text').setDescription('e.g. spicy noodles').setRequired(true)),

  new SlashCommandBuilder()
    .setName('fridge-add')
    .setDescription('Add an item to your fridge/pantry inventory')
    .addStringOption((o) => o.setName('name').setDescription('item name').setRequired(true))
    .addNumberOption((o) => o.setName('quantity').setDescription('amount').setRequired(false))
    .addStringOption((o) => o.setName('unit').setDescription('e.g. lbs, cups, pieces').setRequired(false)),

  new SlashCommandBuilder()
    .setName('fridge-remove')
    .setDescription("Mark a fridge item as used up / out")
    .addStringOption((o) => o.setName('name').setDescription('item name').setRequired(true)),

  new SlashCommandBuilder().setName('fridge-list').setDescription("Show what's currently in your fridge"),

  new SlashCommandBuilder()
    .setName('receipt')
    .setDescription('Scan a grocery receipt photo and add the items to your fridge')
    .addAttachmentOption((o) =>
      o.setName('photo').setDescription('A photo of your grocery receipt').setRequired(true)
    ),

  new SlashCommandBuilder()
    .setName('grocery-bought')
    .setDescription('Log something you just bought (also adds it to the fridge)')
    .addStringOption((o) => o.setName('name').setDescription('item name').setRequired(true))
    .addNumberOption((o) => o.setName('quantity').setDescription('amount').setRequired(false))
    .addStringOption((o) => o.setName('unit').setDescription('e.g. lbs, cups, pieces').setRequired(false)),

  new SlashCommandBuilder().setName('plan-generate').setDescription("Generate this week's meal plan now"),
  new SlashCommandBuilder().setName('plan-today').setDescription("Show today's lunch and dinner"),
  new SlashCommandBuilder().setName('grocery-list').setDescription("Show this week's grocery list"),

  new SlashCommandBuilder()
    .setName('preferences')
    .setDescription('Personalize meals to your lifestyle, budget, and cooking experience')
    .addStringOption((o) =>
      o
        .setName('experience')
        .setDescription('Your cooking experience level')
        .setRequired(false)
        .addChoices(
          { name: 'beginner', value: 'beginner' },
          { name: 'intermediate', value: 'intermediate' },
          { name: 'advanced', value: 'advanced' }
        )
    )
    .addNumberOption((o) => o.setName('budget').setDescription('Max USD per serving').setRequired(false))
    .addIntegerOption((o) => o.setName('max_minutes').setDescription('Max prep+cook minutes per meal').setRequired(false))
    .addStringOption((o) =>
      o.setName('lifestyle').setDescription('Diet/lifestyle, e.g. vegetarian, high-protein').setRequired(false)
    )
    .addStringOption((o) =>
      o
        .setName('currency')
        .setDescription('Currency for meal prices')
        .setRequired(false)
        .addChoices(
          { name: 'USD ($)', value: 'USD' },
          { name: 'EUR (€)', value: 'EUR' },
          { name: 'GBP (£)', value: 'GBP' },
          { name: 'JPY (¥)', value: 'JPY' },
          { name: 'CAD (CA$)', value: 'CAD' },
          { name: 'AUD (A$)', value: 'AUD' },
          { name: 'INR (₹)', value: 'INR' },
          { name: 'CNY (¥)', value: 'CNY' },
          { name: 'KRW (₩)', value: 'KRW' },
          { name: 'MXN (MX$)', value: 'MXN' },
          { name: 'BRL (R$)', value: 'BRL' },
          { name: 'SGD (S$)', value: 'SGD' }
        )
    ),

  new SlashCommandBuilder().setName('preferences-show').setDescription('Show your current meal preferences')
].map((c) => c.toJSON());

const rest = new REST({ version: '10' }).setToken(process.env.DISCORD_TOKEN);

(async () => {
  try {
    const clientId = process.env.DISCORD_CLIENT_ID;
    const guildId = process.env.DISCORD_GUILD_ID;

    const route = guildId
      ? Routes.applicationGuildCommands(clientId, guildId)
      : Routes.applicationCommands(clientId);

    await rest.put(route, { body: commands });

    console.log(
      guildId
        ? `Registered ${commands.length} commands to guild ${guildId} (instant).`
        : `Registered ${commands.length} global commands (can take up to 1hr to propagate).`
    );
  } catch (err) {
    console.error(err);
    process.exit(1);
  }
})();
