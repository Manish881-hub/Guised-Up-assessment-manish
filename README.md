# Guised Up — Real Connections Feed

A social feed platform that surfaces genuine human connections by combining AI-powered content embedding with intuitive, conversation-first interactions. Built as a submission for the Guised Up founding engineer assessment.

## Architecture

Guised Up follows a modular architecture with four main components:

```
┌─────────────────┐     ┌──────────────────┐
│  React Native   │◄────│  Laravel API     │
│  (Mobile App)   │ HTTP│  (Backend)       │
└─────────────────┘     └────────┬─────────┘
                                 │
                    ┌────────────┴────────────┐
                    │  PostgreSQL + pgvector   │
                    │  (Database)              │
                    └────────────┬─────────────┘
                                 │
                    ┌────────────┴────────────┐
                    │  Python Embedding        │
                    │  Sidecar (FastAPI)       │
                    └─────────────────────────┘
```

| Component         | Technology                  | Purpose                              |
|-------------------|-----------------------------|--------------------------------------|
| Mobile App        | React Native                | Cross-platform iOS / Android UI      |
| API               | Laravel 11 + Sanctum        | RESTful backend with auth            |
| Database          | PostgreSQL + pgvector        | Relational data + vector similarity  |
| Embedding Service | Python / FastAPI            | Generates post embeddings            |

## Table of Contents

- [Prerequisites](#prerequisites)
- [Setup](#setup)
  - [Database](#database)
  - [Embedding Service](#embedding-service)
  - [Laravel API](#laravel-api)
  - [Mobile App](#mobile-app)
- [API Endpoints](#api-endpoints)
- [Running Tests](#running-tests)
- [Credits](#credits)

## Prerequisites

- **PHP** 8.2+
- **Composer** (latest)
- **PostgreSQL** 15+ with [pgvector](https://github.com/pgvector/pgvector) extension
- **Python** 3.12+
- **Node.js** 18+
- **npm** or **yarn**

## Setup

### Database

```bash
createdb guised_up
psql -d guised_up -c "CREATE EXTENSION IF NOT EXISTS vector;"
```

Run the Laravel migrations (see API setup below) to create the schema.

### Embedding Service

```bash
cd embedding-service
python -m venv venv
# On Windows: venv\Scripts\activate
# On macOS/Linux: source venv/bin/activate
pip install -r requirements.txt
uvicorn app.main:app --reload --port 8000
```

The embedding service runs on `http://localhost:8000` and exposes a `/embed` endpoint that the Laravel API calls asynchronously.

### Laravel API

> **Important:** The `backend/` folder in this repository is an application-layer code bundle. See [SETUP_NOTE.md](backend/SETUP_NOTE.md) for full instructions on bootstrapping a fresh Laravel project.

Quick start:

```bash
cd backend
cp .env.example .env
# Edit .env — set DB_DATABASE=guised_up, set EMBEDDING_SERVICE_URL=http://localhost:8000
php artisan key:generate
php artisan migrate
php artisan db:seed
php artisan serve
```

The API is served at `http://localhost:8000/api`.

### Mobile App

```bash
cd mobile
npm install
npx react-native run-android
# or
npx react-native run-ios
```

## API Endpoints

| Method | Endpoint                        | Description                          |
|--------|---------------------------------|--------------------------------------|
| POST   | `/api/register`                 | Create a new user account            |
| POST   | `/api/login`                    | Authenticate and receive a token     |
| GET    | `/api/posts`                    | List posts (paginated)               |
| POST   | `/api/posts`                    | Create a new post                    |
| GET    | `/api/posts/{id}`               | Show a single post with interactions |
| POST   | `/api/posts/{id}/view`          | Record a view                        |
| POST   | `/api/posts/{id}/reply`         | Reply to a post                      |
| POST   | `/api/posts/{id}/react`         | React to a post                      |
| GET    | `/api/feed`                     | Personalized feed (embedding-based)  |
| GET    | `/api/users/leaderboard`        | Top active users                     |
| GET    | `/api/admin/spam`               | Spam detection report                |
| POST   | `/api/admin/posts/{id}/flag`    | Flag a post as spam                  |

## Running Tests

```bash
cd backend
php artisan test
```

## Credits

- **Manish** — Development and architecture
- Submission for the **Guised Up Founding Engineer Assessment**
