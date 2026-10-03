# Kautilya: build, deploy, rebuild

> Presenting at SIH? Start with **DEMO.md** (setup tiers, pre-demo warm-up, 5-minute script, what is real vs demo).

Sign-up: scan the UPI QR on your own screen (GPay / Amazon Pay / PhonePe "My QR") → app + bank inferred from the UPI handle → confirm profile → enter the ₹1 verification code (mock) → account created.
Seller: photo → **AI Studio** (background removed by a local model, light fixed, white 1200×1200) → speak in a regional language (local speech-to-text) or type → bilingual SEO listing + explainable price (live market + material + labour + season) → list on app / Amazon / Flipkart / GeM / ONDC.
Buyer (same login): Shop → item → order with address → pay (mock) into **escrow** → seller ships → buyer confirms (or auto-release after 7 days) → seller is paid. Notifications (🔔) tell each side what changed. Marketplace orders flow into Orders and Earnings.

```
app/  lib/  components/   Expo app (Expo Router, React Query, Expo DOM chart)
server/                   Node API (local U2-Net / Whisper / Qwen models with built-in fallbacks, price scraper)
.claude/skills/           expo-animation, expo-data-fetching, expo-dom, expo-native-ui
```

## 0. Accounts (one time)
| Need | Where | Used for |
|---|---|---|
| Expo account | expo.dev | builds, OTA updates |
| Render account | render.com | hosting the API |
| Neon or Supabase | neon.tech / supabase.com | Postgres (optional for local demos) |

**No API keys of any kind are needed (no Anthropic, remove.bg, Sarvam or Razorpay).** Background removal, speech-to-text and the listing writer run on open models stored on your own server (section 1b); price suggestion is built in; payments and bank verification are mocked.

## 1. Run the backend locally
Same on Windows PowerShell, macOS and Linux:
```
cd server
npm install
npm run demo                  # http://localhost:3000 (demo login + mock marketplaces on, throw-away JWT secret)
curl.exe localhost:3000/health   # Windows PowerShell. macOS/Linux: curl. Expect {"ok":true,"mock":true,"demo":true,"ai":{...}}
npm test                      # 40+ tests, no network needed
```
Settings go in `server/.env` (copy `server/.env.example`; loaded automatically, real environment variables win). To run without demo mode, put a fixed secret in that file and use `npm start`. Generate one on any OS with:
```
node -e "console.log(require('crypto').randomBytes(48).toString('base64'))"
```
(Do not use `JWT_SECRET=$(openssl ...) npm start` in PowerShell: that is bash-only.)

`package.json` lists the AI packages (`@huggingface/transformers`, `onnxruntime-node`, `ffmpeg-static`) as optional dependencies. If `npm ci` complains that the lockfile is out of date, run `npm install` once to refresh `server/package-lock.json`. If those optional packages fail to install on your platform, the server still starts and uses the built-in fallbacks.

Sign-up in mock mode returns the ₹1 "bank credit" code to the app so you can finish onboarding. That only happens when `NODE_ENV` is not `production`.

## 1b. Local AI models (one-time download, recommended)
`npm install` does not download model weights. Run this once on the machine that hosts the API (needs internet only for this step):
```
cd server
npm run models                  # everything (~1.4 GB)
npm run models -- bg            # just background removal (~5 MB)
npm run models -- bg whisper    # + speech-to-text (~250 MB)
```
| Model | Used for | Size | RAM while running | If not downloaded |
|---|---|---|---|---|
| U2-Net `u2netp` | photo background removal | ~5 MB | ~200 MB | border-colour flood fill |
| Whisper small | voice → regional text + English | ~250 MB | ~1 GB | labelled DEMO transcript |
| Qwen2.5-1.5B-Instruct | listing title / description / tags | ~1.1 GB | ~2 GB | keyword/template writer |

