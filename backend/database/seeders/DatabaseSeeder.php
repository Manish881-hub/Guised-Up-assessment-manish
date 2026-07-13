<?php

namespace Database\Seeders;

use App\Models\Interaction;
use App\Models\Post;
use App\Models\User;
use App\Services\EmbeddingClient;
use Illuminate\Database\Seeder;
use Illuminate\Support\Facades\DB;

class DatabaseSeeder extends Seeder
{
    public function run(): void
    {
        $users = [];
        $names = ['Alice', 'Bob', 'Charlie', 'Diana', 'Eve', 'Frank', 'Grace', 'Hank'];

        foreach ($names as $name) {
            $users[] = User::factory()->create([
                'name' => $name,
                'email' => strtolower($name) . '@example.com',
            ]);
        }

        $postsData = [
            ['user' => 0, 'body' => 'Just scored these vintage Levi 501s from a thrift store in Brooklyn. Raw denim, perfect fade potential. Anyone else into vintage denim?'],
            ['user' => 1, 'body' => 'Fit check: Oversized blazer + wide-leg trousers + chunky sneakers. Going for that relaxed tailoring vibe. Thoughts?'],
            ['user' => 2, 'body' => 'Finally found a pair of New Balance 993s in my size. The grey dad shoe supremacy continues.'],
            ['user' => 3, 'body' => 'Tried my hand at upcycling an old band tee into a crop top. Turned out better than expected! #DIY #SustainableFashion'],
            ['user' => 4, 'body' => 'Unpopular opinion: skinny jeans are making a comeback. Saw three people wearing them today and honestly? They looked good.'],
            ['user' => 5, 'body' => 'Air Max 95s are the greatest sneaker silhoutte ever designed. I will die on this hill.'],
            ['user' => 6, 'body' => 'Layered a turtleneck under a slip dress with combat boots. Going for that 90s grunge meets modern minimalism.'],
            ['user' => 7, 'body' => 'Whole fit from the thrift store for under $40. Oversized cardigan, leather skirt, and beat-up Docs. Thrifting is the future.'],
            ['user' => 0, 'body' => 'Anyone know where to find good quality basics that arent fast fashion? Looking for plain tees that dont lose shape after three washes.'],
            ['user' => 1, 'body' => 'Sneaker wheel update: added the Asics Kayano 14 in the cream/purple colorway. These might be my new daily drivers.'],
            ['user' => 2, 'body' => 'Cargo pants are back and Im honestly here for it. The extra pocket space is game changing for festivals.'],
            ['user' => 3, 'body' => 'Just got my first pair of platform Doc Martens. Breaking them in is going to be painful but worth it.'],
            ['user' => 4, 'body' => 'Summer fit formula: linen pants + white tank + fisherman sandals. Simple, breathable, effortless.'],
            ['user' => 5, 'body' => 'The resale market for vintage band tees is getting out of hand. $80 for a worn-out Nirvana shirt? Come on.'],
            ['user' => 6, 'body' => 'Found this incredible oversized leather jacket at an estate sale. Smells like grandpa but fits like a dream.'],
            ['user' => 7, 'body' => 'Minimalist wardrobe update: down to 30 pieces total and Ive never felt more free. Capsule wardrobe changed my life.'],
            ['user' => 0, 'body' => 'Yall sleeping on corduroy. Just got a pair of brown corduroy trousers and they are SO versatile for fall.'],
            ['user' => 1, 'body' => 'Went to the flagship Supreme store today. Line was insane but copped a decent hoodie. Was it worth 3 hours? Debatable.'],
            ['user' => 2, 'body' => 'Stitch Fix sent me the worst box yet. A polyester blazer that feels like a trash bag. Canceled my subscription immediately.'],
            ['user' => 3, 'body' => 'Color analysis changed my perspective on fashion. Turns out Im a Soft Autumn and now everything in my closet makes sense.'],
        ];

        $embeddingClient = new EmbeddingClient();

        foreach ($postsData as $data) {
            $post = Post::create([
                'user_id' => $users[$data['user']]->id,
                'body' => $data['body'],
                'image_url' => null,
                'authenticity_score' => 0.8,
            ]);

            $embedding = $embeddingClient->embed($post->body);

            if ($embedding !== null) {
                $vector = $embedding['embedding'] ?? $embedding;
                $flat = (isset($vector[0]) && is_array($vector[0])) ? $vector[0] : $vector;
                if ($flat !== null) {
                    $vectorString = '[' . implode(',', $flat) . ']';
                    DB::statement(
                        'INSERT INTO post_embeddings (post_id, embedding) VALUES (?, ?::vector)',
                        [$post->id, $vectorString]
                    );
                }
            }
        }

        $interactionTypes = ['view', 'reply', 'reaction'];
        for ($i = 0; $i < 30; $i++) {
            $viewer = $users[array_rand($users)];
            $post = Post::inRandomOrder()->first();

            if ($viewer->id === $post->user_id) {
                continue;
            }

            Interaction::create([
                'user_id' => $viewer->id,
                'post_id' => $post->id,
                'type' => $interactionTypes[array_rand($interactionTypes)],
                'created_at' => now()->subHours(rand(1, 72)),
            ]);
        }

        $defaultScore = 0.1;
        foreach ($users as $viewer) {
            foreach ($users as $author) {
                if ($viewer->id === $author->id) {
                    continue;
                }

                $interactionScore = Interaction::where('user_id', $viewer->id)
                    ->whereIn('post_id', Post::where('user_id', $author->id)->pluck('id'))
                    ->count() * 0.3;

                $score = max($defaultScore, min(1.0, $defaultScore + $interactionScore));

                DB::table('relationship_scores')->insert([
                    'viewer_id' => $viewer->id,
                    'author_id' => $author->id,
                    'score' => $score,
                    'updated_at' => now(),
                ]);
            }
        }
    }
}
