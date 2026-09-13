const express = require('express');
const db = require('../db');
const aiService = require('../services/aiService');
const planService = require('../services/planService');

const router = express.Router();

router.post('/', async (req, res) => {
  const { text } = req.body || {};
  if (!text) return res.status(400).json({ error: 'text is required' });

  try {
    const parsed = await aiService.parseMessage(text);
    const items = parsed.items || [];

    switch (parsed.intent) {
      case 'craving': {
        db.prepare('INSERT INTO cravings (text) VALUES (?)').run(parsed.craving_text || text);
        break;
      }
      case 'fridge_add': {
        const insert = db.prepare('INSERT INTO fridge_items (name, quantity, unit, expires_at) VALUES (?, ?, ?, ?)');
        for (const it of items) insert.run(it.name, it.quantity || 1, it.unit || '', it.expires_at || null);
        break;
      }
      case 'fridge_remove': {
        const update = db.prepare(
          'UPDATE fridge_items SET used_up = 1 WHERE lower(name) = lower(?) AND used_up = 0'
        );
        for (const it of items) update.run(it.name);
        break;
      }
      case 'grocery_bought': {
        const insertGrocery = db.prepare('INSERT INTO groceries_bought (name, quantity, unit) VALUES (?, ?, ?)');
        const insertFridge = db.prepare('INSERT INTO fridge_items (name, quantity, unit, expires_at) VALUES (?, ?, ?, ?)');
        for (const it of items) {
          insertGrocery.run(it.name, it.quantity || 1, it.unit || '');
          insertFridge.run(it.name, it.quantity || 1, it.unit || '', it.expires_at || null);
        }
        break;
      }
      case 'generate_plan': {
        await planService.generatePlanForWeek();
        break;
      }
      case 'show_fridge': {
        const fridge = planService.getActiveFridgeItems();
        parsed.reply = fridge.length
          ? `Here's what's in your fridge:\n${fridge
              .map((f) => `• ${f.quantity} ${f.unit} ${f.name}${f.expires_at ? ` (expires ${f.expires_at})` : ''}`.replace('  ', ' '))
              .join('\n')}`
          : "Your fridge is empty right now — nothing logged.";
        break;
      }
      case 'show_plan':
      case 'grocery_list':
      case 'other':
      default:
        break;
    }

    res.json(parsed);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