On Render set Build to `npm install && npm run models` (or `-- bg` on the free 512 MB plan; Whisper and Qwen need a larger instance). Check what is active with `curl localhost:3000/health` (the `ai` field: `background`, `speech`, `writer`; the logged-in app also gets it from `GET /ai/capabilities`). The server never calls the network for AI at runtime. The download needs no account: it fetches public files from github.com and huggingface.co. Settings for model names, folder and timeouts are at the bottom of `server/.env.example`.

**Honest status:** the model plumbing is covered by `npm test` using stand-in models, but the real weights have not been run by the author of this guide. After your first `npm run models`, confirm `/health` shows `u2net` / `whisper` (and `local-llm` if you downloaded it), then try one photo and one voice clip before relying on it.



## 2. Run the app locally
```
npm install
cp .env.example .env        # EXPO_PUBLIC_API_URL=http://<your-laptop-LAN-IP>:3000 (phone and laptop on same Wi-Fi)
npx expo install --fix      # aligns versions with your Expo SDK
npx expo start              # scan the QR with Expo Go
```
To test sign-in, show any UPI QR (e.g. from your own GPay/PhonePe "My QR") to a second device or screen.

## 3. Deploy the backend (Render)
1. Push this repo to GitHub.
2. Render → New → Web Service → pick the repo. Root Directory `server`, Build `npm install && npm run models` (see 1b for lighter options), Start `npm start`.
3. Environment: `PUBLIC_BASE_URL` (your Render URL), `JWT_SECRET` (32+ random chars, required), `DATABASE_URL` (Postgres from Neon or Supabase), `NODE_ENV=production`. Optional AI settings (`LOCAL_MODELS`, `WHISPER_MODEL`, `LLM_MODEL`, `LLM_TIMEOUT_MS`) are listed in `server/.env.example`. Models downloaded during the build live in `server/models/` and are loaded from disk at runtime; the free 512 MB plan can only run the background-removal model. With mocks still on, production start is refused unless `ALLOW_MOCK_IN_PRODUCTION=1` (demo deployments only; sign-up then cannot deliver the bank code, see SECURITY.md).
4. Check: `curl https://YOUR-SERVER.onrender.com/health` → ok (and the `ai` field shows which models loaded), and `/items` → 401.
5. Tables are created automatically on first start when `DATABASE_URL` is set. **Without it the server falls back to an in-memory store that resets on every restart** (fine for local demos only). Set `DATABASE_SSL=off` only for a local Postgres without TLS.

## 4. Build the app (EAS)
```
npm i -g eas-cli && eas login
eas init                                   # writes the project ID into app.json
# edit eas.json: replace both YOUR-SERVER.onrender.com values with your Render URL
eas build --profile preview --platform android      # installable APK, share the link for testing
eas build --profile production --platform all       # store builds
```

## 5. Publish
- Android: `eas submit -p android` (Google Play developer account, one-time $25).
- iOS: `eas submit -p ios` (Apple Developer Program, $99/year).

## 6. Rebuild and update later
| Change | Do this |
|---|---|
| JS/UI/text only | `eas update --branch production --message "what changed"` (over the air, no store review) |
| Added/upgraded a native package, changed `app.json` plugins/permissions, SDK upgrade | `npm install` → `eas build --profile production --platform all` → `eas submit` |
| Backend change | `git push`; Render redeploys automatically |
| New API URL | change `eas.json` env, then rebuild (the URL is baked into the build) |
| Dependency drift | `npx expo install --fix`, then `npx expo-doctor` |

## 7. Using the Expo skills
`.claude/skills/` holds the four skills so Claude Code picks them up automatically in this repo. To use them elsewhere, copy the folders to `~/.claude/skills/`. In claude.ai, upload each folder as a zip under Settings → Capabilities → Skills.

