<?php

namespace Tests\Feature;

use App\Models\Post;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Tests\TestCase;

class FeedTest extends TestCase
{
    use RefreshDatabase;

    private function seedPostWithEmbedding(User $user): Post
    {
        $post = Post::create([
            'user_id' => $user->id,
            'body' => 'Test post body for feed.',
            'authenticity_score' => 0.6,
        ]);

        $zeros = array_fill(0, 384, 0.0);
        $vectorString = '[' . implode(',', $zeros) . ']';

        DB::statement(
            'INSERT INTO post_embeddings (post_id, embedding) VALUES (?, ?::vector)',
            [$post->id, $vectorString]
        );

        return $post;
    }

    public function test_feed_returns_paginated_results_for_authenticated_user(): void
    {
        $user = User::factory()->create();
        $this->seedPostWithEmbedding($user);
        $this->seedPostWithEmbedding($user);

        $response = $this->actingAs($user, 'sanctum')->getJson('/api/feed?page=1');

        $response->assertStatus(200)
            ->assertJsonStructure([
                'data' => [],
                'meta' => ['page', 'per_page', 'has_more'],
            ]);
    }

    public function test_feed_rejects_unauthenticated_requests(): void
    {
        $response = $this->getJson('/api/feed');

        $response->assertStatus(401);
    }
}
