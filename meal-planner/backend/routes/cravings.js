const express = require('express');
const db = require('../db');

const router = express.Router();

router.get('/', (req, res) => {
  const items = db.prepare('SELECT * FROM cravings WHERE active = 1 ORDER BY created_at DESC').all();
  res.json({ items });
});

router.post('/', (req, res) => {
  const { text } = req.body || {};
  if (!text) return res.status(400).json({ error: 'text is required' });
  const info = db.prepare('INSERT INTO cravings (text) VALUES (?)').run(text);
  const item = db.prepare('SELECT * FROM cravings WHERE id = ?').get(info.lastInsertRowid);
  res.status(201).json({ item });
});

router.delete('/:id', (req, res) => {
  db.prepare('UPDATE cravings SET active = 0 WHERE id = ?').run(req.params.id);
  res.status(204).end();
});

module.exports = router;
