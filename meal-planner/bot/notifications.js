const cron = require('node-cron');
const { EmbedBuilder } = require('discord.js');
const api = require('./api');

const ACCENT = 0xb5502e;
const WEBSITE_URL = process.env.WEBSITE_URL || 'http://localhost:3000';

function cronExprFromTime(hhmm, dayOfWeek = '*') {
  const [h, m] = hhmm.split(':').map(Number);
  return `${m} ${h} * * ${dayOfWeek}`;
}

async function getChannel(client) {
  const channelId = process.env.MEAL_CHANNEL_ID;
  if (!channelId) {
    console.warn('MEAL_CHANNEL_ID not set — skipping scheduled notification.');
    return null;
  }
  return client.channels.fetch(channelId);
}

function scheduleDefrostReminders(client) {
  const time = process.env.DEFROST_CHECK_TIME || '18:00';
  cron.schedule(cronExprFromTime(time), async () => {
    try {
      const { meals } = await api.getDueDefrostReminders();
      if (!meals.length) return;

      const channel = await getChannel(client);
      if (!channel) return;

      const lines = meals.map((m) => `🧊 Defrost **${m.protein}** tonight for tomorrow's ${m.title} (${m.meal_type}).`);
      const embed = new EmbedBuilder().setColor(ACCENT).setTitle('Defrost reminder').setDescription(lines.join('\n'));
      await channel.send({ embeds: [embed] });

      await api.ackDefrostReminders(meals.map((m) => m.id));
    } catch (err) {
      console.error('Defrost reminder job failed:', err);
    }
  });
  console.log(`Scheduled defrost reminders daily at ${time}.`);
}

function scheduleWeeklyPlanning(client) {
  const day = process.env.GROCERY_DAY ?? '6'; // Saturday
  const time = process.env.GROCERY_TIME || '17:00';
  cron.schedule(cronExprFromTime(time, day), async () => {
    try {
      const channel = await getChannel(client);
      const plan = await api.generatePlan();
      const list = await api.getGroceryList(plan.weekStart);

      if (!channel) return;

      const groceryLines = list.items.length
        ? list.items.map((i) => `• ${i.quantity} ${i.unit} ${i.name}`.replace('  ', ' ')).join('\n')
        : 'Nothing needed — the fridge covers it.';

      const embed = new EmbedBuilder()
        .setColor(ACCENT)
        .setTitle(`${plan.label || 'Next week'} is ready`)
        .setDescription(`View the full plan at ${WEBSITE_URL}\n\n**Grocery list:**\n${groceryLines}`);
      await channel.send({ embeds: [embed] });
    } catch (err) {
      console.error('Weekly planning job failed:', err);
    }
  });
  console.log(`Scheduled weekly plan + grocery list generation: day ${day} at ${time}.`);
}

function scheduleAll(client) {
  scheduleDefrostReminders(client);
  scheduleWeeklyPlanning(client);
}

module.exports = { scheduleAll };
