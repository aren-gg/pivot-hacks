const MODEL = process.env.GEMINI_MODEL || 'gemini-2.5-flash';
const API_BASE = 'https://generativelanguage.googleapis.com/v1beta/models';

/**
 * Low-level call to the Google Gemini generateContent API.
 * Expects GEMINI_API_KEY to be set in the environment.
 *
 * The system prompt is passed via systemInstruction and the user prompt as a
 * single user content part. We request an application/json response mime type
 * so the model returns raw JSON (no markdown fences); extractJson still
 * tolerates fences/preamble as a safety net.
 */
async function callClaude({ system, prompt, maxTokens = 2000 }) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error('GEMINI_API_KEY is not set. Add it to backend/.env');
  }

  const url = `${API_BASE}/${MODEL}:generateContent`;
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-goog-api-key': apiKey
    },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: system }] },
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
      generationConfig: {
        maxOutputTokens: maxTokens,
        responseMimeType: 'application/json'
      }
    })
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Gemini API error ${res.status}: ${errText}`);
  }

  const data = await res.json();
  const parts = data?.candidates?.[0]?.content?.parts || [];
  return parts.map((p) => p.text || '').join('');
}

/**
 * Read a grocery receipt image and extract its food items with estimated
 * shelf life. `imageBase64` is the raw base64 (no data: prefix); `mimeType`
 * is e.g. 'image/jpeg' or 'image/png'. Returns an array of
 * { name, quantity, unit, days_until_expiry }.
 */
async function parseReceipt(imageBase64, mimeType = 'image/jpeg') {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error('GEMINI_API_KEY is not set. Add it to backend/.env');
  }

  const system = `You read a photo of a grocery receipt and extract every FOOD item.
Output ONLY valid JSON, no prose, no markdown fences, matching exactly this shape:
[
  {"name": "string, the food item", "quantity": number, "unit": "string", "days_until_expiry": number}
]
Rules:
- Include only edible groceries; skip taxes, totals, store names, loyalty lines, bags, non-food.
- Normalize cryptic receipt abbreviations to plain names (e.g. "GV MLK 2%" -> "milk").
- quantity defaults to 1 and unit to "" if not clear from the receipt.
- days_until_expiry: estimate from typical shelf life (fresh fish ~2, chicken ~3, leafy greens ~5, bread ~5, milk ~7, eggs ~21, dry/canned goods ~365).
- If you cannot read any food items, return [].`;

  const url = `${API_BASE}/${MODEL}:generateContent`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-goog-api-key': apiKey },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: system }] },
      contents: [
        {
          role: 'user',
          parts: [
            { text: 'Extract the food items from this receipt as JSON.' },
            { inline_data: { mime_type: mimeType, data: imageBase64 } }
          ]
        }
      ],
      generationConfig: { maxOutputTokens: 8000, responseMimeType: 'application/json' }
    })
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Gemini vision error ${res.status}: ${errText}`);
  }

  const data = await res.json();
  const candidate = data?.candidates?.[0];
  const parts = candidate?.content?.parts || [];
  const raw = parts.map((p) => p.text || '').join('');

  if (!raw.trim()) {
    throw new Error(
      `Gemini returned no text (finishReason: ${candidate?.finishReason || 'unknown'}). Try a clearer receipt photo.`
    );
  }
  if (candidate?.finishReason === 'MAX_TOKENS') {
    throw new Error('The receipt had too many items to read in one pass. Try a photo of fewer items at a time.');
  }

  let parsed;
  try {
    parsed = extractJson(raw);
  } catch (e) {
    throw new Error('Could not parse the receipt items. Try a clearer photo.');
  }
  return Array.isArray(parsed) ? parsed : parsed.items || [];
}

/** Strip ```json fences and any stray preamble so JSON.parse doesn't choke. */
function extractJson(raw) {
  const cleaned = raw.replace(/```json|```/g, '').trim();
  const start = cleaned.indexOf('{');
  const arrStart = cleaned.indexOf('[');
  let from = start;
  if (arrStart !== -1 && (start === -1 || arrStart < start)) from = arrStart;
  const jsonSlice = from >= 0 ? cleaned.slice(from) : cleaned;
  return JSON.parse(jsonSlice);
}

/**
 * Generate a full week of lunches + dinners from fridge stock, recent
 * groceries and active cravings. Returns structured JSON, not prose.
 */
