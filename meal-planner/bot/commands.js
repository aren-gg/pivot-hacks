const { EmbedBuilder } = require('discord.js');
const api = require('./api');

const ACCENT = 0xb5502e;
const WEBSITE_URL = process.env.WEBSITE_URL || 'http://localhost:3000';

function mealLine(meal, symbol = '$') {
  const tag = meal.isLeftover ? ' (leftovers)' : '';
  const price = meal.price ? ` · ${symbol}${Number(meal.price).toFixed(2)}` : '';
  return `**${meal.mealType === 'lunch' ? 'Lunch' : 'Dinner'}:** ${meal.title}${tag}${price}`;
}

function prefsSummary(p) {
  const sym = p.currency_symbol || '$';
  return [
    `**Currency:** ${p.currency_code || 'USD'} (${sym})`,
    `**Cooking experience:** ${p.cooking_experience || 'intermediate'}`,
    `**Budget per serving:** ${p.max_price_per_serving ? sym + Number(p.max_price_per_serving).toFixed(2) : 'no limit'}`,
    `**Max time per meal:** ${p.max_total_minutes ? p.max_total_minutes + ' min' : 'no limit'}`,
    `**Lifestyle/diet:** ${p.lifestyle && p.lifestyle.trim() ? p.lifestyle.trim() : 'none set'}`
  ].join('\n');
}

async function handleSlashCommand(interaction) {
  const { commandName } = interaction;
  await interaction.deferReply();

  try {
    if (commandName === 'craving') {
      const text = interaction.options.getString('text', true);
      await api.addCraving(text);
      await interaction.editReply(`Got it — I'll work "${text}" into this week's plan. 🍜`);
      return;
    }

    if (commandName === 'fridge-add') {
      const name = interaction.options.getString('name', true);
      const quantity = interaction.options.getNumber('quantity') ?? 1;
      const unit = interaction.options.getString('unit') ?? '';
      await api.addFridgeItem({ name, quantity, unit });
      await interaction.editReply(`Added ${quantity} ${unit} ${name} to the fridge.`.replace('  ', ' '));
      return;
    }

    if (commandName === 'fridge-remove') {
      const name = interaction.options.getString('name', true);
      await api.removeFridgeItem(name);
      await interaction.editReply(`Marked ${name} as used up.`);
      return;
    }

    if (commandName === 'fridge-list') {
      const { items } = await api.getFridge();
      if (!items.length) {
        await interaction.editReply('Your fridge is empty right now — nothing logged.');
        return;
      }
      const lines = items.map((i) => `• ${i.quantity} ${i.unit} ${i.name}`.replace('  ', ' '));
      const embed = new EmbedBuilder()
        .setColor(ACCENT)
        .setTitle("What's in the fridge")
        .setDescription(lines.join('\n'));
      await interaction.editReply({ embeds: [embed] });
      return;
    }

    if (commandName === 'grocery-bought') {
      const name = interaction.options.getString('name', true);
      const quantity = interaction.options.getNumber('quantity') ?? 1;
      const unit = interaction.options.getString('unit') ?? '';
      await api.addGrocery({ name, quantity, unit });
      await interaction.editReply(
        `Logged ${quantity} ${unit} ${name} as bought and added it to the fridge.`.replace('  ', ' ')
      );
      return;
    }

    if (commandName === 'plan-generate') {
      const plan = await api.generatePlan();
      const embed = new EmbedBuilder()
        .setColor(ACCENT)
        .setTitle(plan.label || "This week's plan")
        .setDescription(`Plan generated for the week of ${plan.weekStart}.\nView it at ${WEBSITE_URL}`);
      await interaction.editReply({ embeds: [embed] });
      return;
    }

    if (commandName === 'plan-today') {
      const plan = await api.getCurrentPlan();
      const todayISO = new Date().toISOString().slice(0, 10);
      const today = plan.days.find((d) => d.date === todayISO);
      if (!today || !today.meals.length) {
        await interaction.editReply("No plan for today yet — try `/plan-generate` first.");
        return;
      }
      const embed = new EmbedBuilder()
        .setColor(ACCENT)
        .setTitle(`Today · ${todayISO}`)
        .setDescription(today.meals.map((m) => mealLine(m, plan.currency?.symbol || '$')).join('\n'));
      await interaction.editReply({ embeds: [embed] });
      return;
    }

    if (commandName === 'grocery-list') {
      const plan = await api.getCurrentPlan();
      const list = await api.getGroceryList(plan.weekStart);
      if (!list.items.length) {
        await interaction.editReply("Nothing needed — the fridge already covers this week's plan.");
        return;
      }
      const sym = list.currency?.symbol || '$';
      const lines = list.items.map((i) => {
        const price = i.price != null ? ` — ${sym}${Number(i.price).toFixed(2)}` : '';
        return `• ${i.quantity} ${i.unit} ${i.name}${price}`.replace('  ', ' ');
      });
      const total = list.total != null ? `\n\n**Estimated total: ${sym}${Number(list.total).toFixed(2)}**` : '';
      const embed = new EmbedBuilder()
        .setColor(ACCENT)
        .setTitle("This week's grocery list")
        .setDescription(lines.join('\n') + total);
      await interaction.editReply({ embeds: [embed] });
      return;
    }

    if (commandName === 'preferences') {
      const patch = {};
      const experience = interaction.options.getString('experience');
      const budget = interaction.options.getNumber('budget');
      const maxMinutes = interaction.options.getInteger('max_minutes');
      const lifestyle = interaction.options.getString('lifestyle');
      const currency = interaction.options.getString('currency');
      if (experience !== null) patch.cooking_experience = experience;
      if (budget !== null) patch.max_price_per_serving = budget;
      if (maxMinutes !== null) patch.max_total_minutes = maxMinutes;
      if (lifestyle !== null) patch.lifestyle = lifestyle;
      if (currency !== null) patch.currency_code = currency;

      if (!Object.keys(patch).length) {
        await interaction.editReply('Give me at least one thing to set: experience, budget, max_minutes, lifestyle, or currency.');
        return;
      }
      const { preferences: p } = await api.savePreferences(patch);
      const embed = new EmbedBuilder()
        .setColor(ACCENT)
        .setTitle('Preferences updated')
        .setDescription(prefsSummary(p) + '\n\nRun `/plan-generate` to apply them to a new plan.');
      await interaction.editReply({ embeds: [embed] });
      return;
    }

    if (commandName === 'preferences-show') {
      const { preferences: p } = await api.getPreferences();
      const embed = new EmbedBuilder().setColor(ACCENT).setTitle('Your meal preferences').setDescription(prefsSummary(p));
      await interaction.editReply({ embeds: [embed] });
      return;
    }

    await interaction.editReply("I don't know that command yet.");
  } catch (err) {
    console.error(err);
    await interaction.editReply(`Something went wrong: ${err.message}`);
  }
}

module.exports = { handleSlashCommand };
