# Guised Up — Real Connections Feed

A social feed platform that ranks content by authenticity, relationship depth, semantic relevance, and recency — not engagement metrics. Built as a submission for the Guised Up founding engineer assessment.

## Architecture

```
┌─────────────────┐     ┌──────────────────┐     ┌──────────────────────┐
│  React Native   │────▶│  Laravel API      │────▶│  PostgreSQL +        │
│  (Expo Mobile)  │HTTP │  (Docker)         │     │  pgvector             │
└─────────────────┘     └────────┬─────────┘     └──────────────────────┘
                                 │
                     ┌───────────┴───────────┐
                     │  Python Embedding      │
                     │  Sidecar (FastAPI)     │
                     └───────────────────────┘
```

- **Mobile:** React Native (Expo) — FeedScreen with infinite scroll, search, authenticity badges
- **API:** Laravel 11 + Sanctum token auth — runs in Docker (php:8.4-cli)
- **Database:** PostgreSQL 16 + pgvector — stores relational data + 384-dim vectors
- **Embeddings:** Python FastAPI with sentence-transformers (all-MiniLM-L6-v2)

## Documentation

- [Technical Solution Document](./docs/TSD.md) — architecture decisions, ranking algorithm, trade-offs
- [SQL Challenge Queries](./sql/queries.sql) — D1–D4

## Prerequisites

- **Docker Desktop** — runs PostgreSQL + Laravel API
- **Python 3.12+** — runs embedding service
- **Node.js 20+** — runs Expo mobile app

## Quick Start

### 1. PostgreSQL with pgvector

```powershell
docker run -d --name guisedup-pg -p 5432:5432 `
  -e POSTGRES_DB=guised_up -e POSTGRES_PASSWORD=postgres `
  pgvector/pgvector:pg16
```

### 2. Embedding Service

```powershell
cd embedding-service
pip install -r requirements.txt
python main.py
```
Verify: `curl http://localhost:8001/health` → `{"status":"ok"}`

### 3. Laravel API (Docker)

```powershell
cd backend
copy .env.example .env
# Edit .env: set DB_HOST=localhost, DB_PASSWORD=postgres, EMBEDDING_SERVICE_URL=http://localhost:8001

docker run -d --name guisedup-api -p 8000:8000 `
  -v "${PWD}:/app" -w /app php:8.4-cli `
  bash -c "apt-get update -qq && apt-get install -y -qq libpq-dev unzip curl `
  && docker-php-ext-install pdo_pgsql > /dev/null 2>&1 `
  && curl -sS https://getcomposer.org/installer | php -- --install-dir=/usr/local/bin --filename=composer `
  && composer install --no-interaction --prefer-dist `
  && php artisan key:generate && php artisan migrate --force `
  && php artisan db:seed --force `
  && php artisan serve --host=0.0.0.0 --port=8000"
```
Verify: `curl http://localhost:8000/api/feed` (returns 401 — needs auth, which means it's working)

### 4. Mobile App

```powershell
cd mobile
npm install
# Edit src/config.ts: set your LAN IP (run ipconfig to find it)
npx expo start
```

Scan the QR code with Expo Go (iOS/Android) to view the feed.

## API Endpoints

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| POST | `/api/register` | None | Create account |
| POST | `/api/login` | None | Get Bearer token |
| POST | `/api/posts` | Bearer | Create post (auto-generates embedding) |
| GET | `/api/feed?page=1` | Bearer | Personalized ranked feed (20/page) |
| GET | `/api/search?q=...` | Bearer | Vector similarity search (top 10) |
| POST | `/api/interactions` | Bearer | Log view/reply/reaction |

## Feed Ranking Formula

```
score = 0.30 × relationship_depth
      + 0.25 × authenticity_score
      + 0.25 × semantic_similarity
      + 0.20 × time_decay (36h half-life)
```

## Running Tests

```powershell
docker exec guisedup-api php artisan test
```

Expect: 9 tests, 21 assertions, all passing.

## Project Structure

```
├── backend/              # Laravel API (Docker)
├── docs/
│   └── TSD.md           # Technical Solution Document
├── embedding-service/    # Python FastAPI embedding sidecar
├── mobile/               # React Native (Expo) app
├── sql/
│   └── queries.sql       # D1–D4 challenge queries
└── README.md
```
