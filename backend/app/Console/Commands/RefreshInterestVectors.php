<?php

namespace App\Console\Commands;

use App\Services\RealConnectionsRankingService;
use Illuminate\Console\Command;

class RefreshInterestVectors extends Command
{
    protected $signature = 'feed:refresh-interest-vectors';
    protected $description = 'Recompute interest vectors from recent meaningful interactions';

    public function handle(RealConnectionsRankingService $ranking): int
    {
        $userIds = $ranking->usersWithInteractions();

        if (empty($userIds)) {
            $this->info('No users with interactions found.');
            return self::SUCCESS;
        }

        $bar = $this->output->createProgressBar(count($userIds));
        $bar->start();

        foreach ($userIds as $row) {
            $ranking->persistInterestVector($row->id);
            $bar->advance();
        }

        $bar->finish();
        $this->newLine();
        $this->info('Interest vectors updated for ' . count($userIds) . ' users.');

        return self::SUCCESS;
    }
}
