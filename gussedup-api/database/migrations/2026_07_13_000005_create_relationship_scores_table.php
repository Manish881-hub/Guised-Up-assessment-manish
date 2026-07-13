<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('relationship_scores', function (Blueprint $table) {
            $table->foreignId('viewer_id')->constrained('users')->cascadeOnDelete();
            $table->foreignId('author_id')->constrained('users')->cascadeOnDelete();
            $table->float('score')->default(0.1);
            $table->timestamp('updated_at')->useCurrent();

            $table->primary(['viewer_id', 'author_id']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('relationship_scores');
    }
};
