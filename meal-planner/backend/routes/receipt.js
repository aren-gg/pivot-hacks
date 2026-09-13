const express = require('express');
const db = require('../db');
const aiService = require('../services/aiService');

const router = express.Router();

function daysToDate(days) {
  const n = Number(days);
  if (!Number.isFinite(n)) return null;
  const d = new Date();
  d.setDate(d.getDate() + Math.round(n));
  return d.toISOString().slice(0, 10);
}

// POST /api/receipt  { imageBase64, mimeType }
// Reads a receipt photo, extracts food items, and adds them to the fridge.
router.post('/', async (req, res) => {
  const { imageBase64, mimeType } = req.body || {};
  if (!imageBase64) return res.status(400).json({ error: 'imageBase64 is required' });

  try {
    const items = await aiService.parseReceipt(imageBase64, mimeType || 'image/jpeg');
    if (!items.length) {
      return res.json({ added: [], message: 'No food items could be read from that receipt.' });
    }

    const insert = db.prepare(
      'INSERT INTO fridge_items (name, quantity, unit, expires_at) VALUES (?, ?, ?, ?)'
    );
    const added = [];
    const tx = db.transaction(() => {
      for (const it of items) {
        const name = (it.name || it.item || '').trim();
        if (!name) continue;
        const expires_at = daysToDate(it.days_until_expiry);
        insert.run(name, Number(it.quantity) || 1, it.unit || '', expires_at);
        added.push({ name, quantity: Number(it.quantity) || 1, unit: it.unit || '', expires_at });
      }
    });
    tx();

    res.status(201).json({ added, count: added.length });
  } catch (err) {
    console.error('Receipt parse failed:', err);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
