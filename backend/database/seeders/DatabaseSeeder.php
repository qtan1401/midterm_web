<?php

namespace Database\Seeders;

use App\Models\Project;
use App\Models\Task;
use Illuminate\Database\Seeder;

class DatabaseSeeder extends Seeder
{
    public function run(): void
    {
        $p1 = Project::create(['name' => 'Công việc', 'color' => '#6366f1']);
        $p2 = Project::create(['name' => 'Cá nhân',   'color' => '#10b981']);
        $p3 = Project::create(['name' => 'Học tập',   'color' => '#f59e0b']);

        $tasks = [
            ['title' => 'Hoàn thành báo cáo tháng',    'priority' => 'high',   'status' => 'in_progress', 'due_date' => now()->addHours(3),  'project_id' => $p1->id],
            ['title' => 'Review code pull request',     'priority' => 'medium', 'status' => 'todo',        'due_date' => now()->addHours(5),  'project_id' => $p1->id],
            ['title' => 'Họp team buổi chiều',          'priority' => 'high',   'status' => 'todo',        'due_date' => now()->addHours(2),  'project_id' => $p1->id],
            ['title' => 'Mua đồ ăn',                   'priority' => 'low',    'status' => 'todo',        'due_date' => now()->addHours(6),  'project_id' => $p2->id],
            ['title' => 'Tập thể dục',                 'priority' => 'medium', 'status' => 'done',        'due_date' => now()->subHours(1),  'project_id' => $p2->id],
            ['title' => 'Ôn tập Laravel',              'priority' => 'high',   'status' => 'in_progress', 'due_date' => now()->addDays(1),   'project_id' => $p3->id],
            ['title' => 'Làm bài tập PWA',             'priority' => 'high',   'status' => 'todo',        'due_date' => now()->addDays(2),   'project_id' => $p3->id],
            ['title' => 'Đọc sách Clean Code',         'priority' => 'low',    'status' => 'todo',        'due_date' => now()->addDays(5),   'project_id' => $p3->id],
            ['title' => 'Task quá hạn cần xử lý',      'priority' => 'high',   'status' => 'todo',        'due_date' => now()->subDays(1),   'project_id' => $p1->id],
            ['title' => 'Cập nhật dependencies',       'priority' => 'medium', 'status' => 'todo',        'due_date' => now()->addDays(7),   'project_id' => $p1->id],
        ];

        foreach ($tasks as $task) {
            Task::create($task);
        }
    }
}
