# Guised Up — Real Connections Feed
## Technical Solution Document

**Author:** Manish
**Role applied for:** Founding Software Engineer (React Native + Laravel + AI)
**Date:** July 2026

---

## 1. Problem Restatement

Guised Up needs a feed that rewards *authenticity and real relationships*, not engagement.
Concretely, ranking has to combine four independent signals — authenticity, relationship
depth, semantic relevance, and recency — into one score, and the same embedding space has
to support natural-language search ("funny travel stories from last week").

The two things I optimized the design for, since this is a founding-engineer exercise and
not a CRUD exercise:

1. **The ranking signal has to be computable cheaply at read time.** A feed endpoint that
   does live cross joins across the whole interaction table for every request will not
   survive real traffic. Anything expensive gets pre-aggregated.
2. **The vector store shouldn't be a separate piece of infrastructure on day one.** A
   pre-PMF startup doesn't need a dedicated vector DB cluster; it needs one Postgres
   instance it already understands how to operate, back up, and query.

---

## 2. System Architecture

```
                        ┌─────────────────────────┐
                        │   React Native Client    │
                        │  (Feed screen, search)   │
                        └────────────┬─────────────┘
                                     │ HTTPS (Bearer token)
                                     ▼
                        ┌─────────────────────────┐
                        │   Laravel API (PHP)      │
                        │  Sanctum auth            │
                        │  - PostController         │
                        │  - FeedController         │
                        │  - SearchController       │
                        │  - InteractionController  │
                        └──────┬───────────┬────────┘
                               │           │
                 (sync HTTP)   │           │  Eloquent / raw SQL
                               ▼           ▼
                  ┌───────────────────┐   ┌────────────────────────┐
                  │ Python Embedding   │   │ PostgreSQL + pgvector   │
                  │ Service (FastAPI)  │   │  users, posts,          │
                  │ sentence-          │◄──┤  interactions,          │
                  │ transformers       │   │  post_embeddings        │
                  │ (all-MiniLM-L6-v2) │   │  (vector(384) column)   │
                  └───────────────────┘   └────────────────────────┘
```

**Flow for `POST /api/posts`:** Laravel writes the post row, then calls the embedding
service synchronously (small payload, ~50ms on CPU for MiniLM) and stores the returned
384-dim vector in the same transaction. If the embedding service is down, the post still
saves — embedding backfill runs as a queued retry job, so publishing is never blocked
on the ML sidecar. That's a deliberate availability > consistency trade-off for this
endpoint.

**Flow for `GET /api/feed`:** Laravel does NOT call the embedding service per request.
It reads the user's precomputed "interest vector" (see §5) and does the whole ranking
query in Postgres using `pgvector`'s cosine distance operator, combined with SQL window
functions for the other three signals.

**Flow for `GET /api/search`:** the query string is embedded on the fly (one small call
to the Python service, ~50ms) and matched against `post_embeddings` with pgvector.

---

## 3. Database Schema

```sql
-- users (Laravel default + one addition)
users
  id BIGINT PK
  name VARCHAR
  email VARCHAR UNIQUE
  password VARCHAR
  created_at, updated_at

-- posts
posts
  id BIGINT PK
  user_id BIGINT FK -> users.id
  body TEXT
  image_url VARCHAR NULL
  authenticity_score FLOAT DEFAULT NULL   -- computed at write time, see §5.1
  created_at, updated_at
  INDEX (user_id, created_at DESC)

-- post_embeddings (kept separate from posts so the hot feed-listing query
-- never has to pull a 384-float column off disk unless it needs it)
post_embeddings
  post_id BIGINT PK/FK -> posts.id
  embedding VECTOR(384)                   -- pgvector column
  INDEX USING ivfflat (embedding vector_cosine_ops)

-- interactions
interactions
  id BIGINT PK
  user_id BIGINT FK -> users.id            -- the actor
  post_id BIGINT FK -> posts.id
  type ENUM('view','reply','reaction')
  created_at
  INDEX (user_id, post_id, created_at)
  INDEX (post_id, type)

-- relationship_scores (materialized, refreshed periodically — see §5.2)
relationship_scores
  viewer_id BIGINT FK -> users.id
  author_id BIGINT FK -> users.id
  score FLOAT                              -- decayed interaction frequency
  updated_at
  PRIMARY KEY (viewer_id, author_id)
```

