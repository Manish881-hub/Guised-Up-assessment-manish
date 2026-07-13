<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

return new class extends Migration
{
    public function up(): void
    {
        DB::statement('CREATE EXTENSION IF NOT EXISTS vector');

        DB::statement('
            CREATE TABLE post_embeddings (
                post_id BIGINT PRIMARY KEY REFERENCES posts(id) ON DELETE CASCADE,
                embedding vector(384) NOT NULL,
                created_at TIMESTAMP DEFAULT NOW()
            )
        ');

        DB::statement('
            CREATE INDEX post_embeddings_cosine_idx
            ON post_embeddings
            USING ivfflat (embedding vector_cosine_ops)
            WITH (lists = 100)
        ');
    }

    public function down(): void
    {
        DB::statement('DROP INDEX IF EXISTS post_embeddings_cosine_idx');
        DB::statement('DROP TABLE IF EXISTS post_embeddings');
    }
};
