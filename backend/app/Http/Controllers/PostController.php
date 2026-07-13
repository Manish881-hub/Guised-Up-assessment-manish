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
        $score = 0.5;

        // — Penalties —
        // All-caps words (shouting)
        preg_match_all('/\b[A-Z]{3,}\b/', $body, $caps);
        $score -= count($caps[0]) * 0.05;

        // Excessive emoji density (>1 emoji per 20 chars)
        $emojiCount = preg_match_all('/[\x{1F600}-\x{1F64F}\x{1F300}-\x{1F5FF}\x{1F680}-\x{1F6FF}\x{1F1E0}-\x{1F1FF}\x{2600}-\x{26FF}\x{2700}-\x{27BF}]/u', $body);
        if ($length > 0 && $emojiCount / $length > 0.05) {
            $score -= 0.15;
        }

        // Repeated characters (spam signal: "loooool", "!!!!!")
        if (preg_match('/(.)\1{3,}/', $body)) {
            $score -= 0.1;
        }

        // Excessive punctuation
        $exclamationCount = substr_count($body, '!');
        if ($exclamationCount > 3) {
            $score -= 0.05 * min(3, $exclamationCount - 3);
        }

        // Very short content (low effort)
        if ($length < 10) {
            $score -= 0.2;
        }

        // — Bonuses —
        // Conversational markers (questions, first-person)
        if (preg_match('/\b(I|my|we|our|anyone|everyone)\b/i', $body)) {
            $score += 0.1;
        }
        if (str_contains($body, '?')) {
            $score += 0.05;
        }

        // Detailed content (genuine effort)
        if ($length > 120) {
            $score += 0.1;
        }
        if ($length > 300) {
            $score += 0.05;
        }

        // Mentions specific brands or items (real experience signal)
        if (preg_match('/\b(Levi|Nike|Adidas|New Balance|Doc Marten|Carhartt|Vans|Converse|Thrift|vintage)\b/i', $body)) {
            $score += 0.05;
        }

        return max(0.1, min(1.0, round($score, 2)));
    }
}
