import os
import discord
from discord.ext import commands
from dotenv import load_dotenv
import google.generativeai as genai
import json

load_dotenv()

genai.configure(api_key=os.getenv("GEMINI_API_KEY"))
model = genai.GenerativeModel("gemini-3.6-flash")

intents = discord.Intents.default()
intents.message_content = True

bot = commands.Bot(command_prefix="!", intents=intents)

# Simple in-memory storage: {user_id: [list of items]}
fridge_data = {}


@bot.event
async def on_ready():
    print(f"Logged in as {bot.user}")


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

    # Ask Gemini to extract items and estimate expiry dates
    prompt = """
    Look at this grocery receipt image. Extract every food item you can identify.
    For each item, estimate how many days until it typically expires (use your knowledge
    of average shelf life — e.g. milk ~7 days, bread ~5 days, canned goods ~365 days).

    Respond ONLY with valid JSON in this exact format, no other text:
    [
      {"item": "milk", "days_until_expiry": 7},
      {"item": "bread", "days_until_expiry": 5}
    ]
    """

    response = model.generate_content([
        prompt,
        {"mime_type": attachment.content_type, "data": image_bytes}
    ])

    # Clean up the response in case Gemini wraps it in ```json fences
    raw_text = response.text.strip()
    raw_text = raw_text.replace("```json", "").replace("```", "").strip()

    try:
        items = json.loads(raw_text)
    except json.JSONDecodeError:
        await ctx.send("Sorry, I had trouble reading that receipt. Try a clearer photo.")
        return

    # Save items to this user's fridge
    fridge_data[ctx.author.id] = items

    item_list = "\n".join([f"- {i['item']} (expires in ~{i['days_until_expiry']} days)" for i in items])
    await ctx.send(f"Found these items:\n{item_list}\n\nSaved to your fridge! Try !expiring or !recipe next.")


@bot.command()
async def expiring(ctx):
    items = fridge_data.get(ctx.author.id)
    if not items:
        await ctx.send("Your fridge is empty! Upload a receipt with !receipt first.")
        return

    sorted_items = sorted(items, key=lambda i: i["days_until_expiry"])
    item_list = "\n".join([f"- {i['item']}: ~{i['days_until_expiry']} days left" for i in sorted_items])
    await ctx.send(f"Here's what's expiring soonest:\n{item_list}")


@bot.command()
async def recipe(ctx):
    items = fridge_data.get(ctx.author.id)
    if not items:
        await ctx.send("Your fridge is empty! Upload a receipt with !receipt first.")
        return

    await ctx.send("Thinking of a recipe... 👨‍🍳")

    item_names = ", ".join([i["item"] for i in items])
    prompt = f"""
    I have these ingredients: {item_names}.
    Suggest one simple recipe that uses as many of these as possible,
    prioritizing ingredients that expire soonest.
    Keep it short: a title, a short ingredient list, and 3-5 numbered steps.
    """

    response = model.generate_content(prompt)
    await ctx.send(response.text)


bot.run(os.getenv("DISCORD_TOKEN"))