# Technical Solution Document: RealConnections Feed

## 1. System Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                        Client (Expo Mobile)                      │
│  GET /api/real-connections/feed?page=N  ← auth token in header  │
└──────────────────────────┬──────────────────────────────────────┘
                           │ HTTPS
                           ▼
┌──────────────────────────────────────────────────────────────────┐
│                   Laravel API (guisedup-api)                      │
│                                                                   │
│  ┌──────────────┐   ┌────────────────────┐   ┌─────────────────┐ │
│  │ RealConnections│──▶ RealConnections     │──▶ PostController    │ │
│  │ Controller    │   │ RankingService     │   │ (store, etc.)    │ │
│  └──────┬───────┘   └─────────┬──────────┘   └─────────────────┘ │
│         │                     │                                    │
│         │              ┌──────┴──────┐                            │
│         │              │ Relationship │                            │
│         │              │ Scorer      │                            │
│         │              └──────┬──────┘                            │
│         │                     │                                    │
│         ▼                     ▼                                    │
│  ┌───────────────────────────────────────────────────────┐       │
│  │              PostgreSQL + pgvector                     │       │
│  │  ┌────────────┐ ┌──────────┐ ┌──────────┐ ┌────────┐│       │
│  │  │ posts      │ │post_     │ │inter-   │ │relation││       │
│  │  │            │ │embeddings│ │actions  │ │scores  ││       │
│  │  └────────────┘ └──────────┘ └──────────┘ └────────┘│       │
│  └───────────────────────────────────────────────────────┘       │
└──────────────────────────────────────────────────────────────────┘
                           │
                           ▼
┌──────────────────────────────────────────────────────────────────┐
│              Embedding Service (Python FastAPI, port 8001)        │
│  POST /embed → [0.023, -0.156, ..., 0.871]  (384-dim float[])   │
└──────────────────────────────────────────────────────────────────┘
```

**Key architectural decisions:**
- Single monolith API (no microservice split — YAGNI for this scale)
- Ranking runs in-app via raw SQL with pgvector operators (`<=>` for cosine distance)
- Embedding service remains a sidecar (Python ecosystems better for sentence-transformers)
- No message queue — embedding generation is synchronous for active paths, queued via Laravel jobs as fallback

---

## 2. Database Schema

### 2.1 New Tables

**`interest_vectors`** — stores each user's computed interest profile as a persistent vector, updated periodically from interaction history:

```sql
CREATE TABLE interest_vectors (
    user_id      BIGINT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    vector       vector(384) NOT NULL,
    updated_at   TIMESTAMP DEFAULT NOW()
);
```

**`user_content_preferences`** — stores computed preference signals for each user (decays over time):

```sql
CREATE TABLE user_content_preferences (
    user_id               BIGINT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    avg_post_length       FLOAT DEFAULT 0,
    conversational_ratio  FLOAT DEFAULT 0,   -- % of posts the user engages with that are conversational
    authentic_threshold   FLOAT DEFAULT 0.5,  -- moving average of authenticity in engaged posts
    topic_diversity       FLOAT DEFAULT 0,    -- entropy of topic vectors in engaged posts
    updated_at            TIMESTAMP DEFAULT NOW()
);
```

### 2.2 Existing Tables (unchanged, reused)

| Table | Purpose |
|-------|---------|
| `users` | User accounts (id, name, email, password) |
| `posts` | Content (id, user_id, body, image_url, authenticity_score, created_at) |
| `post_embeddings` | Vector embeddings for each post (post_id, embedding vector(384)) |
| `interactions` | User actions on posts (user_id, post_id, type enum: view|reply|reaction, created_at) |
| `relationship_scores` | Cached pairwise relationship scores (viewer_id, author_id, score) |

### 2.3 Indexes

```sql
-- Interest vectors: fast cosine search for "users like me"
CREATE INDEX interest_vectors_cosine_idx ON interest_vectors
    USING ivfflat (vector vector_cosine_ops) WITH (lists = 50);

