<?php

namespace App\Http\Controllers;

use App\Models\Interaction;
use Illuminate\Http\Request;

class InteractionController extends Controller
{
    public function store(Request $request)
    {
        $validated = $request->validate([
            'post_id' => 'required|integer|exists:posts,id',
            'type' => 'required|string|in:view,reply,reaction,heart,star,fire',
        ]);

        $interaction = Interaction::create([
            'user_id' => $request->user()->id,
            'post_id' => $validated['post_id'],
            'type' => $validated['type'],
            'created_at' => now(),
        ]);

        return response()->json($interaction, 201);
    }
}
