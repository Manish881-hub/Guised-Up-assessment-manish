<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('interactions', function (Blueprint $table) {
            $table->id();
            $table->foreignId('user_id')->constrained()->cascadeOnDelete(); // the actor
            $table->foreignId('post_id')->constrained()->cascadeOnDelete();
            $table->enum('type', ['view', 'reply', 'reaction']);
            $table->timestamp('created_at')->useCurrent();

            $table->index(['user_id', 'post_id', 'created_at']);
            $table->index(['post_id', 'type']);
            $table->index(['user_id', 'created_at']); // powers D1 (most active users)
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('interactions');
    }
};
