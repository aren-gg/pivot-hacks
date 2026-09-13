const express = require('express');
const db = require('../db');

const router = express.Router();

router.get('/', (req, res) => {
  const items = db.prepare('SELECT * FROM fridge_items WHERE used_up = 0 ORDER BY added_at DESC').all();
  res.json({ items });
});

router.post('/', (req, res) => {
  const { name, quantity = 1, unit = '', category = 'other', expires_at = null } = req.body || {};
  if (!name) return res.status(400).json({ error: 'name is required' });
  const info = db
    .prepare('INSERT INTO fridge_items (name, quantity, unit, category, expires_at) VALUES (?, ?, ?, ?, ?)')
    .run(name, quantity, unit, category, expires_at);
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

// Update an existing fridge item (currently: expiry date, and optionally
// quantity/unit). Expects an id; only provided fields are changed.
router.patch('/:id', (req, res) => {
  const item = db.prepare('SELECT * FROM fridge_items WHERE id = ?').get(req.params.id);
  if (!item) return res.status(404).json({ error: 'fridge item not found' });

  const body = req.body || {};
  const next = {
    expires_at: item.expires_at,
    quantity: item.quantity,
    unit: item.unit
  };

  if (body.expires_at !== undefined) {
    if (body.expires_at === null || body.expires_at === '') {
      next.expires_at = null;
    } else if (/^\d{4}-\d{2}-\d{2}$/.test(String(body.expires_at))) {
      next.expires_at = String(body.expires_at);
    } else {
      return res.status(400).json({ error: 'expires_at must be YYYY-MM-DD or empty' });
    }
  }
  if (body.quantity !== undefined) next.quantity = Number(body.quantity) || 0;
  if (body.unit !== undefined) next.unit = String(body.unit);

  db.prepare('UPDATE fridge_items SET expires_at = ?, quantity = ?, unit = ? WHERE id = ?').run(
    next.expires_at,
    next.quantity,
    next.unit,
    req.params.id
  );
  const updated = db.prepare('SELECT * FROM fridge_items WHERE id = ?').get(req.params.id);
  res.json({ item: updated });
});

router.delete('/:id', (req, res) => {
  db.prepare('DELETE FROM fridge_items WHERE id = ?').run(req.params.id);
  res.status(204).end();
});

module.exports = router;
