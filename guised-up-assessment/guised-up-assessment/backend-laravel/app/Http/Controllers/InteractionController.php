<?php

namespace App\Http\Controllers;

use App\Models\Interaction;
use Illuminate\Http\Request;

class InteractionController extends Controller
{
    public function store(Request $request)
    {
        $validated = $request->validate([
            'post_id' => 'required|exists:posts,id',
            'type' => 'required|in:view,reply,reaction',
        ]);

        $interaction = Interaction::create([
            'user_id' => $request->user()->id,
            'post_id' => $validated['post_id'],
            'type' => $validated['type'],
            'created_at' => now(),
        ]);

        // relationship_scores is refreshed by a scheduled command
        // (app/Console/Commands/RefreshRelationshipScores.php), not inline
        // here — keeping this endpoint a cheap single-row insert. See TSD §8.

        return response()->json($interaction, 201);
    }
}