**Why a separate `relationship_scores` table instead of aggregating `interactions` live?**
Because `GET /api/feed` is the single most frequently hit endpoint in the whole product.
Computing "who does this user interact with most" by scanning `interactions` on every
feed load doesn't scale past a few thousand users. Instead, a scheduled job (Laravel
queued command, every 15 min, or on-write increment — see trade-offs) maintains a small
precomputed table that the feed query joins against directly. This is the single biggest
architectural decision in this document, and it's the one I'd expect a senior engineer
to probe in the interview.

---

## 4. Vector DB Choice: pgvector

I evaluated Pinecone, Weaviate, Qdrant, and pgvector. I chose **pgvector**, for one
reason that outweighs the others at this stage: **it removes an entire category of
operational surface area for a two-person engineering team.**

| | Pinecone / Weaviate / Qdrant | pgvector |
|---|---|---|
| New service to deploy, monitor, back up | Yes | No — same Postgres instance |
| Cross-store consistency (post + embedding) | Two-phase, eventually consistent | Single transaction |
| Query language | Separate SDK/API | Plain SQL — same as everything else |
| Cost at this scale (<1M posts) | Managed tier or self-hosted cluster | Free, runs on the existing DB |
| Ceiling (when you outgrow it) | High | Real, but not until tens of millions of vectors with ANN latency requirements dedicated infra can solve |

The honest trade-off: pgvector's `ivfflat`/`hnsw` index is slower at very large scale
than a purpose-built ANN engine, and it doesn't do sharding for you. For a pre-launch
social app, that ceiling is far enough away that paying for it now would be premature
optimization — exactly the kind of judgment call a founding engineer needs to make
correctly. If Guised Up hits real scale, migrating the `post_embeddings` table to
Qdrant later is a contained, well-understood migration, not a rewrite.

---

## 5. Feed Ranking Algorithm

### 5.1 Plain English

Every post gets a score built from four ingredients, each normalized to 0–1:

1. **Authenticity (weight 0.25)** — a proxy computed once at post-creation time from
   cheap signals: shorter caption-to-image ratio isn't penalized, but stock-photo-like
   images (very high resolution + no EXIF/camera data) and heavily-templated text
   (very high compression ratio / low text entropy) score lower. This is deliberately
   a rough heuristic, not a research-grade authenticity classifier — flagged as a
   trade-off below.
2. **Relationship depth (weight 0.30)** — pulled from the precomputed
   `relationship_scores` table: a decayed count of views/replies/reactions the
   *viewer* has given the *author* historically, normalized against the viewer's own
   max so heavy vs. light users are both scored fairly.
3. **Semantic similarity (weight 0.25)** — cosine similarity between the post's
   embedding and the viewer's rolling "interest vector" (the mean of their last N
   interacted-with posts' embeddings, kept as a small per-user cache, refreshed
   incrementally on each new interaction).
4. **Time decay (weight 0.20)** — exponential decay, half-life 36 hours, so a highly
   relevant post from yesterday can still outrank a mediocre one from an hour ago,
   but nothing truly stale surfaces.

The weights (0.30 / 0.25 / 0.25 / 0.20) reflect the product brief's explicit ordering —
relationship depth first, since that's the feature's whole differentiator, then
authenticity and semantic relevance roughly tied, then recency as a tie-breaker rather
than the dominant signal (the brief explicitly says "not at the expense of relevance").

### 5.2 Pseudocode

```
function rank_feed(viewer_id, page, page_size=20):
    candidate_posts = SELECT posts
                       FROM posts
                       JOIN post_embeddings USING (post_id)
                       WHERE posts.created_at > NOW() - INTERVAL '14 days'
                       -- 14-day window keeps the candidate set bounded;
                       -- nothing older can mathematically win against decay anyway

    interest_vector = get_or_compute_interest_vector(viewer_id)

    for post in candidate_posts:
        authenticity   = post.authenticity_score                       # 0..1, precomputed
        relationship   = relationship_scores[viewer_id][post.author_id] # 0..1, precomputed, default 0.1 for strangers
        semantic       = cosine_similarity(post.embedding, interest_vector)  # 0..1
        hours_old      = (NOW() - post.created_at) in hours
        recency        = exp(-hours_old * ln(2) / 36)                   # half-life 36h

        post.score = 0.30 * relationship
                   + 0.25 * authenticity
                   + 0.25 * semantic
                   + 0.20 * recency

    return sort(candidate_posts, by=score, desc=True)[page*page_size : (page+1)*page_size]
```

