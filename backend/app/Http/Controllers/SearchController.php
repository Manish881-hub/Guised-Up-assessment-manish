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

        $embedding = $this->embeddingClient->embed($validated['q']);

        if ($embedding === null) {
            return response()->json(['message' => 'Search service unavailable'], 503);
        }

        $vectorString = '[' . implode(',', $embedding) . ']';

        $results = DB::select(
            'SELECT p.id, p.user_id, p.body, p.image_url, p.authenticity_score, p.created_at, p.updated_at,
                    1 - (pe.embedding <=> ?::vector) AS similarity
             FROM posts p
             INNER JOIN post_embeddings pe ON pe.post_id = p.id
             ORDER BY pe.embedding <=> ?::vector
             LIMIT 10',
            [$vectorString, $vectorString]
        );

        return response()->json([
            'data' => $results,
        ]);
    }
}
