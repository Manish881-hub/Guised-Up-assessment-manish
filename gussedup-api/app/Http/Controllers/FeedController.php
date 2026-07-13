<?php

namespace App\Http\Controllers;

use App\Services\FeedRankingService;
use Illuminate\Http\Request;

class FeedController extends Controller
{
    public function __construct(
        private FeedRankingService $ranking
    ) {}

    public function index(Request $request)
    {
        $page = max(1, (int) $request->query('page', 1));

        $result = $this->ranking->rankedFeed(
            $request->user()->id,
            $page,
            20
        );

        return response()->json([
            'data' => $result['posts'],
            'meta' => [
                'page' => $page,
                'per_page' => 20,
                'has_more' => $result['has_more'],
            ],
        ]);
    }
}