## Artisans' own marketplace keys (Profile > Marketplace keys)
Each seller can connect their **own** Amazon (SP-API) or Flipkart seller account inside the app. The keys are sent once over HTTPS, encrypted on the server (AES-256-GCM, `server/vault.js`) and never returned to the app (it only learns "connected" and the non-secret fields). Listings and order pull-back for that seller then use their keys; sellers without keys fall back to the platform account / mock as before.
- Set **`CRED_KEY`** on Render (32+ random characters, same generator as `JWT_SECRET`). If unset, `JWT_SECRET` is used. Changing either one makes saved keys unreadable, and sellers must enter them again. Keep it stable and private.
- Flipkart links are accepted only on `flipkart.net` / `flipkart.com` over https (so the server cannot be pointed at other sites), and redirects are refused.
- Amazon "Publish live" is off by default (listings are only validated). The seller switches it on when ready.
- A seller's keys can only create orders for that seller's own items.
- Still true: neither adapter has run against the live marketplaces. Approved seller accounts are required, and the Flipkart payload is a placeholder.

## Marketplace sync (Amazon / Flipkart)
Listing an item with the `amazon`/`flipkart` channels queues a job per channel (`server/sync.js`). A worker runs every 15 s with retries (exponential backoff, 5 attempts). Job states shown in the Items tab: queued, setup pending, validated, live, failed.
Model: products are listed under **one platform seller account per marketplace** (SKU `SS-<itemId>`). Photos are fetched by the marketplace from `PUBLIC_BASE_URL/media/<id>`.
- **Amazon**: set the four `AMAZON_*` vars in `server/.env.example`. By default calls use `mode=VALIDATION_PREVIEW` (validates, creates nothing); set `AMAZON_LIVE=1` to publish. Required attributes differ per product type: pull your category's schema from the Product Type Definitions API and extend `attributes` in `sync.js`.
- **Flipkart**: set `FLIPKART_APP_ID`, `FLIPKART_APP_SECRET`, `FLIPKART_LISTING_URL`. The token flow follows Flipkart's docs; **the listing payload is a placeholder** because Flipkart's schema is per category. Replace it with the shape from your approved app.
- Without credentials jobs park as "setup pending" and are retried every 10 min, so they publish automatically once you add keys.
- Neither adapter has been run against the live marketplaces. `npm test` in `server/` exercises both against fake servers, which checks our request shapes, not Amazon's or Flipkart's acceptance.

## Tests and checks
- `cd server && npm test`: store contract (memory and Postgres via pg-mem), sync adapters, pricing, photo studio, voice and listing-writer plumbing (with stand-in models, plus a real ffmpeg audio-decode check that is skipped if ffmpeg is missing).
- App: `npx tsc --noEmit`, `npx expo export --platform android` (and `ios`), `npx expo-doctor`. Run `npx expo install --fix` once on a machine with internet.

## Not built yet (be honest with users and judges)
- **Real money and real bank verification.** Payments, escrow payouts, refunds and the ₹1 penny-drop are MOCKS (`server/payments.js`). A UPI QR contains only the UPI ID and name; the app/bank shown is inferred from the handle. No account number can be read from GPay/Amazon Pay, and the app never claims to.
- Dispute resolution (a reported problem freezes the payment; nobody can resolve it yet), push notifications (in-app polling only), account deletion.
- Marketplace order pull-back is verified only against fakes (Amazon Orders API shape is from the docs; Flipkart is a placeholder).
- The price scraper is best-effort: sites change markup, block bots and may forbid scraping in their terms. It falls back to typical ranges and says so.
- Voice, background removal and the AI listing writer run on local open models (Whisper, U2-Net, Qwen). They are not perfect: Whisper is weaker for rarer languages and noisy audio (Odia is auto-detected), U2-Net can mis-cut very thin or transparent objects, and a small language model can invent details, so every generated field stays editable before publishing. Without the downloaded models they fall back to a labelled demo transcript, a simple cut-out and a template writer.
- GST invoicing; image storage (photos are stored inline in the database; move to S3/R2 before scale).
- See SECURITY.md for the security model and its limits.
