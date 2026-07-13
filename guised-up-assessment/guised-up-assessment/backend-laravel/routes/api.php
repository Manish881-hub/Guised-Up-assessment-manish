<?php

use App\Http\Controllers\AuthController;
use App\Http\Controllers\FeedController;
use App\Http\Controllers\InteractionController;
use App\Http\Controllers\PostController;
use App\Http\Controllers\SearchController;
use Illuminate\Support\Facades\Route;

Route::post('/register', [AuthController::class, 'register']);
Route::post('/login', [AuthController::class, 'login']);

Route::middleware('auth:sanctum')->group(function () {
    Route::post('/posts', [PostController::class, 'store']);
    Route::get('/feed', [FeedController::class, 'index']);
    Route::get('/search', [SearchController::class, 'search']);
    Route::post('/interactions', [InteractionController::class, 'store']);
});
