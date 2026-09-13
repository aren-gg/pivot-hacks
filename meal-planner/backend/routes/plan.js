const express = require('express');
const db = require('../db');
const planService = require('../services/planService');

const router = express.Router();

router.get('/current', (req, res) => {
  const weekStart = planService.currentWeekStartISO();
  res.json(planService.getWeekPlan(weekStart));
});

router.get('/:weekStart', (req, res) => {
  res.json(planService.getWeekPlan(req.params.weekStart));
});

router.get('/:weekStart/grocery-list', (req, res) => {
  res.json(planService.computeGroceryList(req.params.weekStart));
});

router.patch('/grocery-list/:id', (req, res) => {
  const { checked } = req.body || {};
  db.prepare('UPDATE grocery_list_items SET checked = ? WHERE id = ?').run(checked ? 1 : 0, req.params.id);
  res.status(204).end();
});

router.post('/generate', async (req, res) => {
  try {
    const weekStart = req.body?.weekStart || planService.currentWeekStartISO();
    const plan = await planService.generatePlanForWeek(weekStart);
    res.status(201).json(plan);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
