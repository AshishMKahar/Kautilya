# Security notes

Nothing is "perfectly secure". This is what is enforced in code, what is tested, and what is still open.

## Enforced and tested (`cd server && npm test`)
| Area | Control |
|---|---|
| Account takeover | Anyone could sign up as any UPI ID. Now: QR scan → ₹1 verification code (hashed, single use, 10 min, 5 tries then lock, 30 s resend throttle). **The bank credit is a mock**, see below. |
| Sessions | 15-minute JWT (HS256 pinned, issuer + audience checked) + rotating refresh token stored hashed. Reusing an old refresh token revokes the whole family. Logout revokes all sessions. |
| Secrets | Server refuses to start if `JWT_SECRET` is < 32 chars or a placeholder. Tokens in the phone keychain, this-device-only, unlocked-only. Release builds refuse a non-HTTPS API URL. |
| Money | Prices computed server-side; exact 2-decimal math. Every order state change is one atomic compare-and-set, so concurrent confirms / double payments / double refunds cannot happen (tested). Stock reserved atomically (no overselling). Unpaid orders expire; shipped orders auto-release after 7 days unless disputed. |
| Access control | Orders are visible only to buyer and seller (others get 404, no existence leak). Buyer and seller never see each other's UPI ID, only the display name. Delivery address is shown to the seller only after payment. |
| Input | Strict schemas on every route (unknown fields rejected, max lengths, enums), control/bidi characters stripped. Photos are accepted only if their bytes are JPEG/PNG/WebP ≤ 4 MB; SVG/HTML rejected; served with `nosniff` and a sandbox CSP. |
| Abuse | Per-IP rate limits (global, auth, order, listing); small body limit; scraper contacts only two fixed hosts (no user-supplied URLs), has timeouts and size caps. |
| Errors | Generic messages; no stack traces, SQL or secrets in responses or logs. Audit table for logins, failures, refresh reuse, order actions. |
| Transport / DB | Helmet (HSTS, CSP, no-referrer), `no-store` on API responses, Postgres TLS certificate verification ON (was off), parameterised SQL only, statement timeout. |
| Privacy | Microphone permission and `expo-audio` plugin removed, Android backup disabled. |

## Open items (please read)
1. **Mock bank verification and payments.** In mock mode the verification code is returned to the app, so it proves the flow, not ownership. The server therefore refuses to start in `NODE_ENV=production` with mocks on (override: `ALLOW_MOCK_IN_PRODUCTION=1`, demo only). Replace `server/payments.js` + the penny-drop with a real provider before real users.
2. The Postgres store was written without a Postgres available here. The memory store and all logic are tested; the SQL is covered by `npm test` only when `pg-mem` is installed (it is in devDependencies) and should be run once against a real database.
3. The Expo app was syntax-checked, not type-checked or run on a device (no Expo install was possible here). Run `npx tsc --noEmit` and `npx expo-doctor`.
4. Rate limiting is in-memory per instance. With more than one server instance, move it to Redis.
5. No certificate pinning (not possible in Expo Go; add in a custom dev build for production), no root/jailbreak detection, no biometric lock.
6. Dependency risk: run `npm audit` and keep `package-lock.json` committed. Get an independent penetration test before handling real money.


## Kautilya additions
- `POST /auth/demo` exists only when `DEMO_MODE=1` and the server is not in production (or `ALLOW_MOCK_IN_PRODUCTION=1`). Otherwise it returns 404. It signs in as one fixed sample account; never enable it on a deployment holding real users.
- `/ai/enhance` and `/ai/voice` are authenticated and rate-limited (15/min). Images are sniffed from bytes (JPEG/PNG/WebP, 4 MB); audio is sniffed (m4a/wav/ogg/webm/mp3, 4 MB). Neither is stored: the enhanced photo is returned to the app and only saved if the artisan lists the item.
- AI runs on open-source models stored on the server (U2-Net, Whisper, Qwen; downloaded once at build time with `npm run models`). No photo, voice or text is sent to any third-party AI or image service, and no AI keys exist to leak. The only outbound requests at runtime are the price lookups on Amazon.in / Flipkart (disable with `PRICE_SCRAPE=off`). The model download step contacts github.com and huggingface.co once.
- The artisan's words are passed to the local model as quoted data with an instruction to treat them as content; output is validated, length-limited, falls back to the template writer on anything unusable, and is shown in editable fields before anything is published. Small models can still make mistakes or invent details, so the artisan reviews every field.
