<?php

namespace App\Http\Controllers;

use App\Jobs\GeneratePostEmbedding;
use App\Models\Post;
use App\Services\EmbeddingClient;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

class PostController extends Controller
{
    public function __construct(private readonly EmbeddingClient $embeddingClient)
    {
    }

    public function store(Request $request)
    {
        $validated = $request->validate([
            'body' => 'required|string|max:2000',
            'image_url' => 'nullable|url',
        ]);

        $post = Post::create([
            'user_id' => $request->user()->id,
            'body' => $validated['body'],
            'image_url' => $validated['image_url'] ?? null,
            'authenticity_score' => $this->cheapAuthenticityHeuristic($validated),
        ]);

        // Try synchronously first (typical latency ~50ms for MiniLM on CPU).
        // If the sidecar is down, don't block publishing — queue a retry
        // instead. See TSD §2 for the availability > consistency trade-off.
        $embedding = $this->embeddingClient->embed($validated['body']);

        if ($embedding !== null) {
            DB::statement(
                'INSERT INTO post_embeddings (post_id, embedding) VALUES (:id, :embedding::vector)',
                ['id' => $post->id, 'embedding' => '[' . implode(',', $embedding) . ']']
            );
        } else {
            GeneratePostEmbedding::dispatch($post->id)->delay(now()->addSeconds(10));
        }

        return response()->json($post->fresh(), 201);
    }

    /**
     * Deliberately simple v1 heuristic, documented as a trade-off in the TSD:
     * captions that are neither empty nor implausibly long/keyword-stuffed
     * score higher; posts without an image aren't penalized. Real version
     * would incorporate image EXIF/perceptual-hash signals (TSD §9).
     */
    private function cheapAuthenticityHeuristic(array $validated): float
    {
        $length = strlen($validated['body']);
        $lengthScore = match (true) {
            $length < 3 => 0.3,
            $length > 500 => 0.6,
            default => 0.8,
        };

        return $lengthScore;
    }
}