async function generateWeekPlan({ weekStartLabel, days, fridgeItems, groceries, cravings, planLabel, planPace, preferences }) {
  const prefs = preferences || {};
  const system = `You are a meal-planning engine for a solo/small-household weekly meal plan app.
You output ONLY valid JSON, no prose, no markdown fences, matching exactly this shape:
{
  "days": [
    {
      "date": "YYYY-MM-DD",
      "meals": [
        {
          "meal_type": "lunch" | "dinner",
          "title": "string, short recipe name",
          "subtitle": "string, e.g. 'standalone, not leftovers' or 'Leftovers: <dinner title>' or empty string",
          "is_leftover": true | false,
          "price": number (estimated cost per serving in the user's currency, 1 decimal),
          "protein": "string, main protein used, empty string if none",
          "needs_defrost": true | false (true only if protein is a frozen meat/fish that must be defrosted the night before),
          "prep_minutes": number (integer, hands-on prep time in minutes),
          "cook_minutes": number (integer, cooking/baking time in minutes),
          "difficulty": "easy" | "medium" | "hard",
          "ingredients": [{"name": "string", "quantity": number (amount this recipe uses), "unit": "string", "purchase_package": "string (the realistic retail package you'd buy, e.g. '16 oz jar', '1 lb bag', 'dozen'), "package_price": number (realistic full retail price to BUY that whole package, in the user's currency, 1 decimal), "expires_on": "YYYY-MM-DD (realistic use-by date for this ingredient given typical shelf life from the plan start date; for a fridge item that already has an expiry, use that date)"}],
          "recipe": "string, 2-4 short sentences"
        }
      ]
    }
  ]
}
Rules:
- Cover every date given, each with exactly one lunch and one dinner.
- Prefer turning last night's dinner into the next day's lunch as "Leftovers: <title>" to cut cost and waste, unless cravings call for variety.
- Weight recipes toward the fridge items and recently bought groceries so little goes to waste; only add a handful of new ingredients per week.
- Weave in active cravings naturally across the week rather than cramming them all on day one.
- Keep estimated prices realistic for home cooking.
- Flag needs_defrost true only for dinners using raw frozen meat/fish/poultry as the protein.
- Always include realistic prep_minutes and cook_minutes for every meal (leftovers should have small prep and near-zero cook time).
- For every ingredient, give purchase_package and package_price reflecting a REAL retail unit you actually buy, not a pro-rated sliver. Example: a recipe using 1 tbsp peanut butter still lists purchase_package "16 oz jar" and package_price around 4.50 — you buy the whole jar. Staples (salt, oil, spices) you likely already own can use a small package_price.
- Plan the week so purchased packages get USED UP across multiple meals — if a recipe needs part of a package, reuse the rest in other meals that week so little is wasted. Avoid buying a package for a single tablespoon unless unavoidable.
- Prioritize ingredients already in the fridge, ESPECIALLY ones expiring soonest — schedule those into earlier days so they're used before they spoil. When a meal uses a soon-to-expire fridge item, mention it in the recipe text (e.g. "Use the spinach now — it expires in 2 days.").
- For every ingredient, set expires_on to a realistic use-by date based on typical shelf life measured from the week's start date (e.g. fresh fish ~2 days, chicken ~3 days, leafy greens ~5 days, eggs ~3 weeks, dry/canned goods ~months). If a fridge item already has an expiry date, reuse that exact date.
- Set difficulty honestly based on technique required.
${personalizationRules(prefs)}`;

  const prompt = `Plan label: ${planLabel} · ${planPace}
Week starting: ${weekStartLabel}
Dates to plan (in order): ${days.join(', ')}

${personalizationContext(prefs)}
Current fridge inventory:
${fridgeItems.length ? fridgeItems.map((f) => `- ${f.quantity} ${f.unit} ${f.name}${f.expires_at ? ` (expires ${f.expires_at})` : ''}`).join('\n') : '(empty)'}

Recently bought groceries (last 7 days):
${groceries.length ? groceries.map((g) => `- ${g.quantity} ${g.unit} ${g.name}`).join('\n') : '(none logged)'}

Active cravings to weave in:
${cravings.length ? cravings.map((c) => `- ${c.text}`).join('\n') : '(none)'}

Return the JSON now.`;

  const raw = await callClaude({ system, prompt, maxTokens: 32000 });
  return extractJson(raw);
}

/** Prompt rules derived from the user's saved preferences. */
function personalizationRules(prefs) {
  const rules = [];
  const sym = prefs.currency_symbol || '$';
  const code = prefs.currency_code || 'USD';
  rules.push(`- Estimate every price in ${code} (${sym}). All price numbers must be in ${code}, not USD.`);
  if (prefs.max_price_per_serving) {
    rules.push(`- Keep every meal at or under ${sym}${Number(prefs.max_price_per_serving).toFixed(2)} per serving (the user's budget).`);
  } else {
    rules.push('- Keep estimated prices realistic for home cooking in the user\'s region and currency.');
  }
  if (prefs.max_total_minutes) {
    rules.push(`- Keep prep_minutes + cook_minutes at or under ${prefs.max_total_minutes} minutes total per meal.`);
  }
  const exp = (prefs.cooking_experience || 'intermediate').toLowerCase();
  if (exp === 'beginner') {
    rules.push('- The cook is a BEGINNER: favor simple techniques and short ingredient lists; difficulty should mostly be "easy". Explain steps plainly.');
  } else if (exp === 'advanced') {
    rules.push('- The cook is ADVANCED: more involved techniques and "medium"/"hard" difficulty are welcome.');
  } else {
    rules.push('- The cook is INTERMEDIATE: a mix of "easy" and "medium" difficulty is fine.');
  }
  if (prefs.lifestyle && prefs.lifestyle.trim()) {
    rules.push(`- Respect these dietary/lifestyle needs strictly: ${prefs.lifestyle.trim()}.`);
  }
  return rules.join('\n');
}

