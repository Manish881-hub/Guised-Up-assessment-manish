<?php

namespace App\Services;

use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Log;

class FeedRankingService
{
    private const W_RELATIONSHIP = 0.30;
    private const W_AUTHENTICITY = 0.25;
    private const W_SEMANTIC = 0.25;
    private const W_RECENCY = 0.20;
    private const RECENCY_HALF_LIFE_HOURS = 36;
    private const CANDIDATE_WINDOW_DAYS = 14;
    private const COLD_START_RELATIONSHIP_SCORE = 0.1;

    public function rankedFeed(int $viewerId, int $page = 1, int $perPage = 20): array
    {
        $offset = ($page - 1) * $perPage;
        $interestVector = $this->interestVector($viewerId);
        $halfLife = self::RECENCY_HALF_LIFE_HOURS;

        $isColdStart = true;
        foreach ($interestVector as $v) {
            if (abs($v) > 1e-10) {
                $isColdStart = false;
                break;
            }
        }

        if ($isColdStart) {
            $posts = DB::select(
                "SELECT p.id, p.user_id, p.body, p.image_url, p.authenticity_score, p.created_at, p.updated_at,
                        ? * COALESCE(rs.score, ?) +
                        ? * COALESCE(p.authenticity_score, 0.5) +
                        ? * EXP(-EXTRACT(EPOCH FROM (NOW() - p.created_at)) / 3600.0 * LN(2) / ?) AS score
                 FROM posts p
                 LEFT JOIN relationship_scores rs ON rs.viewer_id = ? AND rs.author_id = p.user_id
                 WHERE p.created_at > NOW() - INTERVAL '14 days'
                 ORDER BY score DESC
                 LIMIT ? OFFSET ?",
                [
                    self::W_RELATIONSHIP + self::W_SEMANTIC,
                    self::COLD_START_RELATIONSHIP_SCORE,
                    self::W_AUTHENTICITY,
                    self::W_RECENCY,
                    $halfLife,
                    $viewerId,
                    $perPage + 1,
                    $offset,
                ]
            );
        } else {
            $vectorString = '[' . implode(',', $interestVector) . ']';
            $posts = DB::select(
                "SELECT p.id, p.user_id, p.body, p.image_url, p.authenticity_score, p.created_at, p.updated_at,
                        ? * COALESCE(rs.score, ?) +
                        ? * COALESCE(p.authenticity_score, 0.5) +
                        ? * (1 - (pe.embedding <=> ?::vector)) +
                        ? * EXP(-EXTRACT(EPOCH FROM (NOW() - p.created_at)) / 3600.0 * LN(2) / ?) AS score
                 FROM posts p
                 INNER JOIN post_embeddings pe ON pe.post_id = p.id
                 LEFT JOIN relationship_scores rs ON rs.viewer_id = ? AND rs.author_id = p.user_id
                 WHERE p.created_at > NOW() - INTERVAL '14 days'
                 ORDER BY score DESC
                 LIMIT ? OFFSET ?",
                [
                    self::W_RELATIONSHIP,
                    self::COLD_START_RELATIONSHIP_SCORE,
                    self::W_AUTHENTICITY,
                    self::W_SEMANTIC,
                    $vectorString,
                    self::W_RECENCY,
                    $halfLife,
                    $viewerId,
                    $perPage + 1,
                    $offset,
                ]
            );
        }

        $hasMore = count($posts) > $perPage;

        if ($hasMore) {
            array_pop($posts);
        }

        return [
            'posts' => $posts,
            'has_more' => $hasMore,
        ];
    }

    private function interestVector(int $viewerId, int $dimensions = 384): array
    {

        $recentPosts = DB::select(
            "SELECT AVG(sub.embedding) AS avg_embedding
             FROM (
                 SELECT pe.embedding
                 FROM interactions i
                 INNER JOIN post_embeddings pe ON pe.post_id = i.post_id
                 WHERE i.user_id = ?
                 ORDER BY i.created_at DESC
                 LIMIT 20
             ) AS sub",
            [$viewerId]
        );

        if (!empty($recentPosts) && $recentPosts[0]->avg_embedding !== null) {
            $parsed = $recentPosts[0]->avg_embedding;

            if (is_string($parsed)) {

                $parsed = trim($parsed, '()');
                $parts = explode(',', $parsed);

                return array_map('floatval', $parts);
            }

            if (is_array($parsed)) {
                return $parsed;
            }
        }

        return array_fill(0, $dimensions, 0.0);
    }
}
