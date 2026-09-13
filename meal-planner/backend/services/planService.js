const db = require('../db');
const aiService = require('./aiService');

const PLAN_LABEL = process.env.PLAN_LABEL || 'Plan Solo';
const PLAN_PACE = process.env.PLAN_PACE || 'Fast';

/** Sunday at 00:00 for the week containing `d` (defaults to today). */
function startOfWeek(d = new Date()) {
  const date = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  const day = date.getUTCDay(); // 0 = Sunday
  date.setUTCDate(date.getUTCDate() - day);
  return date;
}

function toISO(d) {
  return d.toISOString().slice(0, 10);
}

function addDays(d, n) {
  const copy = new Date(d);
  copy.setUTCDate(copy.getUTCDate() + n);
  return copy;
}

function weekDates(weekStartISO) {
  const start = new Date(`${weekStartISO}T00:00:00Z`);
  return Array.from({ length: 7 }, (_, i) => toISO(addDays(start, i)));
}

function currentWeekStartISO() {
  return toISO(startOfWeek());
}

function ensureWeek(weekStartISO) {
  let week = db.prepare('SELECT * FROM weeks WHERE week_start = ?').get(weekStartISO);
  if (!week) {
    // Number the week by its chronological position among all weeks, so the
    // label stays consistent regardless of the order weeks were created in.
    const priorCount = db
      .prepare('SELECT COUNT(*) AS c FROM weeks WHERE week_start < ?')
      .get(weekStartISO).c;
    const label = `Week ${priorCount + 1} · ${PLAN_LABEL} · ${PLAN_PACE}`;
    const info = db
      .prepare('INSERT INTO weeks (week_start, label) VALUES (?, ?)')
      .run(weekStartISO, label);
    week = db.prepare('SELECT * FROM weeks WHERE id = ?').get(info.lastInsertRowid);

    // Re-number every week chronologically so inserting an earlier week
    // shifts later labels correctly.
    const all = db.prepare('SELECT id FROM weeks ORDER BY week_start ASC').all();
    const relabel = db.prepare('UPDATE weeks SET label = ? WHERE id = ?');
    all.forEach((w, i) => relabel.run(`Week ${i + 1} · ${PLAN_LABEL} · ${PLAN_PACE}`, w.id));
    week = db.prepare('SELECT * FROM weeks WHERE id = ?').get(week.id);
  }
  return week;
}

function getActiveFridgeItems() {
  return db.prepare('SELECT * FROM fridge_items WHERE used_up = 0 ORDER BY added_at DESC').all();
}

function getRecentGroceries(days = 7) {
  return db
    .prepare(`SELECT * FROM groceries_bought WHERE bought_at >= datetime('now', ?) ORDER BY bought_at DESC`)
    .all(`-${days} days`);
}

function getActiveCravings() {
  return db.prepare('SELECT * FROM cravings WHERE active = 1 ORDER BY created_at DESC').all();
}

function getPreferences() {
  return (
    db.prepare('SELECT * FROM preferences WHERE id = 1').get() || {
      id: 1,
      lifestyle: '',
      max_price_per_serving: null,
      cooking_experience: 'intermediate',
      max_total_minutes: null
    }
  );
}

function updatePreferences(patch = {}) {
  const current = getPreferences();
  const next = {
    lifestyle: patch.lifestyle !== undefined ? patch.lifestyle : current.lifestyle,
    max_price_per_serving:
      patch.max_price_per_serving !== undefined ? patch.max_price_per_serving : current.max_price_per_serving,
    cooking_experience:
      patch.cooking_experience !== undefined ? patch.cooking_experience : current.cooking_experience,
    max_total_minutes:
      patch.max_total_minutes !== undefined ? patch.max_total_minutes : current.max_total_minutes
  };
  db.prepare(
    `UPDATE preferences
     SET lifestyle = @lifestyle,
         max_price_per_serving = @max_price_per_serving,
         cooking_experience = @cooking_experience,
         max_total_minutes = @max_total_minutes,
         updated_at = datetime('now')
     WHERE id = 1`
  ).run(next);
  return getPreferences();
}

