# Setup note

This folder contains the **application-layer code** (models, controllers,
migrations, services, jobs, tests, config, routes) for the assignment — the
part that's actually being evaluated. It's meant to be dropped into a fresh
Laravel skeleton rather than shipped as a full framework install, so the repo
stays focused on the code that matters instead of vendored framework
boilerplate.

To turn this into a runnable app:

```bash
composer create-project laravel/laravel:^11.0 guised-up-api
# then copy the contents of this folder's app/, database/, routes/, config/,
# tests/, composer.json (merge require), and .env.example into it
cd guised-up-api
composer require laravel/sanctum
php artisan vendor:publish --provider="Laravel\Sanctum\SanctumServiceProvider"
```

Then follow the "Running it locally" steps in the top-level `README.md`.

If you'd rather I commit a fully materialized Laravel skeleton (with
`bootstrap/`, `public/index.php`, `artisan`, etc.) instead of this
lean overlay, that's a five-minute `composer create-project` away —
just say so and I'll merge everything in.
