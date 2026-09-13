import os
from datetime import date, timedelta

import discord
from discord.ext import commands
from dotenv import load_dotenv
import google.generativeai as genai
import requests
import json

load_dotenv()

genai.configure(api_key=os.getenv("GEMINI_API_KEY"))
model = genai.GenerativeModel(os.getenv("GEMINI_MODEL", "gemini-3.6-flash"))

# Base URL of the meal-planner backend. Scanned groceries are POSTed here so
# they land in the same SQLite database the website and meal planner read.
API_BASE_URL = os.getenv("API_BASE_URL", "http://localhost:4000")

intents = discord.Intents.default()
intents.message_content = True

bot = commands.Bot(command_prefix="!", intents=intents)


def _days_to_date(days):
    """Convert a 'days until expiry' integer into an absolute YYYY-MM-DD string."""
    try:
        d = int(days)
    except (TypeError, ValueError):
        return None
    return (date.today() + timedelta(days=d)).isoformat()


def add_item_to_backend(name, quantity=1, unit="", expires_at=None):
    """POST a single item to the backend fridge. Returns True on success."""
    resp = requests.post(
        f"{API_BASE_URL}/api/fridge",
        json={"name": name, "quantity": quantity, "unit": unit, "expires_at": expires_at},
        timeout=15,
    )
    resp.raise_for_status()
    return True


def get_backend_fridge():
    """Fetch active fridge items from the backend."""
    resp = requests.get(f"{API_BASE_URL}/api/fridge", timeout=15)
    resp.raise_for_status()
    return resp.json().get("items", [])


@bot.event
async def on_ready():
    print(f"Logged in as {bot.user} (feeding fridge into {API_BASE_URL})")


@bot.command()
async def ping(ctx):
    await ctx.send("pong! bot is alive 🏓")


@bot.command()
async def receipt(ctx):
    # Check that an image was attached
    if not ctx.message.attachments:
        await ctx.send("Please attach a photo of your receipt when using !receipt")
        return

    attachment = ctx.message.attachments[0]

    # Make sure it's actually an image
    if not attachment.content_type or not attachment.content_type.startswith("image"):
        await ctx.send("That doesn't look like an image. Please attach a photo.")
        return

    await ctx.send("Reading your receipt... 🧾")

    # Download the image bytes
    image_bytes = await attachment.read()

    # Ask Gemini to extract items, quantities/units, and estimate expiry.
    prompt = """
    Look at this grocery receipt image. Extract every food item you can identify.
    For each item, give a quantity and unit if visible (default quantity 1, unit ""),
    and estimate how many days until it typically expires (use average shelf life —
    e.g. milk ~7 days, bread ~5 days, fresh produce ~5 days, canned goods ~365 days).

    Respond ONLY with valid JSON in this exact format, no other text:
    [
      {"item": "milk", "quantity": 1, "unit": "carton", "days_until_expiry": 7},
      {"item": "bread", "quantity": 1, "unit": "loaf", "days_until_expiry": 5}
    ]
    """

    response = model.generate_content([
        prompt,
        {"mime_type": attachment.content_type, "data": image_bytes},
    ])

    # Clean up the response in case Gemini wraps it in ```json fences
    raw_text = response.text.strip().replace("```json", "").replace("```", "").strip()

    try:
        items = json.loads(raw_text)
    except json.JSONDecodeError:
        await ctx.send("Sorry, I had trouble reading that receipt. Try a clearer photo.")
        return

    # Push each item into the shared backend fridge so the website and meal
    # planner see it immediately.
    saved = []
    failed = []
    for i in items:
        name = i.get("item")
        if not name:
            continue
        expires_at = _days_to_date(i.get("days_until_expiry"))
        try:
            add_item_to_backend(
                name=name,
                quantity=i.get("quantity", 1) or 1,
                unit=i.get("unit", "") or "",
                expires_at=expires_at,
            )
            saved.append((name, i.get("days_until_expiry")))
        except Exception as e:  # noqa: BLE001
            print(f"Failed to save {name}: {e}")
            failed.append(name)

    if not saved:
        await ctx.send(
            "I read the receipt but couldn't save anything to the fridge — "
            f"is the backend running at {API_BASE_URL}?"
        )
        return

    item_list = "\n".join(
        [f"- {name} (expires in ~{days} days)" for name, days in saved]
    )
    msg = f"Added these to your fridge:\n{item_list}\n\nThey're now in the meal planner and website. Try !expiring or !recipe next."
    if failed:
        msg += f"\n\n(Couldn't save: {', '.join(failed)})"
    await ctx.send(msg)


@bot.command()
async def expiring(ctx):
    try:
        items = get_backend_fridge()
    except Exception:  # noqa: BLE001
        await ctx.send(f"Couldn't reach the backend at {API_BASE_URL}.")
        return

    if not items:
        await ctx.send("Your fridge is empty! Upload a receipt with !receipt first.")
        return

    # Items with an expiry date come first, soonest first; undated items last.
    def sort_key(it):
        return (it.get("expires_at") is None, it.get("expires_at") or "9999-12-31")

    sorted_items = sorted(items, key=sort_key)
    lines = []
    for it in sorted_items:
        exp = it.get("expires_at")
        lines.append(f"- {it['name']}: {'expires ' + exp if exp else 'no expiry set'}")
    await ctx.send("Here's what's expiring soonest:\n" + "\n".join(lines))


@bot.command()
async def recipe(ctx):
    try:
        items = get_backend_fridge()
    except Exception:  # noqa: BLE001
        await ctx.send(f"Couldn't reach the backend at {API_BASE_URL}.")
        return

    if not items:
        await ctx.send("Your fridge is empty! Upload a receipt with !receipt first.")
        return

    await ctx.send("Thinking of a recipe... 👨‍🍳")

    item_names = ", ".join([i["name"] for i in items])
    prompt = f"""
    I have these ingredients: {item_names}.
    Suggest one simple recipe that uses as many of these as possible,
    prioritizing ingredients that expire soonest.
    Keep it short: a title, a short ingredient list, and 3-5 numbered steps.
    """

    response = model.generate_content(prompt)
    await ctx.send(response.text)


bot.run(os.getenv("DISCORD_TOKEN"))
