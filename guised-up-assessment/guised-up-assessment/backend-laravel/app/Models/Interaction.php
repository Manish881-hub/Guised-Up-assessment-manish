<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class Interaction extends Model
{
    public $timestamps = false; // only created_at, set via useCurrent() in the migration

    protected $fillable = ['user_id', 'post_id', 'type', 'created_at'];

    public function user()
    {
        return $this->belongsTo(User::class);
    }

    public function post()
    {
        return $this->belongsTo(Post::class);
    }
}
