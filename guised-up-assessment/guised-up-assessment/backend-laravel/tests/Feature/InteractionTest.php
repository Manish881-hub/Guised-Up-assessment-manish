<?php

namespace Tests\Feature;

use App\Models\Post;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class InteractionTest extends TestCase
{
    use RefreshDatabase;

    public function test_authenticated_user_can_log_an_interaction(): void
    {
        $author = User::factory()->create();
        $viewer = User::factory()->create();
        $post = Post::create(['user_id' => $author->id, 'body' => 'Post to react to']);

        $response = $this->actingAs($viewer, 'sanctum')
            ->postJson('/api/interactions', ['post_id' => $post->id, 'type' => 'reaction']);

        $response->assertStatus(201);
        $this->assertDatabaseHas('interactions', [
            'user_id' => $viewer->id,
            'post_id' => $post->id,
            'type' => 'reaction',
        ]);
    }

    public function test_interaction_type_must_be_valid(): void
    {
        $viewer = User::factory()->create();
        $post = Post::create(['user_id' => $viewer->id, 'body' => 'Post']);

        $response = $this->actingAs($viewer, 'sanctum')
            ->postJson('/api/interactions', ['post_id' => $post->id, 'type' => 'invalid_type']);

        $response->assertStatus(422);
    }
}
