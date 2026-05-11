<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class Task extends Model
{
    protected $fillable = [
        'user_id', 'project_id', 'title', 'description',
        'priority', 'status', 'due_date', 'notified'
    ];

    protected $casts = [
        'due_date' => 'datetime',
        'notified' => 'boolean',
    ];

    public function project(): BelongsTo
    {
        return $this->belongsTo(Project::class);
    }
}
