<?php

namespace App\Http\Controllers;

use App\Models\Comment;
use App\Models\Post;
use Illuminate\Http\Request;

class CommentController extends Controller
{
    public function index(int $postId)
    {
        $post = Post::findOrFail($postId);

        $comments = Comment::where('post_id', $postId)
            ->with('user')
            ->orderBy('created_at', 'desc')
            ->limit(50)
            ->get()
            ->map(function ($comment) {
                return [
                    'id' => $comment->id,
                    'user_id' => $comment->user_id,
                    'username' => $comment->user?->name ?? "User #{$comment->user_id}",
                    'body' => $comment->body,
                    'created_at' => $comment->created_at,
                ];
            });

        return response()->json([
            'post' => [
                'id' => $post->id,
                'user_id' => $post->user_id,
                'body' => $post->body,
                'image_url' => $post->image_url,
                'authenticity_score' => $post->authenticity_score,
                'created_at' => $post->created_at,
            ],
            'comments' => $comments,
        ]);
    }

    public function store(Request $request, int $postId)
    {
        $validated = $request->validate([
            'body' => 'required|string|max:1000',
        ]);

        $post = Post::findOrFail($postId);

        $comment = Comment::create([
            'user_id' => $request->user()->id,
            'post_id' => $post->id,
            'body' => $validated['body'],
            'created_at' => now(),
        ]);

        $comment->load('user');

        return response()->json([
            'id' => $comment->id,
            'user_id' => $comment->user_id,
            'username' => $comment->user?->name ?? "User #{$comment->user_id}",
            'body' => $comment->body,
            'created_at' => $comment->created_at,
        ], 201);
    }
}
