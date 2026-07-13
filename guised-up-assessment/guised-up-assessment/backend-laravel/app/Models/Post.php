<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class Post extends Model
{
    protected $fillable = ['user_id', 'body', 'image_url', 'authenticity_score'];

    public function user()
    {
        return $this->belongsTo(User::class);
    }

    public function interactions()
    {
        return $this->hasMany(Interaction::class);
    }
}
