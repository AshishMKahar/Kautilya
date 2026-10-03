# Kautilya: SIH demo guide

No API keys anywhere. The AI parts run on open models stored on your own laptop/server, and every one of them has a built-in fallback, so the demo never breaks if a model is missing.

## 1. Setup (about 5 minutes + one download)

**a) Backend** (same commands on Windows PowerShell, macOS and Linux)
```
cd server
npm install
npm run models -- bg whisper        # one-time download (needs internet). Pick your tier below
npm run demo                        # http://localhost:3000, demo login + fake marketplaces ON, secret generated for you
```
Leave that window running and open a second terminal:
```
curl.exe localhost:3000/health      # Windows PowerShell: use curl.exe (plain "curl" is a different command there). macOS/Linux: curl
```
`/health` tells you exactly what will happen on stage:
```
{"ok":true,"mock":true,"demo":true,"ai":{"background":"u2net","speech":"whisper","writer":"built-in"}}
```
`u2net` / `whisper` / `local-llm` = real model active. `built-in` / `demo` = fallback active (still works, see the table in section 4).

Want your own settings (fixed secret, smaller models, `PRICE_SCRAPE=off`)? Copy `server/.env.example` to `server/.env` (`copy .env.example .env` on Windows, `cp` elsewhere) and edit it; the server reads that file automatically, and real environment variables override it. Do not use bash-style `VAR=value npm start` on Windows.

**b) Pick a tier** (`npm run models -- <names>`)
| Tier | Command | Download | Laptop RAM | What you get |
|---|---|---|---|---|
| Quick | *(nothing)* | 0 | any | Simple cut-out, DEMO voice transcript, template writer. Fine for a UI walkthrough |
| **Recommended** | `npm run models -- bg whisper` | ~255 MB | 2 GB+ | Real background removal on any photo + real voice-to-text and English translation. The writer stays on the fast template |
| Full | `npm run models` | ~1.4 GB | 4 GB+ | Adds the local AI listing writer (slow on CPU, 20-60 s per listing) |

**c) Phone app** (a new terminal, in the project root, not in `server`)
```
npm install
npx expo install --fix
copy .env.example .env              # macOS/Linux: cp .env.example .env
```
Open `.env` in a text editor and set `EXPO_PUBLIC_API_URL=http://<your-laptop-LAN-IP>:3000`. Find the IP with `ipconfig` on Windows (the "IPv4 Address" of your Wi-Fi) or `ifconfig` / `ip a` elsewhere. Do not use `localhost`: the phone would look at itself. Then:
```
npx expo start                      # scan the QR with Expo Go (phone + laptop on one Wi-Fi)
```
On the sign-in screen tap **🎬 Try demo**: no UPI QR needed. You land in "Lakshmi Devi", a sample weaver with 2 listed products, 3 completed GeM/ONDC orders (Earnings tab is not empty) and 2 other sellers in Shop.

## 2. Before you go on stage (2 minutes)
The first call to each model loads it into memory and is slow; later calls are fast. So do one dry run:
1. Sell tab -> take/choose a photo -> wait for the Studio result (loads U2-Net).
2. Tap **Tap & speak**, say one sentence in Hindi, stop (loads Whisper, ~10-30 s the first time).
3. Tap **Make listing & price** once (loads the writer and the price scraper).
4. Reset the form. Keep the server running; never restart it before presenting.

Also: put the laptop on charge, disable sleep, and have a hotspot ready. The price lookup needs internet; without it prices fall back to typical ranges (set `PRICE_SCRAPE=off` to make that deliberate and instant).

