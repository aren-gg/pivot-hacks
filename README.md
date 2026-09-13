# Meal Planner + Discord Bot

A weekly meal-planning website paired with a Discord bot, powered by Google
Gemini. Tell the bot what you're craving, what's in your fridge, and what you
bought — it builds a week of lunches and dinners, shows it on the website,
tracks expiry, generates a grocery list with prices, reminds you to defrost
meat, and even gives hands-free cooking help by voice.

## Architecture

```
Discord  <--slash cmds, free text, receipt photos, voice-->  bot/        (discord.js)
                                                               |
                                                               | REST
                                                               v
                                                            backend/       (Express + SQLite + Gemini)
                                                               ^
                                                               | REST
                                                            frontend/      (Next.js website)
```

Only the **backend** touches the database and Gemini. The bot and website are
both thin clients of its REST API, so state stays consistent across all of them
(a receipt scanned in Discord shows up on the website instantly).

- **`backend/`** — Express API + SQLite. Owns all state (fridge, groceries,
  cravings, weekly plans, preferences) and all Gemini calls: generating plans,
  parsing free-text messages, reading receipt photos, and transcribing cooking
  voice clips.
- **`bot/`** — discord.js bot: slash commands, free-text mode, receipt-photo
  scanning, hands-free voice cooking help, and scheduled defrost / weekly-plan
  jobs.
- **`frontend/`** — Next.js site: week view, grocery list, fridge, and
  preferences tabs.

## Features

- **AI meal planning** — a week of lunches/dinners from your fridge, groceries,
  and cravings, reusing leftovers and prioritizing soon-to-expire items.
- **Personalization** — diet/lifestyle, budget per serving, cooking experience,
  max cook time, and currency all shape the plan.
- **Grocery list** — auto-computed (plan minus fridge) with realistic
  per-package prices and a total; add/remove your own items too.
- **Fridge** — inventory with expiry tracking; add/edit/delete on the website,
  or via Discord. Ticking a grocery item adds it to the fridge (and unticking
  removes it).
- **Receipt scanning** — post a receipt photo to Discord and Gemini extracts the
  items into your fridge with estimated expiry.
- **Hands-free cooking (voice)** — `/cook` has the bot listen in a voice
  channel; say the wake word **"kevin"** (e.g. "kevin, the sauce is too salty")
  and it replies with cooking help — no need to touch a screen.
- **Reminders** — nightly defrost reminders and a weekly auto-generated plan +
  grocery list.

## Prerequisites

- Node.js 18+ and npm
- A Discord account and a server you can add a bot to
- A Google Gemini API key — https://aistudio.google.com/apikey

## 1. Backend

```bash
cd backend
npm install
cp .env.example .env      # set GEMINI_API_KEY; GEMINI_MODEL defaults to gemini-3.6-flash
npm start                 # listens on :4000
curl http://localhost:4000/api/health   # {"ok":true}
```

## 2. Discord app

1. https://discord.com/developers/applications → **New Application**.
2. **Bot** → add a bot, **Reset Token** (this is `DISCORD_TOKEN`), and enable
   **Message Content Intent** (required for free-text and receipt photos).
3. **General Information** → copy the **Application ID** (`DISCORD_CLIENT_ID`).
4. **OAuth2 → URL Generator** → scopes `bot` + `applications.commands`;
   permissions: Send Messages, Read Message History, Embed Links, Connect,
   Speak. Open the URL and add the bot to your server.
5. Enable Developer Mode in Discord, then right-click your meal channel →
   **Copy Channel ID** (`MEAL_CHANNEL_ID`).

## 3. Bot

```bash
cd bot
npm install
cp .env.example .env      # DISCORD_TOKEN, DISCORD_CLIENT_ID, MEAL_CHANNEL_ID, API_BASE_URL
npm run deploy-commands   # register slash commands (re-run when commands change)
npm start
```

Optional env: `DISCORD_GUILD_ID` (instant command registration while
developing) and `COOK_WAKE_WORD` (defaults to `kevin`).

## 4. Frontend

```bash
cd frontend
npm install
cp .env.example .env.local   # NEXT_PUBLIC_API_URL=http://localhost:4000
npm run dev                  # http://localhost:3000
```

## Discord commands

Run `/help` in Discord for the full list. Highlights:

- **Planning:** `/plan-generate`, `/plan-today`, `/meal-swap` (re-make a meal
  from fridge stock), `/craving`
- **Fridge:** `/fridge-add`, `/fridge-remove`, `/fridge-list`, `/receipt`
- **Groceries:** `/grocery-list`, `/grocery-add`, `/grocery-bought`
- **Cooking (voice):** `/cook`, `/stop-cooking`
- **Preferences:** `/preferences`, `/preferences-show`

You can also type naturally in the meal channel ("bought 2 lbs chicken",
"what's in the fridge?") or drop a receipt photo.

## Deploying

- **Backend + bot:** any host that runs a long-lived Node process (Railway,
  Render, Fly.io). One service per folder; set env vars to match your local
  `.env` files (point the bot's `API_BASE_URL` at the deployed backend, and set
  the backend's `CORS_ORIGIN` to the deployed frontend URL). Run
  `npm run deploy-commands` once after deploy.
- **Frontend:** Vercel, project root `frontend/`, env
  `NEXT_PUBLIC_API_URL` = deployed backend URL.

## Project structure

```
meal-planner/
├── backend/
│   ├── server.js              Express app + route mounting
│   ├── db.js                  SQLite connection + schema/migrations
│   ├── schema.sql
│   ├── currencies.js
│   ├── services/
│   │   ├── aiService.js       Gemini: plans, message parsing, receipts, voice
│   │   └── planService.js     Week math, plans, grocery + fridge logic
│   └── routes/                fridge, groceries, cravings, plan, preferences,
│                              notifications, parse, receipt, voiceFeedback
├── bot/
│   ├── index.js               Discord client (slash, free text, images)
│   ├── commands.js            Slash command handlers
│   ├── voice.js               Voice-channel listening + wake word
│   ├── deploy-commands.js     Registers slash commands
│   ├── notifications.js       Cron: defrost + weekly planning
│   └── api.js                 Backend fetch wrapper
└── frontend/
    ├── app/                   page.js, layout.js, globals.css
    ├── components/            WeekHeader, Tabs, DayCard, MealRow,
    │                          GroceryList, Fridge, Preferences
    └── lib/api.js
```

## Notes & limitations

- **Single household.** Fridge/preferences are global, not per Discord user.
- **AI-estimated prices.** Grocery prices are realistic per-package estimates
  from Gemini, not live store data.
- **Voice wake word runs on the transcript.** Every utterance is transcribed to
  detect "kevin"; a local wake-word model would cut cost/latency.
- **SQLite on the backend's disk** — fine for a hackathon; swap `db.js` for a
  hosted Postgres for anything longer-lived.
```
