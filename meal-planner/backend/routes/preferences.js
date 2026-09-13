const express = require('express');
const planService = require('../services/planService');

const router = express.Router();

const EXPERIENCE_LEVELS = ['beginner', 'intermediate', 'advanced'];

router.get('/', (req, res) => {
  res.json({ preferences: planService.getPreferences() });
});

router.put('/', (req, res) => {
  const body = req.body || {};
  const patch = {};

  if (body.lifestyle !== undefined) patch.lifestyle = String(body.lifestyle).slice(0, 500);

  if (body.max_price_per_serving !== undefined) {
    const n = Number(body.max_price_per_serving);
    if (body.max_price_per_serving === null || body.max_price_per_serving === '') patch.max_price_per_serving = null;
    else if (!Number.isFinite(n) || n <= 0) return res.status(400).json({ error: 'max_price_per_serving must be a positive number' });
    else patch.max_price_per_serving = Math.round(n * 100) / 100;
  }

  if (body.max_total_minutes !== undefined) {
    const n = Number(body.max_total_minutes);
    if (body.max_total_minutes === null || body.max_total_minutes === '') patch.max_total_minutes = null;
    else if (!Number.isInteger(n) || n <= 0) return res.status(400).json({ error: 'max_total_minutes must be a positive integer' });
    else patch.max_total_minutes = n;
  }

  if (body.cooking_experience !== undefined) {
    const exp = String(body.cooking_experience).toLowerCase();
    if (!EXPERIENCE_LEVELS.includes(exp)) {
      return res.status(400).json({ error: `cooking_experience must be one of: ${EXPERIENCE_LEVELS.join(', ')}` });
    }
    patch.cooking_experience = exp;
  }

  res.json({ preferences: planService.updatePreferences(patch) });
});

module.exports = router;
