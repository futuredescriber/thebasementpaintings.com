# Private player statistics

Open `/stats` and sign in with the configured production password. No password or secret is stored in this repository. Production secrets `STATS_PASSWORD_HASH` and `STATS_SESSION_SECRET` are configured in Netlify; changing the session secret signs everyone out.

Statistics are best-effort anonymous media-progress measurements, not proof that a person heard the speakers. A qualified play requires 30 seconds of advancing playback; an attempt includes shorter starts. Completion requires the ended event and at least 90% of the track listened. A skip means selecting another song before the previous one ends; pause is not a skip. Seeking, stalled playback and suspended audio output do not add listening time. Entrance, manual, queue and restored-session starts are distinguished. Saved sessions retain their original attribution when available.

The collector uses ephemeral tab/session and play IDs, honors Do Not Track and Global Privacy Control, and does not retain IP addresses, user agents or referrers in application records. Provider infrastructure may maintain its own access logs. Anonymous public submissions can be forged; schema checks and rate limits reduce abuse rather than providing fraud-proof counts.

Immutable cumulative checkpoints in Netlify Blobs make duplicate and out-of-order retries idempotent. Uploads occur at the qualified threshold, roughly once per minute of listening, and on pause/end/navigation. Failed uploads never block playback; close-time delivery is best effort. There is no always-on database or dashboard polling. Traffic, storage, function execution and deployment still share the team's normal Netlify allowance.

Records are retained for approximately 90 days with bounded daily cleanup. Reports cover at most 31 days and have a bounded record scan; narrow the date range if the limit is reached. Listening crossing UTC midnight is split between days; play counts belong to the start day. CSV exports require the same authenticated session as the dashboard. Reports never expose raw session IDs.

Public collection is `/api/player-stats`; every report/export/cleanup route is server-authenticated. Password verification uses salted scrypt; the eight-hour session cookie is signed, HttpOnly, Secure and SameSite=Strict. No credentials are placed in browser storage. Removing the two production environment variables fails closed and disables collection/admin access. Remove the `player-stats.js` script tags and player hooks to uninstall collection entirely.

The reserved synthetic session `00000000-0000-4000-8000-000000000001` writes to separate test stores and is excluded from ordinary reports. Authenticated same-origin `DELETE /stats/test-records` deletes only today's isolated test store. Do not use that session for real listening.