/** Ask Claude for a full week plan, persist it, replacing any existing plan for that week. */
async function generatePlanForWeek(weekStartISO = currentWeekStartISO()) {
  const week = ensureWeek(weekStartISO);
  const days = weekDates(weekStartISO);

  const fridgeItems = getActiveFridgeItems();
  const groceries = getRecentGroceries();
  const cravings = getActiveCravings();
  const preferences = getPreferences();

  const plan = await aiService.generateWeekPlan({
    weekStartLabel: weekStartISO,
    days,
    fridgeItems,
    groceries,
    cravings,
    planLabel: PLAN_LABEL,
    planPace: PLAN_PACE,
    preferences
  });

  const deleteExisting = db.prepare('DELETE FROM meals WHERE week_id = ?');
  const insertMeal = db.prepare(`
    INSERT INTO meals (week_id, day_date, meal_type, title, subtitle, is_leftover, price, protein, needs_defrost, prep_minutes, cook_minutes, difficulty, ingredients_json, recipe)
    VALUES (@week_id, @day_date, @meal_type, @title, @subtitle, @is_leftover, @price, @protein, @needs_defrost, @prep_minutes, @cook_minutes, @difficulty, @ingredients_json, @recipe)
  `);

  const tx = db.transaction(() => {
    deleteExisting.run(week.id);
    for (const day of plan.days || []) {
      for (const meal of day.meals || []) {
        insertMeal.run({
          week_id: week.id,
          day_date: day.date,
          meal_type: meal.meal_type,
          title: meal.title,
          subtitle: meal.subtitle || '',
          is_leftover: meal.is_leftover ? 1 : 0,
          price: meal.price ?? null,
          protein: meal.protein || '',
          needs_defrost: meal.needs_defrost ? 1 : 0,
          prep_minutes: Number.isFinite(meal.prep_minutes) ? Math.round(meal.prep_minutes) : null,
          cook_minutes: Number.isFinite(meal.cook_minutes) ? Math.round(meal.cook_minutes) : null,
          difficulty: meal.difficulty || '',
          ingredients_json: JSON.stringify(meal.ingredients || []),
          recipe: meal.recipe || ''
        });
      }
    }
  });
  tx();

  // Clear active cravings once they've been woven into a plan, and mark
  // consumed fridge items as used so next week's plan doesn't double-count.
  db.prepare('UPDATE cravings SET active = 0').run();

  return getWeekPlan(weekStartISO);
}

/** Read back a week's plan, formatted for the frontend. */
function getWeekPlan(weekStartISO) {
  const week = db.prepare('SELECT * FROM weeks WHERE week_start = ?').get(weekStartISO);
  const todayISO = toISO(new Date());

  if (!week) {
    return {
      weekStart: weekStartISO,
      label: `${PLAN_LABEL} · ${PLAN_PACE}`,
      days: weekDates(weekStartISO).map((date) => ({ date, isToday: date === todayISO, meals: [] })),
      hasPlan: false
    };
  }

  const meals = db
    .prepare('SELECT * FROM meals WHERE week_id = ? ORDER BY day_date ASC, meal_type DESC')
    .all(week.id);

  const days = weekDates(weekStartISO).map((date) => ({
    date,
    isToday: date === todayISO,
    meals: meals
      .filter((m) => m.day_date === date)
      .map((m) => ({
        id: m.id,
        mealType: m.meal_type,
        title: m.title,
        subtitle: m.subtitle,
        isLeftover: !!m.is_leftover,
        price: m.price,
        protein: m.protein,
        needsDefrost: !!m.needs_defrost,
        prepMinutes: m.prep_minutes,
        cookMinutes: m.cook_minutes,
        totalMinutes:
          (Number(m.prep_minutes) || 0) + (Number(m.cook_minutes) || 0) || null,
        difficulty: m.difficulty || '',
        ingredients: JSON.parse(m.ingredients_json || '[]'),
        recipe: m.recipe
      }))
  }));

  return { weekStart: weekStartISO, weekId: week.id, label: week.label, days, hasPlan: meals.length > 0 };
}

