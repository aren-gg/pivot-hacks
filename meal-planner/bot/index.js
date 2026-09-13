require('dotenv').config();
const { Client, GatewayIntentBits, Partials, Events } = require('discord.js');
const { handleSlashCommand } = require('./commands');
const { scheduleAll } = require('./notifications');
const api = require('./api');

const MEAL_CHANNEL_ID = process.env.MEAL_CHANNEL_ID;

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent
  ],
  partials: [Partials.Channel]
});

client.once(Events.ClientReady, (c) => {
  console.log(`Meal planner bot online as ${c.user.tag}`);
  scheduleAll(client);
});

client.on(Events.InteractionCreate, async (interaction) => {
  if (!interaction.isChatInputCommand()) return;
  await handleSlashCommand(interaction);
});

// Free-text understanding: anything typed in the configured meal-planning
// channel gets classified by the backend (craving / fridge update / grocery
// log / generate plan / etc.) without needing a slash command.
client.on(Events.MessageCreate, async (message) => {
  if (message.author.bot) return;
  if (MEAL_CHANNEL_ID && message.channelId !== MEAL_CHANNEL_ID) return;

  try {
    await message.channel.sendTyping();
    const result = await api.parseMessage(message.content);
    if (result.reply) await message.reply(result.reply);
  } catch (err) {
    console.error('Message parse failed:', err);
    await message.reply("I couldn't reach the planner backend just now — try again in a bit.");
  }
});

client.login(process.env.DISCORD_TOKEN);
