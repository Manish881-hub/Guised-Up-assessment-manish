<?php

namespace App\Console\Commands;

use Illuminate\Console\Command;
use Illuminate\Support\Facades\DB;

/**
 * Recomputes relationship_scores from raw interactions, with a 30-day
 * recency-weighted decay so old bursts of activity don't permanently
 * dominate the relationship signal. Scheduled every 15 minutes in
 * routes/console.php or app/Console/Kernel.php. See TSD §3, §8.
 */
class RefreshRelationshipScores extends Command
{
    protected $signature = 'feed:refresh-relationship-scores';
    protected $description = 'Recompute the relationship_scores table from recent interactions';

    public function handle(): int
    {
        DB::statement('
            INSERT INTO relationship_scores (viewer_id, author_id, score, updated_at)
            SELECT
                i.user_id AS viewer_id,
                p.user_id AS author_id,
                LEAST(
                    1.0,
                    SUM(
                        CASE i.type
                            WHEN \'view\' THEN 1
                            WHEN \'reply\' THEN 5
                            WHEN \'reaction\' THEN 2
                        END
                        * EXP(-EXTRACT(EPOCH FROM (NOW() - i.created_at)) / 86400.0 / 30)
                    ) / 20.0
                ) AS score,
                NOW() AS updated_at
            FROM interactions i
            JOIN posts p ON p.id = i.post_id
            WHERE i.created_at > NOW() - INTERVAL \'30 days\'
              AND i.user_id != p.user_id
            GROUP BY i.user_id, p.user_id
            ON CONFLICT (viewer_id, author_id)
            DO UPDATE SET score = EXCLUDED.score, updated_at = EXCLUDED.updated_at
        ');

        $this->info('relationship_scores refreshed.');

        return self::SUCCESS;
    }
}
