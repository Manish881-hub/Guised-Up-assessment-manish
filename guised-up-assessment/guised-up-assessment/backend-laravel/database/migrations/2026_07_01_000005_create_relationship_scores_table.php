<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Materialized "who does viewer_id interact with most" table. Refreshed by
 * a scheduled command (see app/Console/Commands, referenced in README) so the
 * feed query never scans raw `interactions` live. See TSD §3 and §8.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('relationship_scores', function (Blueprint $table) {
            $table->foreignId('viewer_id')->constrained('users')->cascadeOnDelete();
            $table->foreignId('author_id')->constrained('users')->cascadeOnDelete();
            $table->float('score')->default(0.1); // 0.1 default = cold-start constant, see TSD §8
            $table->timestamp('updated_at')->useCurrent();

            $table->primary(['viewer_id', 'author_id']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('relationship_scores');
    }
};
