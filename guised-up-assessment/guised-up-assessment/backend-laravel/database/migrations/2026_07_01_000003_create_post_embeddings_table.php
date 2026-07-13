<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

/**
 * pgvector doesn't have first-class Laravel Schema Builder support, so this
 * migration uses raw SQL. Requires: CREATE EXTENSION vector; (run once per DB).
 *
 * Kept as its own table (not a column on `posts`) so that the hot feed-listing
 * query never has to pull a 384-float vector off disk unless it explicitly
 * joins for it. See TSD §3 for the reasoning.
 */
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

        // ivfflat approximate-nearest-neighbor index for cosine distance.
        // "lists = 100" is a reasonable default below ~1M rows; revisit if the
        // table grows past that (see TSD §9).
        DB::statement('
            CREATE INDEX post_embeddings_cosine_idx
            ON post_embeddings
            USING ivfflat (embedding vector_cosine_ops)
            WITH (lists = 100)
        ');
    }

    public function down(): void
    {
        DB::statement('DROP TABLE IF EXISTS post_embeddings');
    }
};
