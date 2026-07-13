<?php

namespace App\Services;

use Illuminate\Support\Facades\DB;

/**
 * Implements the ranking algorithm from TSD §5:
 *   score = 0.30 * relationship + 0.25 * authenticity + 0.25 * semantic + 0.20 * recency
 *
 * Done as one SQL query (not N+1 PHP-side scoring) so it stays cheap at the
 * feed endpoint's request volume.
 */
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
        $interestVector = $this->interestVector($viewerId);
        $offset = ($page - 1) * $perPage;

        // pgvector's `<=>` operator returns cosine *distance* (0 = identical),
        // so similarity = 1 - distance.
        $rows = DB::select('
            SELECT
                posts.id,
                posts.user_id,
                posts.body,
                posts.image_url,
                posts.created_at,
                (
                    :w_relationship * COALESCE(rs.score, :cold_start)
                    + :w_authenticity * COALESCE(posts.authenticity_score, 0.5)
                    + :w_semantic * (1 - (pe.embedding <=> :interest_vector::vector))
                    + :w_recency * EXP(
                        -EXTRACT(EPOCH FROM (NOW() - posts.created_at)) / 3600.0
                        * LN(2) / :half_life
                      )
                ) AS score
            FROM posts
            JOIN post_embeddings pe ON pe.post_id = posts.id
            LEFT JOIN relationship_scores rs
                ON rs.viewer_id = :viewer_id AND rs.author_id = posts.user_id
            WHERE posts.created_at > NOW() - (:window_days || \' days\')::interval
            ORDER BY score DESC
            LIMIT :limit OFFSET :offset
        ', [
            'w_relationship' => self::W_RELATIONSHIP,
            'w_authenticity' => self::W_AUTHENTICITY,
            'w_semantic' => self::W_SEMANTIC,
            'w_recency' => self::W_RECENCY,
            'cold_start' => self::COLD_START_RELATIONSHIP_SCORE,
            'half_life' => self::RECENCY_HALF_LIFE_HOURS,
            'window_days' => self::CANDIDATE_WINDOW_DAYS,
            'interest_vector' => '[' . implode(',', $interestVector) . ']',
            'viewer_id' => $viewerId,
            'limit' => $perPage,
            'offset' => $offset,
        ]);

        return $rows;
    }

    /**
     * The viewer's "interest vector": mean embedding of the last 20 posts they
     * interacted with. Falls back to a zero vector for brand-new users, which
     * makes semantic similarity a neutral 0 rather than crashing the query.
     */
    private function interestVector(int $viewerId, int $dimensions = 384): array
    {
        $row = DB::selectOne('
            SELECT AVG(pe.embedding) AS avg_embedding
            FROM interactions i
            JOIN post_embeddings pe ON pe.post_id = i.post_id
            WHERE i.user_id = :viewer_id
            ORDER BY i.created_at DESC
            LIMIT 20
        ', ['viewer_id' => $viewerId]);

        if ($row && $row->avg_embedding) {
            return json_decode($row->avg_embedding, true);
        }

        return array_fill(0, $dimensions, 0.0);
    }
}
