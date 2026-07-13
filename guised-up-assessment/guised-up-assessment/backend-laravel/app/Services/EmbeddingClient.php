<?php

namespace App\Services;

use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Log;

/**
 * Thin client for the Python embedding sidecar (embedding-service-python/).
 * Kept as its own class so swapping to an OpenAI/Cohere embedding endpoint
 * later is a one-file change (see TSD §8).
 */
class EmbeddingClient
{
    public function __construct(
        private readonly string $baseUrl = '',
    ) {
        $this->baseUrl = $baseUrl ?: config('services.embedding.url', 'http://localhost:8001');
    }

    /**
     * Returns a 384-dim float vector, or null if the sidecar is unreachable.
     * Callers must not block the write path on this — see PostController.
     */
    public function embed(string $text): ?array
    {
        try {
            $response = Http::timeout(3)->post("{$this->baseUrl}/embed", ['text' => $text]);

            if ($response->successful()) {
                return $response->json('embedding');
            }

            Log::warning('Embedding service returned non-200', ['status' => $response->status()]);
        } catch (\Throwable $e) {
            Log::warning('Embedding service unreachable, will retry via queued job', [
                'error' => $e->getMessage(),
            ]);
        }

        return null;
    }
}