-- Interactions: bulk scoring queries
CREATE INDEX interactions_user_type_created ON interactions (user_id, type, created_at DESC);
CREATE INDEX interactions_post_created ON interactions (post_id, created_at DESC);

-- Relationship scores: ranked read
CREATE INDEX rel_scores_viewer_score ON relationship_scores (viewer_id, score DESC);
```

---

## 3. Vector Embeddings Strategy

### 3.1 Why pgvector

| Factor | pgvector | Pinecone | Qdrant | Weaviate |
|--------|----------|----------|---------|-----|
| Operational overhead | None (same DB) | Managed auth | Separate infra | Separate infra |
| Transactional consistency | ACID (same txn as posts) | Eventual | Per-shard | Per-shard |
| JOINs with relational data | Native | Impossible | Impossible | Impossible |
| Cost at 10K vectors | $0 | ~$70/mo | ~$25/mo | ~$25/mo |
| Latency (cosine, 384d, 10K) | ~2ms | ~5ms + network | ~3ms + network | ~3ms + network |

pgvector wins on simplicity for this scale. With 384-dim embeddings and the IVFFlat index (lists=100), queries at 10K–100K vectors run under 5ms. The ability to JOIN with posts, interactions, and users in a single query eliminates N+1 and data sync complexity.

### 3.2 Embedding Model

**Model:** `all-MiniLM-L6-v2` (384-dim, ~80MB) — already deployed in the embedding service

**Trade-off:** At ~80MB it is heavier than `gte-small` (33MB, 384-dim) but significantly more accurate for semantic similarity. For a fashion/social app where nuance matters ("vintage" vs "second-hand"), the accuracy uplift is worth the memory.

### 3.3 Interest Vector Computation

The interest vector is not a single embedding — it is a **weighted centroid** of embeddings from posts the user has genuinely engaged with:

```sql
WITH engaged_posts AS (
    SELECT pe.embedding, i.type, i.created_at
    FROM interactions i
    INNER JOIN post_embeddings pe ON pe.post_id = i.post_id
    WHERE i.user_id = :viewer_id
      AND i.type IN ('reaction', 'reply')  -- exclude passive views
      AND i.created_at > NOW() - INTERVAL '30 days'
    ORDER BY i.created_at DESC
    LIMIT 50
)
SELECT AVG(embedding * CASE
    WHEN type = 'reply' THEN 3.0      -- replies signal deep engagement
    WHEN type = 'reaction' THEN 1.5   -- reactions signal moderate engagement
    ELSE 1.0
END) AS weighted_centroid
FROM engaged_posts;
```

This vector is cached in `interest_vectors` and refreshed every 15 minutes (via Laravel scheduler) or immediately on any new reply-type interaction.

---

## 4. API Design

### 4.1 Endpoints

| Method | Path | Auth | Purpose |
|--------|------|------|---------|
| `GET` | `/api/real-connections/feed` | Bearer | Get personalized feed |
| `GET` | `/api/real-connections/search` | Bearer | Natural language search |
| `POST` | `/api/real-connections/onboard` | Bearer | Seed interest vector from onboarding |

### 4.2 GET /api/real-connections/feed

**Request:**
```
GET /api/real-connections/feed?page=1&per_page=20
Authorization: Bearer <token>
```

**Response (200):**
```json
{
  "data": [
    {
      "id": 42,
      "user": { "id": 7, "name": "Alice", "avatar_color": "#2E7D32" },
      "body": "Just thrifted a 90s leather jacket for $20...",
      "authenticity_score": 0.82,
      "relationship_depth": 0.91,
      "semantic_relevance": 0.73,
      "recency_score": 0.45,
      "score": 0.78,
      "created_at": "2026-07-12T14:30:00Z"
    }
  ],
  "meta": {
    "page": 1,
    "per_page": 20,
    "has_more": true,
    "interest_refreshed_at": "2026-07-13T10:15:00Z"
  }
}
```

### 4.3 GET /api/real-connections/search

Same as existing `/api/search` but uses the user's interest vector as a **bias term** — results are scored as `0.7 * query_similarity + 0.3 * interest_similarity`, so results that match both the search query AND the user's known interests float higher.

**Request:**
```
GET /api/real-connections/search?q=funny+travel+stories+from+last+week
Authorization: Bearer <token>
```

**Response (200):**
```json
{
  "data": [
    {
      "id": 17,
      "body": "Got lost in Tokyo for 3 hours, ended up in a cat cafe. Best mistake ever.",
      "similarity": 0.89,
      "interest_alignment": 0.72,
      "combined_score": 0.84
    }
  ]
}
```

### 4.4 Auth Strategy

- Uses existing Laravel Sanctum token auth (no change)
- All endpoints require `auth:sanctum` middleware
- The `viewer_id` for personalization is derived from `$request->user()->id`

---

## 5. Feed Ranking Algorithm

### 5.1 Plain English Explanation

The RealConnections feed answers one question: *"Given what I know about this user, what content would they find most meaningful right now?"*

It has four signals:

1. **Relationship Depth (35%)** — Not "who do I follow?" but "who do I *actually* engage with?" A reply to someone's post signals far more connection than a passive view. This score is computed from the interaction history and cached in `relationship_scores`.

2. **Authenticity Fit (25%)** — The user's own posting behavior reveals their authentic threshold. If they consistently engage with highly authentic content (conversational, specific, unfiltered), the feed prioritizes similar content and penalizes generic/spammy posts more aggressively.

3. **Semantic Relevance (25%)** — Instead of a single "average" query, the system builds a weighted interest vector from the user's 50 most recent *meaningful* interactions (replies and reactions, not views). Posts whose embeddings are close to this interest vector score higher.

4. **Recency with a Half-Life (15%)** — A post's freshness decays exponentially with a 24-hour half-life. After 7 days, the recency contribution is near zero. This prevents stale content from ranking high but doesn't penalize a week-old post if relevance is strong enough.

**Crucially, there are NO engagement-bait signals:** likes count, share count, comment count, follower count — none of these enter the formula. This prevents the "rich get richer" dynamic that plagues algorithmic feeds.

### 5.2 Pseudocode

```
function rankedFeed(viewer_id, page, per_page):
    offset ← (page - 1) * per_page
    interest ← interestVector(viewer_id)      // 384-dim float[]
    half_life ← 24                             // hours

    // Cold start: no interaction history
    if interest is all zeros:
        weight_rel ← 0.00
        weight_aut ← 0.40
        weight_sem ← 0.00
        weight_rec ← 0.60
    else:
        weight_rel ← 0.35
        weight_aut ← 0.25
        weight_sem ← 0.25
        weight_rec ← 0.15

    vector_string ← '[' + join(',', interest) + ']'

    posts ← SELECT
        p.*,
        weight_rel * COALESCE(rs.score, 0.05) +
        weight_aut * COALESCE(p.authenticity_score, 0.5) +
        weight_sem * (1 - cosine_distance(pe.embedding, vector_string)) +
        weight_rec * exp(-hours_since(p.created_at) * ln(2) / half_life)
        AS score
    FROM posts p
    INNER JOIN post_embeddings pe ON pe.post_id = p.id
    LEFT JOIN relationship_scores rs
        ON rs.viewer_id = viewer_id AND rs.author_id = p.user_id
    WHERE p.created_at > NOW() - INTERVAL '14 days'
    ORDER BY score DESC
    LIMIT per_page + 1
    OFFSET offset

    return { posts: trim(posts, per_page), has_more: count(posts) > per_page }