/** Human-readable preferences block for the user prompt. */
function personalizationContext(prefs) {
  const sym = prefs.currency_symbol || '$';
  const code = prefs.currency_code || 'USD';
  const lines = ['User preferences:'];
  lines.push(`- Currency: ${code} (${sym})`);
  lines.push(`- Cooking experience: ${prefs.cooking_experience || 'intermediate'}`);
  lines.push(`- Budget per serving: ${prefs.max_price_per_serving ? sym + Number(prefs.max_price_per_serving).toFixed(2) : 'no strict limit'}`);
  lines.push(`- Max time per meal: ${prefs.max_total_minutes ? prefs.max_total_minutes + ' min' : 'no strict limit'}`);
  lines.push(`- Lifestyle/diet: ${prefs.lifestyle && prefs.lifestyle.trim() ? prefs.lifestyle.trim() : 'no specific restrictions'}`);
  return lines.join('\n') + '\n';
}

/**
 * Classify a free-text Discord message into one structured action the bot
 * should take, plus a short natural reply to send back to the user.
 */
async function parseMessage(text) {
  const today = new Date().toISOString().slice(0, 10);
  const system = `You read one short chat message sent to a meal-planning Discord bot and turn it into ONE structured action.
Today's date is ${today}. Resolve any relative dates (e.g. "in 5 days", "next friday") to an absolute YYYY-MM-DD based on today.
Output ONLY valid JSON matching exactly this shape, no prose, no markdown fences:
{
  "intent": "craving" | "fridge_add" | "fridge_remove" | "grocery_bought" | "grocery_add" | "generate_plan" | "show_plan" | "show_fridge" | "grocery_list" | "other",
  "items": [{"name": "string", "quantity": number, "unit": "string", "expires_at": "YYYY-MM-DD or empty string if no expiry mentioned"}],
  "craving_text": "string, only for intent=craving",
  "reply": "string, one short friendly sentence confirming what you understood, in the app's plain conversational voice, no emoji spam (max one emoji)"
}
Guidance:
- "I'm craving spicy noodles" -> intent craving, craving_text "spicy noodles"
- "bought 2 lbs chicken thighs and a bag of rice" -> intent grocery_bought (already purchased -> goes into fridge), items for each thing bought
- "add milk to my shopping list" / "I need to buy eggs" / "put tomatoes on the grocery list" -> intent grocery_add (still needs to be bought -> goes on the to-buy list), items
- "used up the eggs" / "we're out of milk" -> intent fridge_remove, items
- "just got back from the store, added broccoli, tofu, soy sauce to the fridge" -> intent fridge_add, items
- "bought milk, expires next friday" or "chicken that goes bad in 3 days" -> set that item's expires_at to the resolved YYYY-MM-DD date; otherwise leave expires_at empty
- "plan my week" / "generate this week's meals" -> intent generate_plan
- "what's for dinner today" / "show my plan" -> intent show_plan
- "what's in the fridge" / "what do I have" / "list my fridge" -> intent show_fridge
- "what do I need to buy" -> intent grocery_list
- default unit to "" and quantity to 1 if not specified
- if the message doesn't map to any of these, use intent "other" and a helpful reply explaining what the bot can do`;

  const raw = await callClaude({ system, prompt: text, maxTokens: 2000 });
  return extractJson(raw);
}

/**
 * Regenerate a SINGLE meal using only what's currently in the fridge (plus
 * basic pantry staples), for when the user has run out of ingredients for the
 * originally planned meal. Returns one meal object in the same shape as a meal
 * inside generateWeekPlan's output.
 */
