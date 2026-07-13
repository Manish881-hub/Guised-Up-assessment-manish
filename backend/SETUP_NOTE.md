# Setup Note — Laravel Application Bundle

The `backend/` directory in this repository is an **application-layer code bundle** containing custom app code, configuration overrides, routes, migrations, tests, and assets. It is **not** a standalone Laravel installation.

To get the API running, drop the contents of `backend/` into a fresh Laravel 11 project:

## Step-by-step

```bash
# 1. Create a fresh Laravel 11 project
composer create-project laravel/laravel:^11.0 guised-up-api

# 2. Copy the bundle contents into the new project
#    From this repository's backend/ folder, copy the following into
#    the root of guised-up-api/, overwriting where prompted:
#
#    app/          →  app/
#    config/       →  config/
#    database/     →  database/
#    routes/       →  routes/
#    tests/        →  tests/
#    composer.json →  composer.json
#    .env.example  →  .env.example

# 3. Install Sanctum for API token authentication
cd guised-up-api
composer require laravel/sanctum

# 4. Publish Sanctum assets
php artisan vendor:publish --provider="Laravel\Sanctum\SanctumServiceProvider"

# 5. Copy and configure environment
cp .env.example .env
# Edit .env to set your database credentials and EMBEDDING_SERVICE_URL

# 6. Generate application key
php artisan key:generate

# 7. Run database migrations
php artisan migrate

# 8. Seed sample data
php artisan db:seed

# 9. Start the development server
php artisan serve
```

Your API is now running at `http://localhost:8000`.

## What's included in the bundle

| Path          | Contents                                    |
|---------------|---------------------------------------------|
| `app/`        | Models, Controllers, Services, Providers    |
| `config/`     | App configuration files (sanctum, app, etc) |
| `database/`   | Migrations, Factories, Seeders              |
| `routes/`     | API route definitions                       |
| `tests/`      | Feature & Unit tests                        |
| `composer.json` | Package dependencies (merged)             |
| `.env.example`  | Environment template                       |

## Notes

- Ensure PostgreSQL has the `pgvector` extension installed before running migrations (`CREATE EXTENSION IF NOT EXISTS vector;`).
- The embedding service must be running at the URL specified in `.env` under `EMBEDDING_SERVICE_URL` for the feed feature to work.