## 3. 5-minute story (problem statement -> feature)
| Step | Tap | What to say | What you should see |
|---|---|---|---|
| 1. Image Enhancer & Studio | Sell tab -> photograph anything on a plain surface, then try one on a **busy** background | Cluttered phone photo becomes a white-background 1200x1200 marketplace shot; lighting is corrected; toggle Studio/Original | Badges: "Background removed" + "Lighting corrected". With `u2net` active the busy-background photo is cut out too; on the fallback it says "Busy background kept" |
| 2. Multilingual Auto-Cataloger | Pick Tamil/Marathi/Hindi, tap **Tap & speak**, say what you made (e.g. "हाथ से बुनी रेशमी साड़ी, पंद्रह दिन लगे") | Voice in a regional language -> transcript + English translation, on our own server, no cloud AI | Your own words in the box, and an English line below. If you see the orange **DEMO transcript** label, Whisper is not active: say so, or use the sample voice note |
| 3. Dynamic Pricing Assistant | **Make listing & price** | Live Amazon/Flipkart median, adjusted for detail in the photo, festive season, and a cost floor (material + fair wage + overhead). Type a price below cost to show the warning | Badge "Built-in listing writer" or "AI-written listing (local model)", editable text, price breakdown |
| 4. B2B / government channels | Choose **GeM** and **ONDC** under "Sell on", publish | Reaches institutional buyers. Items tab -> long-press a live channel to simulate a bulk order -> Orders -> Earnings | Order appears, Earnings updates |
| 5. Trust | Shop -> item -> order -> pay -> escrow -> ship -> confirm | Escrow protects both sides; auto-release after 7 days | Notifications (bell) on each side |
| 6. Low literacy | Whole UI is Hindi + English, large buttons, voice-first | | |

**If something goes wrong on stage:** microphone denied or Whisper slow -> tap **Use a sample voice note (demo)** (and say it is a sample). Listing slow -> type the description instead of speaking; the template writer answers instantly.

## 4. What is real vs demo (say this honestly if asked)
| Feature | With models downloaded (`npm run models`) | Without (works out of the box) |
|---|---|---|
| Photo Studio | U2-Net neural cut-out (any background), then white-balance from the background, exposure, 1200x1200 white canvas with shadow | Border-colour cut-out; best on plain backgrounds, keeps busy backgrounds and says so |
| Voice-to-text | Whisper transcribes the artisan's language and translates to English, on our server. Odia is auto-detected; accuracy is good for Hindi/Marathi/Bengali/Tamil, lower for rarer languages and noisy audio | **Demo transcript** (labelled in the app); it does not reflect what was said |
| Listing writer | Local Qwen model drafts English title, description and tags from any language; invalid output falls back automatically. Hindi text is used only if the model really wrote Devanagari | Built-in keyword/template writer |
| Pricing | Rule-based model: cost-plus floor + live market median (Amazon.in / Flipkart scrape, falls back to typical ranges) + photo detail score + season. Explainable, not a trained ML model | same |
| GeM / ONDC | Demo channels only: listings go "live" and fake bulk orders can be simulated. No real GeM/ONDC API is called | same |
| Payments / UPI verification | Mock (no money moves) | same |

Voice and writer speed depend on the server CPU (Whisper ~5-20 s per clip, Qwen 1.5B ~20-60 s per listing). For a lighter writer put `LLM_MODEL=onnx-community/Qwen2.5-0.5B-Instruct` in `server/.env` before `npm run models`.

## Troubleshooting
- PowerShell says `JWT_SECRET=... is not recognized` or `&&` is not a valid separator: those are bash tricks. Use the commands above (one per line) and `npm run demo`, which needs neither.
- Windows asks about the firewall the first time the server starts: click Allow on **Private networks**, otherwise the phone cannot connect.
- "Network request failed": the phone cannot reach `EXPO_PUBLIC_API_URL`. Use the laptop's LAN IP, same Wi-Fi, allow port 3000 in the firewall.
- No "Try demo" button: server not started with `DEMO_MODE=1`, or `.env` points at the wrong server.
- Studio shows "unavailable": `sharp` is not installed on the server (run `npm install` inside `server`).
- `/health` shows `"speech":"demo"` or `"writer":"built-in"`: that model is not downloaded. Run `npm run models -- <bg|whisper|llm>` inside `server`, restart the server, check `/health` again.
- Models downloaded but `/health` still shows the fallback: check you started the server from the `server` folder (models live in `server/models/`) or set `MODELS_DIR`; check the server log for a `model ...` error line.
- `npm run models` fails: it needs internet to github.com and huggingface.co once; behind a proxy, download on another network and copy the `server/models/` folder across.
- Voice says "Could not understand the recording": speak for at least a second, closer to the mic; ffmpeg must be available (installed automatically by `npm install` via `ffmpeg-static`, or set `FFMPEG_PATH`).
- Microphone prompt denied: use "Use a sample voice note (demo)".
