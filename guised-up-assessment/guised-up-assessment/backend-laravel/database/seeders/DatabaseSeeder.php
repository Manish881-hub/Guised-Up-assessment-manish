<?php

namespace Database\Seeders;

use App\Models\Interaction;
use App\Models\Post;
use App\Models\User;
use Illuminate\Database\Seeder;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Hash;

class DatabaseSeeder extends Seeder
{
    public function run(): void
    {
        $alice = User::create([
            'name' => 'Alice Chen',
            'email' => 'alice@example.com',
            'password' => Hash::make('password123'),
        ]);

        $bob = User::create([
            'name' => 'Bob Fernandes',
            'email' => 'bob@example.com',
            'password' => Hash::make('password123'),
        ]);

        $posts = [];
        foreach ([$alice, $bob] as $user) {
            for ($i = 0; $i < 5; $i++) {
                $posts[] = Post::create([
                    'user_id' => $user->id,
                    'body' => "Sample post #{$i} from {$user->name} — unfiltered thoughts about the week.",
                    'authenticity_score' => 0.7,
                ]);
            }
        }

        // A zero vector placeholder so seeded data works without the Python
        // sidecar running; real embeddings come from the /embed endpoint
        // once you POST /api/posts against a live embedding service.
        foreach ($posts as $post) {
            $zeroVector = '[' . implode(',', array_fill(0, 384, 0.0)) . ']';
            DB::statement(
                'INSERT INTO post_embeddings (post_id, embedding) VALUES (:id, :embedding::vector)',
                ['id' => $post->id, 'embedding' => $zeroVector]
            );
        }

        // A few cross interactions so D1-D4 SQL queries have data to return.
        Interaction::create(['user_id' => $bob->id, 'post_id' => $posts[0]->id, 'type' => 'view', 'created_at' => now()]);
        Interaction::create(['user_id' => $bob->id, 'post_id' => $posts[0]->id, 'type' => 'reaction', 'created_at' => now()]);
        Interaction::create(['user_id' => $alice->id, 'post_id' => $posts[5]->id, 'type' => 'view', 'created_at' => now()]);
    }
}
