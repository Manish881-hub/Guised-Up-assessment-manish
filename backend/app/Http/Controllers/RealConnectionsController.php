<?php

namespace App\Http\Controllers;

use App\Services\EmbeddingClient;
use App\Services\RealConnectionsRankingService;
use Illuminate\Http\Request;

class RealConnectionsController extends Controller
{
    public function __construct(
        private RealConnectionsRankingService $ranking,
        private EmbeddingClient $embeddingClient,
    ) {}

    public function feed(Request $request)
    {
        $page = max(1, (int) $request->query('page', 1));
        $perPage = min(50, max(1, (int) $request->query('per_page', 20)));

        $result = $this->ranking->rankedFeed(
            $request->user()->id,
            $page,
            $perPage,
        );

        return response()->json([
            'data' => $result['posts'],
            'meta' => [
                'page' => $page,
                'per_page' => $perPage,
                'has_more' => $result['has_more'],
            ],
        ]);
    }

    public function search(Request $request)
    {
        $validated = $request->validate([
            'q' => 'required|string|max:200',
            'limit' => 'nullable|integer|min:1|max:50',
        ]);

        $embedding = $this->embeddingClient->embed($validated['q']);

        if ($embedding === null) {
            return response()->json(['message' => 'Search service unavailable'], 503);
        }

        $vector = $embedding['embedding'] ?? $embedding;

        $results = $this->ranking->personalisedSearch(
            $request->user()->id,
            $vector,
            $validated['limit'] ?? 10,
        );

        return response()->json([
            'data' => $results,
        ]);
    }
}
