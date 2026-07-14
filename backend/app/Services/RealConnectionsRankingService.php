<?php

namespace App\Services;

use Illuminate\Support\Facades\DB;

class RealConnectionsRankingService
{
    private const DIMENSIONS = 384;
    private const CANDIDATE_WINDOW_DAYS = 14;
    private const RECENCY_HALF_LIFE_HOURS = 24;
    private const INTEREST_INTERACTION_LIMIT = 50;
    private const INTEREST_WINDOW_DAYS = 30;

    // Warm-start weights
    private const W_RELATIONSHIP = 0.35;
    private const W_AUTHENTICITY = 0.25;
    private const W_SEMANTIC = 0.25;
    private const W_RECENCY = 0.15;

    // Cold-start weights (no interaction history)
    private const COLD_W_RECENCY = 0.60;
    private const COLD_W_AUTHENTICITY = 0.40;

    private const COLD_START_RELATIONSHIP_FLOOR = 0.05;

    public function rankedFeed(int $viewerId, int $page = 1, int $perPage = 20): array
    {
        $offset = ($page - 1) * $perPage;
        $interest = $this->interestVector($viewerId);
        $halfLife = self::RECENCY_HALF_LIFE_HOURS;

        $isColdStart = $this->isZeroVector($interest);

        if ($isColdStart) {
            $weightRel = 0;
            $weightAut = self::COLD_W_AUTHENTICITY;
            $weightSem = 0;
            $weightRec = self::COLD_W_RECENCY;

            $posts = DB::select(
                "SELECT p.id, p.user_id, p.body, p.image_url, p.authenticity_score, p.created_at,
                        ? * COALESCE(p.authenticity_score, 0.5) +
                        ? * EXP(-EXTRACT(EPOCH FROM (NOW() - p.created_at)) / 3600.0 * LN(2) / ?) AS score
                 FROM posts p
                 WHERE p.created_at > NOW() - INTERVAL '{$this->candidateWindow()}'
                 ORDER BY score DESC
                 LIMIT ? OFFSET ?",
                [
                    $weightAut,
                    $weightRec,
                    $halfLife,
                    $perPage + 1,
                    $offset,
                ]
            );
        } else {
            $vectorString = '[' . implode(',', $interest) . ']';

            $posts = DB::select(
                "SELECT p.id, p.user_id, p.body, p.image_url, p.authenticity_score, p.created_at,
                        ? * COALESCE(rs.score, ?) +
                        ? * COALESCE(p.authenticity_score, 0.5) +
                        ? * COALESCE(1 - (pe.embedding <=> ?::vector), 0) +
                        ? * EXP(-EXTRACT(EPOCH FROM (NOW() - p.created_at)) / 3600.0 * LN(2) / ?) AS score
                 FROM posts p
                 LEFT JOIN post_embeddings pe ON pe.post_id = p.id
                 LEFT JOIN relationship_scores rs ON rs.viewer_id = ? AND rs.author_id = p.user_id
                 WHERE p.created_at > NOW() - INTERVAL '{$this->candidateWindow()}'
                 ORDER BY score DESC
                 LIMIT ? OFFSET ?",
                [
                    self::W_RELATIONSHIP,
                    self::COLD_START_RELATIONSHIP_FLOOR,
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

        $posts = $this->applyAuthorDiversity($posts);

        $hasMore = count($posts) > $perPage;
        if ($hasMore) {
            array_pop($posts);
        }

        return [
            'posts' => $posts,
            'has_more' => $hasMore,
        ];
    }

    public function personalisedSearch(int $viewerId, array $queryEmbedding, int $limit = 10): array
    {
        $interest = $this->interestVector($viewerId);

        if ($this->isZeroVector($interest)) {
            return DB::select(
                "SELECT p.id, p.user_id, p.body, p.image_url, p.authenticity_score, p.created_at,
                        1 - (pe.embedding <=> ?::vector) AS similarity,
                        0 AS interest_alignment,
                        1 - (pe.embedding <=> ?::vector) AS combined_score
                 FROM posts p
                 INNER JOIN post_embeddings pe ON pe.post_id = p.id
                 ORDER BY similarity DESC
                 LIMIT ?",
                [
                    '[' . implode(',', $queryEmbedding) . ']',
                    '[' . implode(',', $queryEmbedding) . ']',
                    $limit,
                ]
            );
        }

        $interestStr = '[' . implode(',', $interest) . ']';
        $queryStr = '[' . implode(',', $queryEmbedding) . ']';

        return DB::select(
            "SELECT p.id, p.user_id, p.body, p.image_url, p.authenticity_score, p.created_at,
                    1 - (pe.embedding <=> ?::vector) AS similarity,
                    1 - (pe.embedding <=> ?::vector) AS interest_alignment,
                    0.7 * (1 - (pe.embedding <=> ?::vector)) +
                    0.3 * (1 - (pe.embedding <=> ?::vector)) AS combined_score
             FROM posts p
             INNER JOIN post_embeddings pe ON pe.post_id = p.id
             ORDER BY combined_score DESC
             LIMIT ?",
            [
                $queryStr,
                $interestStr,
                $queryStr,
                $interestStr,
                $limit,
            ]
        );
    }

    public function interestVector(int $viewerId): array
    {
        $cached = DB::select(
            "SELECT vector FROM interest_vectors WHERE user_id = ?",
            [$viewerId]
        );

        if (!empty($cached)) {
            $parsed = $cached[0]->vector;
            if (is_string($parsed)) {
                $parsed = trim($parsed, '()');
                $parts = explode(',', $parsed);
                return array_map('floatval', $parts);
            }
            if (is_array($parsed)) {
                return $parsed;
            }
        }

        return $this->computeInterestVector($viewerId);
    }

    public function computeInterestVector(int $viewerId): array
    {
        $rows = DB::select(
            "SELECT pe.embedding, i.type
             FROM interactions i
             INNER JOIN post_embeddings pe ON pe.post_id = i.post_id
             WHERE i.user_id = ?
               AND i.type IN ('reply', 'reaction')
               AND i.created_at > NOW() - INTERVAL '{$this->interestWindow()}'
             ORDER BY i.created_at DESC
             LIMIT ?",
            [$viewerId, self::INTEREST_INTERACTION_LIMIT]
        );

        if (empty($rows)) {
            return array_fill(0, self::DIMENSIONS, 0.0);
        }

        $weightedSum = array_fill(0, self::DIMENSIONS, 0.0);
        $totalWeight = 0.0;

        foreach ($rows as $row) {
            $weight = $this->typeWeight($row->type);
            $embedding = $row->embedding;

            if (is_string($embedding)) {
                $embedding = trim($embedding, '()');
                $parts = explode(',', $embedding);
                $embedding = array_map('floatval', $parts);
            }

            if (!is_array($embedding)) {
                continue;
            }

            for ($i = 0; $i < self::DIMENSIONS; $i++) {
                $weightedSum[$i] += ($embedding[$i] ?? 0.0) * $weight;
            }
            $totalWeight += $weight;
        }

        if ($totalWeight <= 0) {
            return array_fill(0, self::DIMENSIONS, 0.0);
        }

        $magnitude = 0.0;
        for ($i = 0; $i < self::DIMENSIONS; $i++) {
            $weightedSum[$i] /= $totalWeight;
            $magnitude += $weightedSum[$i] * $weightedSum[$i];
        }
        $magnitude = sqrt($magnitude);

        if ($magnitude < 1e-10) {
            return array_fill(0, self::DIMENSIONS, 0.0);
        }

        for ($i = 0; $i < self::DIMENSIONS; $i++) {
            $weightedSum[$i] /= $magnitude;
        }

        return $weightedSum;
    }

    public function persistInterestVector(int $viewerId): void
    {
        $vector = $this->computeInterestVector($viewerId);

        if ($this->isZeroVector($vector)) {
            DB::delete("DELETE FROM interest_vectors WHERE user_id = ?", [$viewerId]);
            return;
        }

        $vectorStr = '[' . implode(',', $vector) . ']';

        DB::statement(
            "INSERT INTO interest_vectors (user_id, vector, updated_at)
             VALUES (?, ?::vector, NOW())
             ON CONFLICT (user_id)
             DO UPDATE SET vector = EXCLUDED.vector, updated_at = NOW()",
            [$viewerId, $vectorStr]
        );
    }

    private function typeWeight(string $type): float
    {
        return match ($type) {
            'reply' => 3.0,
            'reaction' => 1.5,
            default => 1.0,
        };
    }

    private function applyAuthorDiversity(array $posts): array
    {
        if (empty($posts)) {
            return $posts;
        }

        $decayFactor = 0.5;
        $floor = 0.3;

        usort($posts, function ($a, $b) {
            return ($b->score ?? 0) <=> ($a->score ?? 0);
        });

        $authorCounts = [];

        foreach ($posts as $post) {
            $authorId = $post->user_id;
            $position = $authorCounts[$authorId] ?? 0;
            $authorCounts[$authorId] = $position + 1;

            $multiplier = (1.0 - $floor) * pow($decayFactor, $position) + $floor;
            $post->score = ($post->score ?? 0) * $multiplier;
            $post->author_diversity_multiplier = $multiplier;
        }

        usort($posts, function ($a, $b) {
            return ($b->score ?? 0) <=> ($a->score ?? 0);
        });

        return $posts;
    }

    private function isZeroVector(array $vector): bool
    {
        foreach ($vector as $v) {
            if (abs($v) > 1e-10) {
                return false;
            }
        }
        return true;
    }

    public function usersWithInteractions(): array
    {
        return DB::select(
            "SELECT DISTINCT i.user_id AS id
             FROM interactions i
             WHERE i.type IN ('reply', 'reaction')
               AND i.created_at > NOW() - INTERVAL '{$this->interestWindow()}'"
        );
    }

    private function candidateWindow(): string
    {
        return self::CANDIDATE_WINDOW_DAYS . ' days';
    }

    private function interestWindow(): string
    {
        return self::INTEREST_WINDOW_DAYS . ' days';
    }
}
