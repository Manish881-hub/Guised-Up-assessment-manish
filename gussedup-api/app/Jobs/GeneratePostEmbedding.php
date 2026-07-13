<?php

namespace App\Jobs;

use App\Models\Post;
use App\Services\EmbeddingClient;
use Illuminate\Bus\Queueable;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Foundation\Bus\Dispatchable;
use Illuminate\Queue\InteractsWithQueue;
use Illuminate\Queue\SerializesModels;
use Illuminate\Support\Facades\DB;

class GeneratePostEmbedding implements ShouldQueue
{
    use Dispatchable, InteractsWithQueue, Queueable, SerializesModels;

    public int $tries = 5;

    public array $backoff = [10, 30, 60, 120, 300];

    private int $postId;

    public function __construct(int $postId)
    {
        $this->postId = $postId;
    }

    public function handle(EmbeddingClient $client): void
    {
        $post = Post::find($this->postId);

        if (!$post) {
            return;
        }

        $embedding = $client->embed($post->body);

        if ($embedding === null) {
            throw new \RuntimeException("Failed to generate embedding for post {$this->postId}");
        }

        $vector = $embedding['embedding'] ?? $embedding;
        $flat = (isset($vector[0]) && is_array($vector[0])) ? $vector[0] : $vector;
        $vectorString = '[' . implode(',', $flat) . ']';

        DB::statement(
            'INSERT INTO post_embeddings (post_id, embedding) VALUES (?, ?::vector)
             ON CONFLICT (post_id) DO UPDATE SET embedding = EXCLUDED.embedding, created_at = NOW()',
            [$this->postId, $vectorString]
        );
    }
}
