const express = require('express');
const planService = require('../services/planService');

const router = express.Router();

// GET returns the due reminders. The bot marks them notified via the POST
// below once the Discord message actually sends, so a delivery failure
// doesn't silently swallow a reminder.
router.get('/defrost-due', (req, res) => {
  const meals = planService.getDueDefrostReminders();
  res.json({ meals });
});

router.post('/defrost-due/ack', (req, res) => {
  const { mealIds = [] } = req.body || {};
  planService.markDefrostNotified(mealIds);
  res.status(204).end();
});

module.exports = router;
