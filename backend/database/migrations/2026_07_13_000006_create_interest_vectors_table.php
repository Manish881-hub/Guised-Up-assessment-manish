<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

return new class extends Migration
{
    public function up(): void
    {
        DB::statement('
            CREATE TABLE interest_vectors (
                user_id    BIGINT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
                vector     vector(384) NOT NULL,
                updated_at TIMESTAMP DEFAULT NOW()
            )
        ');
    }

    public function down(): void
    {
        DB::statement('DROP TABLE IF EXISTS interest_vectors');
    }
};
