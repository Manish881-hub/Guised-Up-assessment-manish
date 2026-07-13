<?php

namespace App\Http\Controllers;

use App\Jobs\GeneratePostEmbedding;
use App\Models\Post;
use App\Services\EmbeddingClient;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

class PostController extends Controller
{
    public function __construct(
        private EmbeddingClient $embeddingClient
    ) {}

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
            'authenticity_score' => $this->cheapAuthenticityHeuristic($validated['body']),
        ]);

        $embedding = $this->embeddingClient->embed($post->body);

        if ($embedding !== null) {
            $vector = $embedding['embedding'] ?? $embedding;
            $flat = (isset($vector[0]) && is_array($vector[0])) ? $vector[0] : $vector;
            $vectorString = '[' . implode(',', $flat) . ']';
            DB::statement(
                'INSERT INTO post_embeddings (post_id, embedding) VALUES (?, ?::vector)',
                [$post->id, $vectorString]
            );
        } else {
            GeneratePostEmbedding::dispatch($post->id)->delay(now()->addSeconds(10));
        }

        return response()->json($post->fresh(), 201);
    }

    private function cheapAuthenticityHeuristic(string $body): float
    {
        $length = mb_strlen($body);

        if ($length < 3) {
            return 0.3;
        }

        if ($length > 500) {
            return 0.6;
        }

        return 0.8;
    }
}
