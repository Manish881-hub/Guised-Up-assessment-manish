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

/**
 * Backfills a post's embedding if the synchronous call in PostController
 * failed (embedding sidecar was down). See TSD §2.
 */
class GeneratePostEmbedding implements ShouldQueue
{
    use Dispatchable, InteractsWithQueue, Queueable, SerializesModels;

    public int $tries = 5;
    public array $backoff = [10, 30, 60, 120, 300];

    public function __construct(private readonly int $postId)
    {
    }

    public function handle(EmbeddingClient $client): void
    {
        $post = Post::find($this->postId);
        if (! $post) {
            return;
        }

        $embedding = $client->embed($post->body);

        if ($embedding === null) {
            // Let Laravel's backoff/retry handle it; fail loudly on the final attempt.
            $this->fail(new \RuntimeException('Embedding service still unreachable'));
            return;
        }

        DB::statement(
            'INSERT INTO post_embeddings (post_id, embedding) VALUES (:id, :embedding::vector)
             ON CONFLICT (post_id) DO UPDATE SET embedding = EXCLUDED.embedding',
            ['id' => $post->id, 'embedding' => '[' . implode(',', $embedding) . ']']
        );
    }
}
