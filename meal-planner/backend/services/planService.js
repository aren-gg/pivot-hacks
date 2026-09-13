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

function currencyInfo() {
  const p = getPreferences();
  return { code: p.currency_code || 'USD', symbol: p.currency_symbol || '$' };
}

function getPreferences() {
  return (
    db.prepare('SELECT * FROM preferences WHERE id = 1').get() || {
      id: 1,
      lifestyle: '',
      max_price_per_serving: null,
      cooking_experience: 'intermediate',
      max_total_minutes: null,
      currency_code: 'USD',
      currency_symbol: '$'
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
      patch.max_total_minutes !== undefined ? patch.max_total_minutes : current.max_total_minutes,
    currency_code: patch.currency_code !== undefined ? patch.currency_code : current.currency_code,
    currency_symbol: patch.currency_symbol !== undefined ? patch.currency_symbol : current.currency_symbol
  };
  db.prepare(
    `UPDATE preferences
     SET lifestyle = @lifestyle,
         max_price_per_serving = @max_price_per_serving,
         cooking_experience = @cooking_experience,
         max_total_minutes = @max_total_minutes,
         currency_code = @currency_code,
         currency_symbol = @currency_symbol,
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
      hasPlan: false,
      currency: currencyInfo()
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

  return { weekStart: weekStartISO, weekId: week.id, label: week.label, days, hasPlan: meals.length > 0, currency: currencyInfo() };
}

/** Merge grocery rows for a week that share the same item name (case-insensitive),
 * summing quantities and keeping one row. Prefers a checked state if any dup is
 * checked, and keeps the first non-null price/package_size. */
function dedupeGroceryRows(weekId) {
  const rows = db
    .prepare('SELECT * FROM grocery_list_items WHERE week_id = ? ORDER BY id ASC')
    .all(weekId);

  const byName = new Map(); // nameKey -> keeper row (with merged fields)
  const toDelete = [];
  for (const r of rows) {
    const key = r.name.toLowerCase().trim();
    const keeper = byName.get(key);
    if (!keeper) {
      byName.set(key, { ...r, quantity: Number(r.quantity) || 0 });
      continue;
    }
    keeper.quantity += Number(r.quantity) || 0;
    keeper.checked = keeper.checked || r.checked ? 1 : 0;
    if (keeper.price == null && r.price != null) keeper.price = r.price;
    if (!keeper.package_size && r.package_size) keeper.package_size = r.package_size;
    if (!keeper.unit && r.unit) keeper.unit = r.unit;
    // A merged line is manual if either side was manual (so it survives recompute).
    if (r.source === 'manual') keeper.source = 'manual';
    toDelete.push(r.id);
  }

  const update = db.prepare(
    'UPDATE grocery_list_items SET quantity = ?, checked = ?, price = ?, package_size = ?, unit = ?, source = ? WHERE id = ?'
  );
  const delStmt = db.prepare('DELETE FROM grocery_list_items WHERE id = ?');
  const tx = db.transaction(() => {
    for (const k of byName.values()) {
      update.run(
        Math.round(k.quantity * 100) / 100,
        k.checked ? 1 : 0,
        k.price ?? null,
        k.package_size || '',
        k.unit || '',
        k.source || 'plan',
        k.id
      );
    }
    for (const id of toDelete) delStmt.run(id);
  });
  tx();
}

/** Add a manually-entered "to buy" item to a week's grocery list. */
function addManualGroceryItem(weekStartISO, { name, quantity = 1, unit = '' }) {
  const week = ensureWeek(weekStartISO);
  db.prepare(
    "INSERT INTO grocery_list_items (week_id, name, quantity, unit, source, checked) VALUES (?, ?, ?, ?, 'manual', 0)"
  ).run(week.id, name, Number(quantity) || 1, unit || '');
  return computeGroceryList(weekStartISO);
}

/** Remove a grocery list item by id (works for both manual and plan rows). */
function removeGroceryItem(id) {
  return db.prepare('DELETE FROM grocery_list_items WHERE id = ?').run(id).changes;
}

/** Aggregate every ingredient across the week, minus what's already in the fridge. */
function computeGroceryList(weekStartISO) {
  const week = db.prepare('SELECT * FROM weeks WHERE week_start = ?').get(weekStartISO);
  if (!week) return { weekStart: weekStartISO, items: [], currency: currencyInfo() };

  const meals = db.prepare('SELECT ingredients_json FROM meals WHERE week_id = ?').all(week.id);
  const fridge = getActiveFridgeItems();
  const fridgeByName = new Map(fridge.map((f) => [f.name.toLowerCase().trim(), f]));

  // Aggregate by ingredient name. We show ONE realistic retail package per
  // ingredient (you buy a whole jar, not a tablespoon), so price is the full
  // package_price, not a pro-rated fraction.
  const needed = new Map(); // nameKey -> {name, unit, quantity, packagePrice, packageSize}
  for (const m of meals) {
    const ingredients = JSON.parse(m.ingredients_json || '[]');
    for (const ing of ingredients) {
      const nameKey = ing.name.toLowerCase().trim();
      const prev =
        needed.get(nameKey) || { name: ing.name, unit: ing.unit || '', quantity: 0, packagePrice: 0, packageSize: '' };
      prev.quantity += Number(ing.quantity) || 0;
      // Same product across meals => same package. Keep the highest stated
      // package price seen (guards against a stray tiny value) and a size label.
      const pp = Number(ing.package_price) || 0;
      if (pp > prev.packagePrice) prev.packagePrice = pp;
      if (!prev.packageSize && ing.purchase_package) prev.packageSize = String(ing.purchase_package);
      needed.set(nameKey, prev);
    }
  }

  const items = [];
  for (const { name, unit, quantity, packagePrice, packageSize } of needed.values()) {
    const inFridge = fridgeByName.get(name.toLowerCase().trim());
    const stillNeeded = inFridge ? Math.max(0, quantity - (Number(inFridge.quantity) || 0)) : quantity;
    // If the fridge already covers the amount the recipes call for, don't buy it.
    if (stillNeeded > 0.01) {
      items.push({
        name,
        unit,
        quantity: Math.round(stillNeeded * 100) / 100,
        price: packagePrice > 0 ? Math.round(packagePrice * 100) / 100 : null,
        package_size: packageSize || ''
      });
    }
  }
  items.sort((a, b) => a.name.localeCompare(b.name));

  // Persist so checkbox state can stick across reloads. Only the plan-derived
  // rows are rebuilt; manually-added items (source='manual') are preserved.
  const existing = db
    .prepare("SELECT name, unit, checked FROM grocery_list_items WHERE week_id = ? AND source = 'plan'")
    .all(week.id);
  const checkedMap = new Map(existing.map((e) => [`${e.name.toLowerCase()}|${e.unit.toLowerCase()}`, e.checked]));

  db.prepare("DELETE FROM grocery_list_items WHERE week_id = ? AND source = 'plan'").run(week.id);
  const insert = db.prepare(
    "INSERT INTO grocery_list_items (week_id, name, quantity, unit, package_size, price, source, checked) VALUES (?, ?, ?, ?, ?, ?, 'plan', ?)"
  );
  const tx = db.transaction(() => {
    for (const it of items) {
      const key = `${it.name.toLowerCase()}|${it.unit.toLowerCase()}`;
      insert.run(week.id, it.name, it.quantity, it.unit, it.package_size, it.price, checkedMap.get(key) || 0);
    }
  });
  tx();

  // Merge duplicate rows (same item name, case-insensitive) across plan +
  // manual entries into a single line with the summed quantity.
  dedupeGroceryRows(week.id);

  const rows = db.prepare('SELECT * FROM grocery_list_items WHERE week_id = ? ORDER BY name ASC').all(week.id);
  const total = rows.reduce((sum, r) => sum + (Number(r.price) || 0), 0);

  return {
    weekStart: weekStartISO,
    items: rows,
    total: Math.round(total * 100) / 100,
    currency: currencyInfo()
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

/** Regenerate a single meal using only what's in the fridge (ran out of the
 * originally planned ingredients). Updates the meal row in place. */
async function swapMealFromFridge(mealId) {
  const meal = db.prepare('SELECT * FROM meals WHERE id = ?').get(mealId);
  if (!meal) throw new Error('meal not found');

  const fridgeItems = getActiveFridgeItems();
  const preferences = getPreferences();

  const m = await aiService.regenerateMeal({
    mealType: meal.meal_type,
    dayDate: meal.day_date,
    fridgeItems,
    preferences,
    avoidTitle: meal.title
  });

  db.prepare(
    `UPDATE meals SET title=@title, subtitle=@subtitle, is_leftover=@is_leftover, price=@price,
       protein=@protein, needs_defrost=@needs_defrost, prep_minutes=@prep_minutes,
       cook_minutes=@cook_minutes, difficulty=@difficulty, ingredients_json=@ingredients_json,
       recipe=@recipe, defrost_notified=0 WHERE id=@id`
  ).run({
    id: mealId,
    title: m.title || meal.title,
    subtitle: m.subtitle || 'made from what\'s in your fridge',
    is_leftover: m.is_leftover ? 1 : 0,
    price: m.price ?? null,
    protein: m.protein || '',
    needs_defrost: m.needs_defrost ? 1 : 0,
    prep_minutes: Number.isFinite(m.prep_minutes) ? Math.round(m.prep_minutes) : null,
    cook_minutes: Number.isFinite(m.cook_minutes) ? Math.round(m.cook_minutes) : null,
    difficulty: m.difficulty || '',
    ingredients_json: JSON.stringify(m.ingredients || []),
    recipe: m.recipe || ''
  });

  const week = db.prepare('SELECT week_start FROM weeks WHERE id = ?').get(meal.week_id);
  const updated = db.prepare('SELECT * FROM meals WHERE id = ?').get(mealId);
  return {
    weekStart: week ? week.week_start : null,
    dayDate: meal.day_date,
    mealType: meal.meal_type,
    previousTitle: meal.title,
    meal: {
      id: updated.id,
      mealType: updated.meal_type,
      title: updated.title,
      subtitle: updated.subtitle,
      price: updated.price,
      prepMinutes: updated.prep_minutes,
      cookMinutes: updated.cook_minutes,
      difficulty: updated.difficulty,
      ingredients: JSON.parse(updated.ingredients_json || '[]'),
      recipe: updated.recipe
    }
  };
}

/** Find a meal id by week start, day date, and meal type. */
function findMeal(weekStartISO, dayDate, mealType) {
  const week = db.prepare('SELECT id FROM weeks WHERE week_start = ?').get(weekStartISO);
  if (!week) return null;
  return db
    .prepare('SELECT * FROM meals WHERE week_id = ? AND day_date = ? AND lower(meal_type) = lower(?)')
    .get(week.id, dayDate, mealType);
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
  updatePreferences,
  addManualGroceryItem,
  removeGroceryItem,
  swapMealFromFridge,
  findMeal
};
