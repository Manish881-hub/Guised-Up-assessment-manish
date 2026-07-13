<?php

namespace App\Http\Controllers;

use App\Services\FeedRankingService;
use Illuminate\Http\Request;

class FeedController extends Controller
{
    public function __construct(private readonly FeedRankingService $ranking)
    {
    }

    public function index(Request $request)
    {
        $page = max((int) $request->query('page', 1), 1);
        $perPage = 20;

        $posts = $this->ranking->rankedFeed($request->user()->id, $page, $perPage);

        return response()->json([
            'data' => $posts,
            'meta' => [
                'page' => $page,
                'per_page' => $perPage,
                'has_more' => count($posts) === $perPage,
            ],
        ]);
    }
}
