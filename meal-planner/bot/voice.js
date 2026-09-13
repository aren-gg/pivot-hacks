const {
  joinVoiceChannel,
  getVoiceConnection,
  EndBehaviorType,
  entersState,
  VoiceConnectionStatus
} = require('@discordjs/voice');
const prism = require('prism-media');
const { EmbedBuilder } = require('discord.js');
const api = require('./api');

const ACCENT = 0xb5502e;

// Wake word: the bot only responds to utterances that address it by name.
const WAKE_WORD = process.env.COOK_WAKE_WORD || 'kevin';

// Discord voice receive is 48kHz, 2-channel, 16-bit signed little-endian PCM.
const SAMPLE_RATE = 48000;
const CHANNELS = 2;
const BYTES_PER_SAMPLE = 2;
// Ignore utterances shorter than this many bytes (~0.4s) to skip stray blips.
const MIN_BYTES = SAMPLE_RATE * CHANNELS * BYTES_PER_SAMPLE * 0.4;

// Wrap raw PCM in a minimal WAV header so Gemini can read it as audio/wav.
function pcmToWav(pcmBuffer) {
  const byteRate = SAMPLE_RATE * CHANNELS * BYTES_PER_SAMPLE;
  const blockAlign = CHANNELS * BYTES_PER_SAMPLE;
  const header = Buffer.alloc(44);
  header.write('RIFF', 0);
  header.writeUInt32LE(36 + pcmBuffer.length, 4);
  header.write('WAVE', 8);
  header.write('fmt ', 12);
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20); // PCM
  header.writeUInt16LE(CHANNELS, 22);
  header.writeUInt32LE(SAMPLE_RATE, 24);
  header.writeUInt32LE(byteRate, 28);
  header.writeUInt16LE(blockAlign, 32);
  header.writeUInt16LE(BYTES_PER_SAMPLE * 8, 34);
  header.write('data', 36);
  header.writeUInt32LE(pcmBuffer.length, 40);
  return Buffer.concat([header, pcmBuffer]);
}

// Track which channels the bot is actively cooking-listening in.
const activeSessions = new Map(); // guildId -> { textChannel, listeningUsers:Set }

async function startCooking(interaction) {
  const member = interaction.member;
  const voiceChannel = member?.voice?.channel;
  if (!voiceChannel) {
    await interaction.editReply('Join a voice channel first, then run `/cook` so I can listen while you cook.');
    return;
  }

  const connection = joinVoiceChannel({
    channelId: voiceChannel.id,
    guildId: voiceChannel.guild.id,
    adapterCreator: voiceChannel.guild.voiceAdapterCreator,
    selfDeaf: false, // must NOT be deaf to receive audio
    selfMute: true
  });

  try {
    await entersState(connection, VoiceConnectionStatus.Ready, 15000);
  } catch (e) {
    connection.destroy();
    await interaction.editReply("I couldn't connect to the voice channel. Try again.");
    return;
  }

  const session = { textChannel: interaction.channel, listeningUsers: new Set() };
  activeSessions.set(voiceChannel.guild.id, session);

  const receiver = connection.receiver;
  receiver.speaking.on('start', (userId) => {
    if (session.listeningUsers.has(userId)) return; // already capturing this utterance
    session.listeningUsers.add(userId);
    captureUtterance(receiver, userId, session);
  });

  await interaction.editReply(
    `🎧 Listening in **${voiceChannel.name}**. Say **"${WAKE_WORD}"** to get my attention — e.g. "${WAKE_WORD}, the sauce is too salty" or "hey ${WAKE_WORD}, what temp for chicken?" and I'll reply here. Run \`/stop-cooking\` when you're done.`
  );
}

function captureUtterance(receiver, userId, session) {
  const opusStream = receiver.subscribe(userId, {
    end: { behavior: EndBehaviorType.AfterSilence, duration: 1200 }
  });
  const decoder = new prism.opus.Decoder({ rate: SAMPLE_RATE, channels: CHANNELS, frameSize: 960 });

  const chunks = [];
  opusStream.pipe(decoder);
  decoder.on('data', (chunk) => chunks.push(chunk));
  decoder.on('end', async () => {
    session.listeningUsers.delete(userId);
    const pcm = Buffer.concat(chunks);
    if (pcm.length < MIN_BYTES) return; // too short, ignore
    try {
      const wav = pcmToWav(pcm);
      const { heard, triggered, advice } = await api.voiceFeedback(wav.toString('base64'), 'audio/wav', WAKE_WORD);
      // Only respond when the cook addressed the bot by its wake word.
      if (!triggered || !advice) return;
      const embed = new EmbedBuilder()
        .setColor(ACCENT)
        .setTitle('👩‍🍳 Cooking help')
        .setDescription(`${heard ? `*You said:* “${heard}”\n\n` : ''}${advice || ''}`.slice(0, 4000));
      await session.textChannel.send({ embeds: [embed] });
    } catch (err) {
      console.error('Voice feedback failed:', err);
    }
  });
  decoder.on('error', (e) => {
    session.listeningUsers.delete(userId);
    console.error('Opus decode error:', e);
  });
}

async function stopCooking(interaction) {
  const guildId = interaction.guild?.id;
  const connection = guildId && getVoiceConnection(guildId);
  if (!connection) {
    await interaction.editReply("I'm not listening in a voice channel right now.");
    return;
  }
  connection.destroy();
  activeSessions.delete(guildId);
  await interaction.editReply('👋 Stopped listening. Hope the meal turned out great!');
}

module.exports = { startCooking, stopCooking };
