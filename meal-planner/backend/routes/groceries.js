const express = require('express');
const db = require('../db');

const router = express.Router();

router.get('/', (req, res) => {
  const items = db.prepare('SELECT * FROM groceries_bought ORDER BY bought_at DESC LIMIT 100').all();
  res.json({ items });
});

// Buying groceries also tops up the fridge inventory so the planner
// immediately knows they're on hand.
router.post('/', (req, res) => {
  const { name, quantity = 1, unit = '' } = req.body || {};
  if (!name) return res.status(400).json({ error: 'name is required' });

  const insertGrocery = db.prepare(
    'INSERT INTO groceries_bought (name, quantity, unit) VALUES (?, ?, ?)'
  );
  const insertFridge = db.prepare(
    'INSERT INTO fridge_items (name, quantity, unit) VALUES (?, ?, ?)'
  );

  const tx = db.transaction(() => {
    const info = insertGrocery.run(name, quantity, unit);
    insertFridge.run(name, quantity, unit);
    return info.lastInsertRowid;
  });
  const id = tx();

  const item = db.prepare('SELECT * FROM groceries_bought WHERE id = ?').get(id);
  res.status(201).json({ item });
});

module.exports = router;