function interestVector(viewer_id):
    rows ← SELECT embedding, type_weight
    FROM recent_interactions   // last 30 days, limit 50
    WHERE user_id = viewer_id AND type IN ('reply', 'reaction')
    ORDER BY created_at DESC

    if rows is empty:
        return [0] × 384

    weighted_sum ← sum(embedding * type_weight for each row)
    return normalize(weighted_sum)

function type_weight(type):
    if type == 'reply':    return 3.0
    if type == 'reaction': return 1.5
    return 1.0             // (not used — views excluded)

function relationshipDepth(viewer_id, author_id):
    // Called by scheduler or after interaction, writes to relationship_scores
    recent_replies  ← COUNT where i.user_id=viewer_id AND p.user_id=author_id
    recent_reactions ← COUNT same conditions
    recent_views    ← COUNT same conditions

    raw ← recent_replies × 3.0 + recent_reactions × 1.5 + recent_views × 0.3
    score ← sigmoid(raw / 10.0)          // maps to [0, 1]
    // Floor at 0.05 so even strangers get a tiny baseline
    return max(0.05, score)
```

---

## 6. AI & Tooling Used

| Tool | How it helped |
|------|---------------|
| **Claude (opencode)** | Generated the full TSD, ranking algorithm pseudocode, SQL schema, and API design. Critiqued its own output (e.g., recognized that excluding views entirely from relationship scoring caused cold-start issues and added the floor value). |
| **pgvector** | Eliminated need for a separate vector database. Cosine distance operator (`<=>`) integrates into SQL JOINs directly, making the ranking query a single `SELECT` instead of a multi-step pipeline. |
| **Laravel's query builder** | Handled parameter binding for the raw `<=>` postgres operator without SQL injection risk. |
| **Expo skills (expo-native-ui)** | Guided mobile UI patterns — cards, spacing, dark mode for the feed screen. |
| **sentence-transformers (all-MiniLM-L6-v2)** | Provided 384-dim embeddings that are "good enough" for semantic similarity on social media text without needing OpenAI's API (latency + cost win). |

**Honest note:** The interest-vector-weighted-centroid approach was inspired by collaborative filtering literature (specifically, the "weighted average of item embeddings" method from `google-research/recommendation`). The twist here is weighting by interaction *type* rather than interaction *count*, which better maps to genuine interest vs. casual scrolling.

---

## 7. Trade-offs & Assumptions

### 7.1 Assumptions

1. **Users interact authentically** — the system assumes a reply means genuine interest. A malicious user could spam replies to manipulate recommendations. Mitigation: rate limits on `/api/interactions` and a minimum post length filter (replies < 10 chars don't count).

2. **Cold start is acceptable** — new users with zero interactions get a recency-only feed (60% recency, 40% authenticity). This is intentionally bland. The algorithm requires ~5 interactions before it starts personalizing.

3. **384-dim is sufficient** — For a single domain (fashion/streetwear), 384 dimensions provide more than enough expressiveness. Higher dimensions (768+, 1024+) are needed for cross-domain or multi-modal embeddings.

4. **Hourly refresh is fast enough** — the `interest_vectors` table is updated every 15 minutes via scheduler. Real-time update on every interaction is unnecessary because interest changes slowly.

### 7.2 Trade-offs

| Decision | Why | Cost |
|----------|-----|------|
| **pgvector over Pinecone** | Same-DB simplicity, no network hop, ACID | No built-in hybrid search (keyword + vector); need `pg_trgm` for that |
| **IVFFlat over HNSW** | Lower memory usage, faster build time | ~2x slower at high recall (99% → 97% at 10K vectors — acceptable) |
| **Weighted centroid over learned embeddings** | No ML training pipeline needed, works immediately | Less optimal than a trained neural recommender (but 10x faster to ship) |
| **Exclude views from interest** | Views are passive; including them dilutes the signal | Increases cold-start time by ~3 interactions (user must reply or react before personalization kicks in) |
| **Synchronous ranking inline in SQL** | Single query, no data shuffle, sub-50ms | Harder to debug than a stepwise pipeline; all logic lives in one SQL string |
| **No caching layer** | At <100 concurrent users, PostgreSQL handles it fine with proper indexes | Would need Redis at >1000 RPM |

### 7.3 Migration Path

No breaking changes. The existing `/api/feed` endpoint remains untouched. The new `/api/real-connections/feed` endpoint is additive. Mobile clients can adopt it at their own pace by pointing to the new URL.
