<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

return new class extends Migration
{
    public function up(): void
    {
        DB::statement("ALTER TABLE interactions DROP CONSTRAINT IF EXISTS interactions_type_check");
        DB::statement("ALTER TABLE interactions ALTER COLUMN type TYPE varchar(20)");
    }

    public function down(): void
    {
        DB::statement("ALTER TABLE interactions ALTER COLUMN type TYPE varchar(20) USING type::varchar(20)");
    }
};
