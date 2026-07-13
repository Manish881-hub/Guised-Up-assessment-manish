<?php

namespace Database\Seeders;

use App\Models\User;
use Illuminate\Database\Seeder;

class DatabaseSeeder extends Seeder
{
    public function run(): void
    {
        User::factory()->create([
            'name' => 'Alice',
            'email' => 'alice@example.com',
        ]);

        User::factory()->create([
            'name' => 'Bob',
            'email' => 'bob@example.com',
        ]);
    }
}
