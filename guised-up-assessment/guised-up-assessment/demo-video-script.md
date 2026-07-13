# Demo Video Script (target: 4-5 minutes)

Record your screen; talk through it live rather than reading verbatim — the
brief wants to see how you think, so sounding natural matters more than
sounding polished.

**0:00–0:30 — Intro**
"Hi, I'm Manish. This is my submission for the Real Connections Feed
assignment. I'll walk through the architecture, then show the running app,
then the code that backs it."

**0:30–1:30 — Architecture (share TSD.md, scroll to the diagram)**
- One Laravel API, one Postgres+pgvector database, one small Python sidecar
  for embeddings.
- Explain the one big decision: pgvector instead of a dedicated vector DB,
  and why — same transaction as the post write, no new infra for a
  two-person team.

**1:30–2:30 — Ranking algorithm**
- Open TSD §5, walk through the four weighted signals out loud.
- Show `FeedRankingService.php` — point out it's one SQL query, not a PHP
  loop, and explain why that matters at feed-endpoint request volume.
- Mention the `relationship_scores` precomputed table and why live
  aggregation wouldn't scale.

**2:30–3:30 — Live app walkthrough**
- Register/login two seeded users (Alice, Bob).
- Create a post as Alice → show it appear with an embedding.
- Show the Feed screen: scroll to trigger infinite scroll, show the loading
  skeleton, then the empty/error state if you toggle the API off.
- Type a natural-language search query, show semantically relevant results
  come back — not keyword matches.

**3:30–4:15 — Backend + SQL**
- Run `php artisan test` live, show it pass.
- Open `sql/queries.sql`, briefly explain D1-D4 (top active users, per-user
  interaction-weighted feed, zero-reaction high-view posts, spam detection).

**4:15–5:00 — AI tool usage + wrap-up**
- Be specific and honest (matches TSD §7): what you used AI for, what you
  changed after reviewing its output, and one example of a decision you
  overrode or refined yourself.
- Close with what you'd build next given more time (TSD §9).

## Recording tips
- Loom or OBS + screen share is fine — quality of explanation matters more
  than production value.
- Have the terminal, the TSD, and the running app pre-arranged in tabs/panes
  so you're not fumbling mid-recording.
