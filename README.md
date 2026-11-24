# thebasementpaintings.com

[![CI](https://github.com/futuredescriber/thebasementpaintings.com/actions/workflows/ci.yml/badge.svg)](https://github.com/futuredescriber/thebasementpaintings.com/actions/workflows/ci.yml)

Source code for **[thebasementpaintings.com](https://thebasementpaintings.com)** — the official website, persistent custom audio player, envelope-driven visualizers, and privacy-first listening analytics backend for **The Basement Paintings** (2020 Saskatchewan Music Awards Metal/Loud Artist of the Year; 2020 Western Canadian Music Award nominee; BreakOut West 2022 showcase).

> **Note on audio assets:** Full-length band audio MP3s (`audio/**/*.mp3`) are intentionally excluded from this public repository. Stream the catalog live at [thebasementpaintings.com](https://thebasementpaintings.com). Precomputed amplitude envelopes (`audio/envelopes.json`) are included so the visualizer and tests run cleanly out of the box.

## Architecture & Engineering Highlights

### Front-End & Custom Audio Player
- **Persistent cross-page playback:** Vanilla ES modules (`player.js`, `navigation.js`, `track-browser.js`) preserve track state and Media Session lock-screen controls across navigation with recovery logic for interrupted playback and media errors.
- **Precomputed envelope visualizers:** `audio/envelopes.json` stores half-second stereo RMS envelopes for all 25 tracks (`-60` to `-6 dB`), driving `visual-signal.js` and `atmosphere.js` with zero Web Audio API routing overhead and full `prefers-reduced-motion` / offscreen pause support.

### Privacy-First Listening Analytics (Netlify Functions + Netlify Blobs)
Located under `netlify/functions/` and `netlify/lib/` (see [docs/player-stats.md](docs/player-stats.md)):
- **Fail-closed authentication:** Admin endpoints (`/stats`, `/stats/data`, `/stats/export.csv`) stay completely disabled (`503`) unless both `STATS_PASSWORD_HASH` (salted `scrypt`) and `STATS_SESSION_SECRET` (40+ chars) are configured in environment variables.
- **Defense in depth:**
  - Constant-time password and HMAC verification (`scryptSync` + `timingSafeEqual`)
  - Signed `HttpOnly`, `Secure`, `SameSite=Strict` session cookies
  - Per-request cryptographic nonce CSP (`default-src 'none'; script-src 'nonce-...'`)
  - Same-origin CSRF checks, streaming request body byte caps, and per-IP/domain rate limiting (`30 req / 60s`)
  - CSV formula-injection neutralization on exports
- **Idempotent checkpoint ingestion:** Cumulative checkpoints stored in `@netlify/blobs` make duplicate/out-of-order client retries idempotent, honor Do Not Track / Global Privacy Control, and never retain IP addresses or user agents.

## Local Development & Tests

Requires Node 22+.

```bash
npm ci
npm test
npm run build
```

Test suites (`node --test tests/*.test.mjs`) cover auth/CSP/CSRF (`auth.test.mjs`), Media Session navigation (`media-session.test.mjs`), playback recovery (`player-recovery.test.mjs`), collector accounting & UTC midnight splits (`player-stats.test.mjs`), and checkpoint deduplication/validation (`records.test.mjs`).

## License

MIT — see [LICENSE](LICENSE).
