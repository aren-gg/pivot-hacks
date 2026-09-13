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

// Add a manual "to buy" item to the grocery list for a week.
router.post('/:weekStart/grocery-list', (req, res) => {
  const { name, quantity = 1, unit = '' } = req.body || {};
  if (!name) return res.status(400).json({ error: 'name is required' });
  res.status(201).json(planService.addManualGroceryItem(req.params.weekStart, { name, quantity, unit }));
});

router.delete('/grocery-list/:id', (req, res) => {
  planService.removeGroceryItem(req.params.id);
  res.status(204).end();
});

router.patch('/grocery-list/:id', (req, res) => {
  const { checked } = req.body || {};
  db.prepare('UPDATE grocery_list_items SET checked = ? WHERE id = ?').run(checked ? 1 : 0, req.params.id);
  res.status(204).end();
});
// Regenerate one meal using only what's in the fridge (ran out of ingredients
// for the originally planned meal).
router.post('/meal/:id/swap', async (req, res) => {
  try {
    const result = await planService.swapMealFromFridge(req.params.id);
    res.json(result);
  } catch (err) {
    console.error(err);
    res.status(err.message === 'meal not found' ? 404 : 500).json({ error: err.message });
  }
});

// Convenience: swap by week + day + meal type (what the bot uses).
router.post('/:weekStart/swap', async (req, res) => {
  try {
    const { dayDate, mealType } = req.body || {};
    if (!dayDate || !mealType) return res.status(400).json({ error: 'dayDate and mealType are required' });
    const meal = planService.findMeal(req.params.weekStart, dayDate, mealType);
    if (!meal) return res.status(404).json({ error: 'no such meal in the plan' });
    const result = await planService.swapMealFromFridge(meal.id);
    res.json(result);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
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
