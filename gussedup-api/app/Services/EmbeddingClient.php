<?php

namespace App\Services;

use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Log;

class EmbeddingClient
{
    private string $baseUrl;

    public function __construct(?string $baseUrl = null)
    {
        $this->baseUrl = $baseUrl ?? config('services.embedding.url', 'http://localhost:8001');
    }

    public function embed(string $text): ?array
    {
        try {
            $response = Http::timeout(3)->post("{$this->baseUrl}/embed", [
                'text' => $text,
            ]);

            if ($response->successful()) {
                return $response->json();
            }

            Log::warning('Embedding service returned non-success status', [
                'status' => $response->status(),
                'body' => $response->body(),
            ]);

            return null;
        } catch (\Throwable $e) {
            Log::warning('Embedding service request failed', [
                'error' => $e->getMessage(),
            ]);

            return null;
        }
    }
}
