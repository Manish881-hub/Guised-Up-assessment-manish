<?php

namespace App\Http\Controllers;

use App\Services\EmbeddingClient;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

class SearchController extends Controller
{
    public function __construct(private readonly EmbeddingClient $embeddingClient)
    {
    }

    public function search(Request $request)
    {
        $validated = $request->validate(['q' => 'required|string|max:200']);

        $queryVector = $this->embeddingClient->embed($validated['q']);

        if ($queryVector === null) {
            return response()->json([
                'message' => 'Search is temporarily unavailable — embedding service unreachable.',
            ], 503);
        }

        $results = DB::select('
            SELECT
                posts.id,
                posts.user_id,
                posts.body,
                posts.image_url,
                posts.created_at,
                1 - (pe.embedding <=> :query_vector::vector) AS similarity
            FROM posts
            JOIN post_embeddings pe ON pe.post_id = posts.id
            ORDER BY pe.embedding <=> :query_vector::vector
            LIMIT 10
        ', ['query_vector' => '[' . implode(',', $queryVector) . ']']);

        return response()->json(['data' => $results]);
    }
}
