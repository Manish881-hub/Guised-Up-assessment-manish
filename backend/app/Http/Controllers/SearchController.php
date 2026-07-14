<?php

namespace App\Http\Controllers;

use App\Services\EmbeddingClient;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

class SearchController extends Controller
{
    public function __construct(
        private EmbeddingClient $embeddingClient
    ) {}

    public function search(Request $request)
    {
        $validated = $request->validate([
            'q' => 'required|string|max:200',
        ]);

        $query = $validated['q'];

        try {
            $embedding = $this->embeddingClient->embed($query);
        } catch (\Throwable $e) {
            $embedding = null;
        }

        if ($embedding !== null) {
            $vector = $embedding['embedding'] ?? $embedding;
            $vectorString = '[' . implode(',', $vector) . ']';

            $results = DB::select(
                "SELECT p.id, p.user_id, p.body, p.image_url, p.authenticity_score, p.created_at, p.updated_at,
                        1 - (pe.embedding <=> ?::vector) AS similarity
                 FROM posts p
                 INNER JOIN post_embeddings pe ON pe.post_id = p.id
                 ORDER BY similarity DESC
                 LIMIT 10",
                [$vectorString]
            );

            if (!empty($results)) {
                return response()->json(['data' => $results]);
            }
        }

        $fallback = DB::select(
            "SELECT p.id, p.user_id, p.body, p.image_url, p.authenticity_score, p.created_at, p.updated_at,
                    0 AS similarity
             FROM posts p
             WHERE p.body ILIKE ?
             ORDER BY p.created_at DESC
             LIMIT 10",
            ["%{$query}%"]
        );

        return response()->json(['data' => $fallback]);
    }
}
