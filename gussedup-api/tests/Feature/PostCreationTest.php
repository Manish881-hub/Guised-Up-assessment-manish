<?php

namespace Tests\Feature;

use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use App\Services\EmbeddingClient;
use Tests\TestCase;

class PostCreationTest extends TestCase
{
    use RefreshDatabase;

    public function test_authenticated_user_can_create_a_post(): void
    {
        $mock = $this->createMock(EmbeddingClient::class);
        $mock->method('embed')->willReturn(array_fill(0, 384, 0.01));
        $this->instance(EmbeddingClient::class, $mock);

        $user = User::factory()->create();

        $response = $this->actingAs($user, 'sanctum')->postJson('/api/posts', [
            'body' => 'This is a test post body.',
        ]);

        $response->assertStatus(201)
            ->assertJson([
                'body' => 'This is a test post body.',
                'user_id' => $user->id,
            ]);

        $this->assertDatabaseHas('posts', [
            'body' => 'This is a test post body.',
            'user_id' => $user->id,
        ]);
    }

    public function test_unauthenticated_user_cannot_create_a_post(): void
    {
        $response = $this->postJson('/api/posts', [
            'body' => 'This should not work.',
        ]);

        $response->assertStatus(401);
    }

    public function test_post_requires_a_body(): void
    {
        $user = User::factory()->create();

        $response = $this->actingAs($user, 'sanctum')->postJson('/api/posts', []);

        $response->assertStatus(422)
            ->assertJsonValidationErrors(['body']);
    }
}