/** Aggregate every ingredient across the week, minus what's already in the fridge. */
function computeGroceryList(weekStartISO) {
  const week = db.prepare('SELECT * FROM weeks WHERE week_start = ?').get(weekStartISO);
  if (!week) return { weekStart: weekStartISO, items: [] };

  const meals = db.prepare('SELECT ingredients_json FROM meals WHERE week_id = ?').all(week.id);
  const fridge = getActiveFridgeItems();
  const fridgeByName = new Map(fridge.map((f) => [f.name.toLowerCase().trim(), f]));

  const needed = new Map(); // name -> {name, quantity, unit}
  for (const m of meals) {
    const ingredients = JSON.parse(m.ingredients_json || '[]');
    for (const ing of ingredients) {
      const key = `${ing.name.toLowerCase().trim()}|${(ing.unit || '').toLowerCase()}`;
      const prev = needed.get(key) || { name: ing.name, unit: ing.unit || '', quantity: 0 };
      prev.quantity += Number(ing.quantity) || 0;
      needed.set(key, prev);
    }
  }

  const items = [];
  for (const { name, unit, quantity } of needed.values()) {
    const inFridge = fridgeByName.get(name.toLowerCase().trim());
    const stillNeeded = inFridge ? Math.max(0, quantity - (Number(inFridge.quantity) || 0)) : quantity;
    if (stillNeeded > 0.01) {
      items.push({ name, unit, quantity: Math.round(stillNeeded * 100) / 100 });
    }
  }
  items.sort((a, b) => a.name.localeCompare(b.name));

  // Persist so checkbox state can stick across reloads.
  const existing = db.prepare('SELECT name, unit, checked FROM grocery_list_items WHERE week_id = ?').all(week.id);
  const checkedMap = new Map(existing.map((e) => [`${e.name.toLowerCase()}|${e.unit.toLowerCase()}`, e.checked]));

  db.prepare('DELETE FROM grocery_list_items WHERE week_id = ?').run(week.id);
  const insert = db.prepare(
    'INSERT INTO grocery_list_items (week_id, name, quantity, unit, checked) VALUES (?, ?, ?, ?, ?)'
  );
  const tx = db.transaction(() => {
    for (const it of items) {
      const key = `${it.name.toLowerCase()}|${it.unit.toLowerCase()}`;
      insert.run(week.id, it.name, it.quantity, it.unit, checkedMap.get(key) || 0);
    }
  });
  tx();

  return {
    weekStart: weekStartISO,
    items: db.prepare('SELECT * FROM grocery_list_items WHERE week_id = ? ORDER BY name ASC').all(week.id)
  };
}

/** Meals happening tomorrow that need meat defrosted tonight and haven't been notified yet. */
function getDueDefrostReminders() {
  const tomorrow = toISO(addDays(new Date(), 1));
  const rows = db
    .prepare(
      `SELECT meals.*, weeks.week_start FROM meals
       JOIN weeks ON weeks.id = meals.week_id
       WHERE meals.day_date = ? AND meals.needs_defrost = 1 AND meals.defrost_notified = 0`
    )
    .all(tomorrow);
  return rows;
}

function markDefrostNotified(mealIds) {
  if (!mealIds.length) return;
  const stmt = db.prepare('UPDATE meals SET defrost_notified = 1 WHERE id = ?');
  const tx = db.transaction(() => mealIds.forEach((id) => stmt.run(id)));
  tx();
}

module.exports = {
  currentWeekStartISO,
  startOfWeek,
  toISO,
  addDays,
  weekDates,
  ensureWeek,
  generatePlanForWeek,
  getWeekPlan,
  computeGroceryList,
  getDueDefrostReminders,
  markDefrostNotified,
  getActiveFridgeItems,
  getRecentGroceries,
  getActiveCravings,
  getPreferences,
  updatePreferences
};
