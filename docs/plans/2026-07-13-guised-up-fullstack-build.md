# Guised Up — Full-Stack Build Plan

> **For Claude:** REQUIRED SUB-SKILL: Execute tasks sequentially, building each component from scratch.

**Goal:** Build the complete Guised Up "Real Connections Feed" full-stack project from scratch — a Laravel API backend, Python embedding service sidecar, and React Native mobile feed screen.

**Architecture:** One Laravel API (Sanctum auth, pgvector ranking), one PostgreSQL database with pgvector extension, one Python FastAPI sidecar for sentence-transformers embeddings (all-MiniLM-L6-v2, 384-dim). The feed ranking combines authenticity (0.25), relationship depth (0.30), semantic similarity (0.25), and recency (0.20) into one SQL query using pgvector's `<=>` operator.

**Tech Stack:** Laravel 11 + Sanctum + PostgreSQL/pgvector + PHP 8.2, Python 3.12 + FastAPI + sentence-transformers, React Native 0.74 + TypeScript.

**Reference assessment:** `C:\Users\manis\Desktop\gussedup\guised-up-assessment\guised-up-assessment\`

---

### Task 1: Create project directory structure

**Files:** Create directories under `C:\Users\manis\Desktop\gussedup`

- `backend/` — Laravel PHP files (app/, config/, database/, routes/, tests/, composer.json)
- `embedding-service/` — Python FastAPI service
- `mobile/` — React Native app
- `sql/` — SQL challenge queries
- `docs/` — Documentation

### Task 2: Build Python embedding service

**Files:**
- Create: `embedding-service/main.py`
- Create: `embedding-service/requirements.txt`
- Create: `embedding-service/.env.example`

**Step 1:** Write `embedding-service/main.py` with FastAPI app, `/embed` POST endpoint, `/health` GET endpoint, model loading on startup.

**Step 2:** Write `requirements.txt` with fastapi, uvicorn, sentence-transformers, pydantic.

**Step 3:** Verify: `pip install -r requirements.txt && uvicorn main:app --port 8001`

### Task 3: Build Laravel backend

**Files:** Create the full Laravel project structure under `backend/`.

Models:
- `backend/app/Models/User.php` — HasApiTokens, Notifiable, posts() and interactions() relations
- `backend/app/Models/Post.php` — fillable, user() and interactions() relations
- `backend/app/Models/Interaction.php` — no timestamps, fillable, user() and post() relations

Controllers:
- `backend/app/Http/Controllers/AuthController.php` — register, login with Sanctum tokens
- `backend/app/Http/Controllers/PostController.php` — store with embedding + authenticity heuristic
- `backend/app/Http/Controllers/FeedController.php` — index with ranked feed
- `backend/app/Http/Controllers/SearchController.php` — search with live embedding
- `backend/app/Http/Controllers/InteractionController.php` — store interaction

Services:
- `backend/app/Services/FeedRankingService.php` — One SQL query with pgvector, 4-signal ranking
- `backend/app/Services/EmbeddingClient.php` — HTTP client to Python sidecar

Jobs:
- `backend/app/Jobs/GeneratePostEmbedding.php` — Queued retry for failed embeddings

Commands:
- `backend/app/Console/Commands/RefreshRelationshipScores.php` — Scheduled refresh

Migrations:
- `backend/database/migrations/xxxx_create_users_table.php`
- `backend/database/migrations/xxxx_create_posts_table.php`
- `backend/database/migrations/xxxx_create_post_embeddings_table.php` — pgvector
- `backend/database/migrations/xxxx_create_interactions_table.php`
- `backend/database/migrations/xxxx_create_relationship_scores_table.php`

Tests:
- `backend/tests/Feature/FeedTest.php`
- `backend/tests/Feature/PostCreationTest.php`
- `backend/tests/Feature/InteractionTest.php`
- `backend/tests/TestCase.php`

Config:
- `backend/config/services.php` — embedding service URL
- `backend/.env.example`
- `backend/composer.json`

Routes:
- `backend/routes/api.php`

### Task 4: Build React Native mobile app

**Files:**
- `mobile/package.json` — react, react-native, typescript
- `mobile/tsconfig.json`
- `mobile/screens/FeedScreen.tsx` — Feed with search, infinite scroll, skeleton loading
- `mobile/components/PostCard.tsx` — Post card component
- `mobile/components/FeedSkeleton.tsx` — Loading skeleton
- `mobile/components/SearchBar.tsx` — Search input with debounce

### Task 5: SQL queries & docs

**Files:**
- `sql/queries.sql` — D1-D4 challenge queries
- `docs/TSD.md` — Technical Solution Document
- `README.md` — Root README with setup instructions
