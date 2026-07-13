# Guised Up — Full-Stack Take-Home Submission

**Candidate:** Manish
**Feature:** Real Connections Feed

## What's in this repo

```
guised-up-assessment/
├── docs/
│   └── TSD.md                   ← Technical Solution Document (start here)
├── backend-laravel/              ← Laravel API (Sanctum auth, feed, search, interactions)
├── embedding-service-python/      ← FastAPI sidecar (sentence-transformers)
├── mobile-react-native/          ← Feed screen (React Native + TypeScript)
├── sql/queries.sql               ← D1-D4 SQL challenge answers
└── README.md                     ← you are here
```

Read `docs/TSD.md` first — it explains the architecture, the ranking algorithm,
the pgvector decision, and the trade-offs, before any of the code below will
make much sense.

## Running it locally

### 1. Database

```bash
# Postgres with pgvector extension available (e.g. the pgvector/pgvector Docker image)
createdb guised_up
```

The `post_embeddings` migration runs `CREATE EXTENSION IF NOT EXISTS vector`
for you, so no manual extension setup needed beyond having pgvector
available in your Postgres install.

### 2. Embedding sidecar (Python)

```bash
cd embedding-service-python
python -m venv venv && source venv/bin/activate
pip install -r requirements.txt
uvicorn main:app --host 0.0.0.0 --port 8001
```

First run downloads `all-MiniLM-L6-v2` (~80MB) from Hugging Face.

### 3. Laravel API

```bash
cd backend-laravel
cp .env.example .env
composer install
php artisan key:generate
php artisan migrate
php artisan db:seed
php artisan serve
```

Run the tests:

```bash
php artisan test
```

To keep `relationship_scores` fresh, schedule the refresh command (add to
`routes/console.php`):

```php
Schedule::command('feed:refresh-relationship-scores')->everyFifteenMinutes();
```

### 4. React Native screen

```bash
cd mobile-react-native
npm install
# Wire FeedScreen into your app's navigator, passing a Sanctum bearer token
```

## What I'd do with more time

See TSD §9 ("What I'd Build Next") — incremental relationship scoring instead
of the scheduled batch job, a real authenticity model beyond the length
heuristic, and feed result caching. All flagged as deliberate v1 trade-offs,
not oversights.

## AI tool usage

Documented honestly in `docs/TSD.md` §7.