async function regenerateMeal({ mealType, dayDate, fridgeItems = [], preferences = {}, avoidTitle = '' }) {
  const prefs = preferences || {};
  const sym = prefs.currency_symbol || '$';
  const code = prefs.currency_code || 'USD';

  const system = `You create ONE ${mealType || 'meal'} using ONLY ingredients the user already has on hand (plus basic pantry staples like salt, pepper, oil, common spices).
The user has run out of ingredients for their originally planned meal, so you must adapt to what's actually in their fridge.
Output ONLY valid JSON, no prose, no markdown fences, matching exactly this shape:
{
  "meal_type": "${mealType || 'dinner'}",
  "title": "string, short recipe name",
  "subtitle": "string, e.g. 'made from what's in your fridge' or empty",
  "is_leftover": false,
  "price": number (estimated cost per serving in ${code}, 1 decimal),
  "protein": "string, main protein used, empty if none",
  "needs_defrost": true | false,
  "prep_minutes": number,
  "cook_minutes": number,
  "difficulty": "easy" | "medium" | "hard",
  "ingredients": [{"name": "string", "quantity": number, "unit": "string", "purchase_package": "string", "package_price": number, "expires_on": "YYYY-MM-DD"}],
  "recipe": "string, 2-4 short sentences"
}
Rules:
- Use ONLY items from the provided fridge list plus basic staples. Do NOT introduce new main ingredients that would require shopping.
- Prices in ${code} (${sym}); prioritize fridge items expiring soonest.
${avoidTitle ? `- Make something different from "${avoidTitle}" (that's the meal they can no longer make).` : ''}
${prefs.lifestyle && prefs.lifestyle.trim() ? `- Respect dietary needs: ${prefs.lifestyle.trim()}.` : ''}
- If the fridge truly has too little to make anything, still return a minimal simple dish from whatever is closest.`;

  const prompt = `Meal to create: ${mealType || 'dinner'}${dayDate ? ` for ${dayDate}` : ''}.

Current fridge inventory (use these):
${fridgeItems.length ? fridgeItems.map((f) => `- ${f.quantity} ${f.unit} ${f.name}${f.expires_at ? ` (expires ${f.expires_at})` : ''}`).join('\n') : '(empty)'}

Return the single meal JSON now.`;

  const raw = await callClaude({ system, prompt, maxTokens: 4000 });
  return extractJson(raw);
}

/**
 * Take a short audio clip of a home cook speaking while cooking, transcribe it,
 * and return brief spoken-style cooking feedback. `audioBase64` is raw base64
 * (no data: prefix); `mimeType` e.g. 'audio/wav'.
 * If `wakeWord` is set, the cook must address the assistant by that name for
 * advice to be given. Returns { heard, triggered, advice }.
 */
async function voiceFeedback(audioBase64, mimeType = 'audio/wav', wakeWord = '') {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error('GEMINI_API_KEY is not set. Add it to backend/.env');

  const wake = (wakeWord || '').trim();
  const system = wake
    ? `You are a hands-free sous-chef named "${wake}" listening to a home cook who is actively cooking and can't look at a screen.
You receive a short audio clip of them speaking. First transcribe it. Only respond with cooking help IF the cook addressed you by name ("${wake}") in the clip (e.g. "${wake}, the sauce is too salty" or "hey ${wake} what temp for chicken"). Name-matching should be lenient to transcription errors of "${wake}".
Output ONLY valid JSON, no prose, no fences, matching exactly:
{"heard": "clean transcription of what they said", "wake_detected": true | false, "advice": "if wake_detected is true, 1-2 short sentences of actionable cooking help answering their request (with the wake word removed); if wake_detected is false, empty string"}`
    : `You are a hands-free sous-chef listening to a home cook who is actively cooking and can't look at a screen.
You receive a short audio clip of them speaking. Transcribe what they said, then give ONE concise, practical piece of cooking help.
Output ONLY valid JSON, no prose, no fences, matching exactly:
{"heard": "clean transcription", "wake_detected": true, "advice": "1-2 short sentences of actionable cooking help; if it's a question, answer it directly"}`;

  const url = `${API_BASE}/${MODEL}:generateContent`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-goog-api-key': apiKey },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: system }] },
      contents: [
        {
          role: 'user',
          parts: [
            { text: 'Here is what the cook just said:' },
            { inline_data: { mime_type: mimeType, data: audioBase64 } }
          ]
        }
      ],
      generationConfig: { maxOutputTokens: 2000, responseMimeType: 'application/json' }
    })
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Gemini audio error ${res.status}: ${errText}`);
  }

  const data = await res.json();
  const candidate = data?.candidates?.[0];
  const raw = (candidate?.content?.parts || []).map((p) => p.text || '').join('');
  if (!raw.trim()) throw new Error(`Gemini returned no text (finishReason: ${candidate?.finishReason || 'unknown'}).`);
  const parsed = extractJson(raw);
  return {
    heard: parsed.heard || '',
    triggered: parsed.wake_detected !== false,
    advice: parsed.advice || ''
  };
}

module.exports = { generateWeekPlan, parseMessage, parseReceipt, regenerateMeal, voiceFeedback, callClaude, extractJson };
