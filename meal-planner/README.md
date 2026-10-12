# Lista Spesa & Menù

A small Android app for two people to plan the week's dinners and share one shopping list.
Both phones stay in sync through a tiny server on your own VPS (`cookingbyamina.com`).

```
meal-planner/
  android/   Kotlin + Jetpack Compose app (the launcher icon is your artwork)
  server/    ~200 lines of Node, no dependencies, one JSON file of data
```

## What's in the app

Three tabs, as in the mockup:

- **Week**: this week's dishes. Tap the circle when cooked. Typing in "Add a dish…" suggests dishes you've cooked
  before, with how many times (`3×`). "Of the week" holds little notes like *Freezer: lasagna*.
- **Shopping**: add items, tick them into the cart, tap an item to add a note (*"NO MELE WE GOT SO MANY"*).
  "Often:" chips re-add things you buy repeatedly. When your partner has the Shopping tab open you see
  **"Ziv is shopping"** at the top.
- **Past weeks**: cooked dishes by week. **Start week of …** opens the sheet where you pick which
  not-cooked dishes and still-to-buy items carry over.

Tap any dish / item / note to edit or delete it. Works offline; edits sync when the phone is back online.

## 1. Put the server on your VPS

You need Node 18+ (`node -v`; if missing: `curl -fsSL https://deb.nodesource.com/setup_22.x | bash - && apt-get install -y nodejs`)
and the domain already pointing at the VPS.

```bash
git clone <this repo> && cd <repo>/meal-planner/server
sudo ./deploy/install.sh          # installs a systemd service, prints your household key
```

Then expose it over HTTPS under `/lista`. With Caddy, **add** the `handle_path /lista/*` block from
`deploy/Caddyfile` inside your existing site block (don't replace the file), then
`sudo caddy validate --config /etc/caddy/Caddyfile && sudo systemctl reload caddy`.
With nginx, proxy `/lista/` to `http://127.0.0.1:3000/` with `proxy_read_timeout 60s; proxy_buffering off;`.

Check it: `curl https://cookingbyamina.com/lista/api/health` → `{"ok":true}`.

Your data is one file, `/var/lib/lista/data.json`. Copy it now and then and you have a backup.

## 2. Get the app on both phones

The APK is built by GitHub Actions: open the repo's **Actions** tab → *Meal planner* → latest run →
download the **lista-spesa-apk** artifact, unzip, send `app-debug.apk` to both phones and open it
(Android will ask to allow installing from that source).

Or build it yourself: open `meal-planner/android` in Android Studio and press Run, or `./gradlew assembleDebug`.

## 3. First launch (on each phone)

Enter your name, the server (`https://cookingbyamina.com/lista`, pre-filled) and the household key from step 1.
Use the **same key on both phones**. That's it; the pill at the top says **Shared** when you're connected.

To use a different address, type it in the Server field (or change `DEFAULT_SERVER` in
`android/app/build.gradle.kts` before building).

## How the sync works

Every dish, item and note is a small record with a timestamp. The phone saves edits locally first, then
sends them to the server, which keeps the newest version of each record and tells the other phone.
While the app is open the phone keeps a request waiting on the server, so a change shows up on the
other phone in about a second. Deletes are kept as "deleted" markers so they sync too. Auth is one shared
secret key; keep the server behind HTTPS.

Server tests: `cd server && node test.js`.
