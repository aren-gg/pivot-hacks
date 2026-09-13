const express = require('express');
const db = require('../db');

const router = express.Router();

router.get('/', (req, res) => {
  const items = db.prepare('SELECT * FROM fridge_items WHERE used_up = 0 ORDER BY added_at DESC').all();
  res.json({ items });
});

router.post('/', (req, res) => {
  const { name, quantity = 1, unit = '', category = 'other' } = req.body || {};
  if (!name) return res.status(400).json({ error: 'name is required' });
  const info = db
    .prepare('INSERT INTO fridge_items (name, quantity, unit, category) VALUES (?, ?, ?, ?)')
    .run(name, quantity, unit, category);
  const item = db.prepare('SELECT * FROM fridge_items WHERE id = ?').get(info.lastInsertRowid);
  res.status(201).json({ item });
});

// Mark an item used up by name (case-insensitive) rather than requiring an id,
// since the Discord bot only knows the item's name from the user's message.
router.post('/remove-by-name', (req, res) => {
  const { name } = req.body || {};
  if (!name) return res.status(400).json({ error: 'name is required' });
  const info = db
    .prepare('UPDATE fridge_items SET used_up = 1 WHERE lower(name) = lower(?) AND used_up = 0')
    .run(name);
  res.json({ updated: info.changes });
});

router.delete('/:id', (req, res) => {
  db.prepare('DELETE FROM fridge_items WHERE id = ?').run(req.params.id);
  res.status(204).end();
});

module.exports = router;
