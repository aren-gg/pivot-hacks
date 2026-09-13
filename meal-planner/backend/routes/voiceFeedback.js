const express = require('express');
const aiService = require('../services/aiService');

const router = express.Router();

// POST /api/voice-feedback  { audioBase64, mimeType }
// Transcribes a short cooking voice clip and returns cooking feedback.
router.post('/', async (req, res) => {
  const { audioBase64, mimeType } = req.body || {};
  if (!audioBase64) return res.status(400).json({ error: 'audioBase64 is required' });
  try {
    const result = await aiService.voiceFeedback(audioBase64, mimeType || 'audio/wav');
    res.json(result);
  } catch (err) {
    console.error('Voice feedback failed:', err);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
