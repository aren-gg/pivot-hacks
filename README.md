# Meal Planner + Discord Bot

A weekly meal-planning website paired with a Discord bot. Tell the bot what
you're craving, what's in your fridge, and what you just bought — it (via
Claude) builds a lunch/dinner plan for the week, shows it on the website,
reminds you to defrost meat the night before, and generates next week's
grocery list automatically.

## How it fits together

```
Discord  <--slash cmds & free text-->  bot/            (discord.js)
                                          |
                                          | REST calls
                                          v
                                       backend/         (Express + SQLite + Claude)
                                          ^
                                          | REST calls
                                          |
                                      frontend/          (Next.js website)
```

- **`backend/`** — Express API + SQLite database. Owns all state (fridge,
  groceries, cravings, weekly plans). Calls the Anthropic API to (a) turn a
  fridge/cravings/groceries snapshot into a full week of meals, and (b)
  classify free-text Discord messages into an action.
- **`bot/`** — Discord bot (discord.js). Slash commands + a "just type
  normally in this channel" free-text mode. Also runs two scheduled jobs:
  nightly defrost reminders and a weekly plan/grocery-list generation.
- **`frontend/`** — Next.js site styled to match your screenshot: a week
  header with prev/next arrows, "This Week" / "Grocery List" tabs, and a
  card per day with expandable lunch/dinner rows.

Only the backend talks to the database and to Claude. The bot and the
website are both just clients of the backend's REST API.

---

## 0. Prerequisites

- Node.js 18+ and npm
- A GitHub account
- A Discord account (and a server you can add bots to)
- An Anthropic API key — https://console.anthropic.com

---

## 1. Create the GitHub repo

```bash
# from the unzipped project folder
git init
git add .
git commit -m "Initial commit: meal planner website + Discord bot"
```

Then on GitHub: **New repository** → give it a name (e.g. `meal-planner`) →
don't initialize with a README (you already have one) → create.

```bash
git remote add origin https://github.com/<your-username>/meal-planner.git
git branch -M main
git push -u origin main
```

The `.gitignore` at the repo root already excludes `node_modules/`, every
`.env` file, and the SQLite database file, so secrets and local state never
get committed.

---

## 2. Backend: install and configure

```bash
cd backend
npm install
cp .env.example .env
```

Edit `backend/.env`:

- `ANTHROPIC_API_KEY` — your key from the Anthropic Console.
- `ANTHROPIC_MODEL` — leave as `claude-sonnet-5`, or swap for another current
  model string if you prefer.
- `CORS_ORIGIN` — the URL your frontend runs on (`http://localhost:3000` for
  local dev; update to your deployed frontend URL later).
- `PLAN_LABEL` / `PLAN_PACE` — the two words shown in the header, e.g.
  "Plan Solo" and "Fast", matching your screenshot.

Run it:

```bash
npm start
# meal-planner backend listening on :4000
```

Sanity check:

```bash
curl http://localhost:4000/api/health
# {"ok":true}
```

---

## 3. Discord: create the application and bot

1. Go to https://discord.com/developers/applications → **New Application** →
   name it (e.g. "Meal Planner") → **Create**.
2. In the left sidebar, open **Bot** → **Add Bot** (if not already added).
3. Under **Privileged Gateway Intents**, turn **ON**:
   - `MESSAGE CONTENT INTENT` (required — the bot reads free-text messages
     in your meal-planning channel to understand cravings/fridge/grocery
     updates).
4. Click **Reset Token** → copy it. This is your `DISCORD_TOKEN`. Treat it
   like a password; never commit it.
5. In the left sidebar, open **General Information** → copy the
   **Application ID**. This is your `DISCORD_CLIENT_ID`.
6. Invite the bot to your server:
   - Left sidebar → **OAuth2** → **URL Generator**.
   - Scopes: check `bot` and `applications.commands`.
   - Bot Permissions: check `Send Messages`, `Read Message History`,
     `Embed Links`, `Use Slash Commands`.
   - Copy the generated URL, open it in your browser, pick your server,
     authorize.
7. In Discord, enable **Developer Mode** (User Settings → Advanced), then
   right-click the channel you want the bot to watch (e.g. `#meal-planning`)
   → **Copy Channel ID**. This is your `MEAL_CHANNEL_ID`.

---

## 4. Bot: install, configure, register commands, run

```bash
cd bot
npm install
cp .env.example .env
```

Edit `bot/.env`:

- `DISCORD_TOKEN`, `DISCORD_CLIENT_ID` — from step 3.
- `DISCORD_GUILD_ID` — right-click your server icon → Copy Server ID. While
  you're actively building, register commands to this one server so changes
  show up instantly (global commands can take up to an hour to propagate).
  Remove this once you're ready to make the bot public.
- `API_BASE_URL` — `http://localhost:4000` for local dev.
- `MEAL_CHANNEL_ID` — from step 3.
- `WEBSITE_URL` — `http://localhost:3000` for local dev.
- `DEFROST_CHECK_TIME` — e.g. `18:00`, checked once daily.
- `GROCERY_DAY` / `GROCERY_TIME` — when next week's plan + grocery list
  auto-generate, e.g. Saturday (`6`) at `17:00`.

Register the slash commands (run this once, and again any time you change
`deploy-commands.js`):

