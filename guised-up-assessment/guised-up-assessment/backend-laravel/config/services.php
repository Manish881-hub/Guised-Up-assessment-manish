<?php

return [
    'embedding' => [
        'url' => env('EMBEDDING_SERVICE_URL', 'http://localhost:8001'),
        'dimensions' => env('EMBEDDING_DIMENSIONS', 384),
    ],
];