In SQL, this becomes one query using `pgvector`'s `<=>` cosine-distance operator and a
LEFT JOIN against `relationship_scores` (defaulting strangers to a low constant so new
accounts aren't invisible — an explicit trade-off to avoid a cold-start dead zone),
computed as a single `ORDER BY` expression with `LIMIT`/`OFFSET` for pagination. See
`backend-laravel/app/Services/FeedRankingService.php` for the real implementation.

---

## 6. API Design

| Endpoint | Auth | Notes |
|---|---|---|
| `POST /api/register`, `POST /api/login` | none | Sanctum token issuance |
| `POST /api/posts` | Bearer token | `{ body: string, image_url?: string }` → 201 with post + embedding queued |
| `GET /api/feed?page=1` | Bearer token | paginated, 20/page, ranked per §5 |
| `GET /api/search?q=...` | Bearer token | embeds query on the fly, top 10 by cosine similarity |
| `POST /api/interactions` | Bearer token | `{ post_id, type: view\|reply\|reaction }` |

Auth strategy: **Laravel Sanctum**, token-based (not cookie/session), since the client
is a mobile app, not a first-party SPA sharing a domain with the API.

All list endpoints return `{ data: [...], meta: { page, per_page, has_more } }` — a
consistent envelope so the RN client's pagination logic doesn't special-case any
endpoint.

---

## 7. AI Agentic Tool Usage (honest account)

I used Claude throughout this exercise: to think through the ranking architecture
trade-offs out loud before writing any code, to scaffold the Laravel migrations/models/
controllers and the RN screen boilerplate, and to draft this document from my own
architecture notes. I reviewed and edited the generated code rather than pasting it
unread — in particular I changed the initial "compute relationship depth live" approach
to the precomputed `relationship_scores` table after reasoning about feed-endpoint load,
and I tightened the ranking weights against the brief's explicit signal ordering. I did
not use AI to write this honesty section's content about my own reasoning.

---

## 8. Trade-offs & Assumptions

- **Authenticity scoring is a heuristic, not an ML model.** Building a real authenticity
  classifier (image forensics, text-generation detection) is a multi-week project on its
  own. I've scoped it as a proxy with a clearly documented upgrade path.
- **`relationship_scores` is refreshed on a schedule, not fully real-time.** A brand-new
  interaction won't affect ranking for up to 15 minutes. Acceptable for a feed; would
  need to become incremental (update-on-write) before this matters for something like a
  messaging product.
- **Cold start:** new users and new authors default to a low-but-nonzero constant so the
  feed isn't empty on day one, at the cost of some early randomness in ranking quality.
- **14-day candidate window** bounds query cost; a post that's genuinely still relevant
  after 14 days can only resurface via search, not the ranked feed. Documented, not
  hidden.
- **Embeddings run on CPU via sentence-transformers** (`all-MiniLM-L6-v2`, 384-dim) to
  avoid an OpenAI API dependency/cost for a take-home; swapping to an OpenAI or Cohere
  embedding endpoint is a one-line change in `embedding-service-python/main.py` since the
  interface (`text -> vector`) doesn't change.

---

## 9. What I'd Build Next (future scaling)

1. Incremental `relationship_scores` updates on write instead of a scheduled batch job.
2. Move `post_embeddings` to a dedicated ANN store once posts pass ~5–10M rows and
   `ivfflat` recall/latency starts to degrade.
3. A real authenticity model, likely a small fine-tuned classifier over image EXIF +
   perceptual hash + text perplexity features.
4. Feed result caching per user for a short TTL (30–60s) to absorb pull-to-refresh spam
   without re-running the ranking query every time.