```bash
npm run deploy-commands
```

Start the bot:

```bash
npm start
# Meal planner bot online as Meal Planner#1234
```

### Try it

In your `#meal-planning` channel in Discord:

```
/craving text: spicy noodles
/fridge-add name: chicken thighs quantity: 2 unit: lbs
/grocery-bought name: rice quantity: 1 unit: bag
/plan-generate
/plan-today
/grocery-list
```

Or just type normally in that channel — no slash needed:

```
just got back from the store, bought broccoli, tofu, and soy sauce
```

The bot replies with a short confirmation either way.

---

## 5. Frontend: install, configure, run

```bash
cd frontend
npm install
cp .env.example .env.local
```

Edit `frontend/.env.local`:

- `NEXT_PUBLIC_API_URL` — `http://localhost:4000` for local dev.

Run it:

```bash
npm run dev
```

Open http://localhost:3000 — you'll see the current week. If no plan has
been generated yet, run `/plan-generate` in Discord (or `POST
/api/plan/generate` directly) and refresh.

---

## 6. End-to-end test

1. In Discord: log a few fridge items and a craving.
2. Run `/plan-generate`.
3. Open the website — the week should now show a lunch and dinner for every
   day, with "Leftovers: …" subtitles where the plan reuses last night's
   dinner.
4. Click a meal row to expand it — ingredients, a short recipe, and (for
   frozen-meat dinners) a defrost note.
5. Switch to the **Grocery List** tab — it's the week's ingredients minus
   what's already in your fridge. Check a few boxes; refresh the page — the
   checked state persists (it's saved to the backend).
6. Leave the bot running overnight — at `DEFROST_CHECK_TIME` it'll post a
   defrost reminder for tomorrow's dinner if one needs it; at
   `GROCERY_DAY`/`GROCERY_TIME` it'll generate next week's plan and post the
   grocery list.

---

## 7. Deploying for the demo

A simple, free-tier-friendly setup for a hackathon:

**Backend + bot (Railway, Render, or Fly.io — anything that runs a
long-lived Node process):**

1. Push this repo to GitHub (step 1).
2. Create two services from the same repo, one per folder:
   - Service A: root directory `backend`, build `npm install`, start
     `npm start`. Set the same env vars as your local `backend/.env`
     (update `CORS_ORIGIN` to your deployed frontend URL).
   - Service B: root directory `bot`, build `npm install`, start
     `npm start`. Set the same env vars as your local `bot/.env`, with
     `API_BASE_URL` pointing at Service A's public URL and `WEBSITE_URL`
     pointing at your deployed frontend.
3. After Service A deploys, run `npm run deploy-commands` once from Service
   B's shell (or locally with `DISCORD_GUILD_ID` unset) to register global
   commands.

**Frontend (Vercel is the easiest fit for Next.js):**

1. Import the GitHub repo in Vercel, set the project root to `frontend`.
2. Add env var `NEXT_PUBLIC_API_URL` = Service A's public URL.
3. Deploy. Update `CORS_ORIGIN` on the backend to match the resulting
   Vercel URL and redeploy the backend.

---

## Project structure

```
meal-planner/
├── backend/
│   ├── server.js            Express app + route mounting
│   ├── db.js                SQLite connection, runs schema.sql on boot
│   ├── schema.sql            Table definitions
│   ├── services/
│   │   ├── aiService.js      Claude calls: generate plan, parse messages
│   │   └── planService.js    Week math, plan persistence, grocery-list math
│   └── routes/
│       ├── fridge.js
│       ├── groceries.js
│       ├── cravings.js
│       ├── plan.js
│       ├── notifications.js  Polled by the bot's defrost cron job
│       └── parse.js          Free-text Discord messages land here
├── bot/
│   ├── index.js              Discord client, slash + free-text handling
│   ├── commands.js           Slash command implementations
│   ├── deploy-commands.js    One-off script to register slash commands
│   ├── notifications.js      node-cron jobs: defrost + weekly planning
│   └── api.js                Fetch wrapper for the backend
└── frontend/
    ├── app/
    │   ├── page.js            Main page: week nav, tabs, day cards
    │   ├── layout.js
    │   └── globals.css
    ├── components/
    │   ├── WeekHeader.js
    │   ├── Tabs.js
    │   ├── DayCard.js
    │   ├── MealRow.js
    │   └── GroceryList.js
    └── lib/api.js
```

## Notes & known limitations (good "future work" slide material)

- **Single household, not multi-user.** Fridge/cravings/groceries are global
  tables, not scoped per Discord user — matches "solo weekly planner," but
  would need a `user_id` column to support a shared house with separate
  preferences.
- **Ingredient matching is name-based.** The grocery list subtracts fridge
  stock by matching ingredient names as text (case-insensitive). "chicken
  thighs" and "chicken thigh" won't match each other — worth normalizing
  names (or asking Claude to normalize) if you have time.
- **Everything routes through the backend.** The bot never talks to Claude
  directly, so your API key only lives in one place (`backend/.env`).
- **SQLite file lives on the backend's disk.** Fine for a hackathon; for
  anything longer-lived, swap `better-sqlite3` for a hosted Postgres and the
  code changes are isolated to `db.js` and the `db.prepare(...)` calls.
