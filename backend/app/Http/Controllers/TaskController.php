<?php

namespace App\Http\Controllers;

use App\Models\Task;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;

class TaskController extends Controller
{
    public function index(Request $request): JsonResponse
    {
        $query = Task::with('project')->where('user_id', Auth::id());

        if ($request->filled('project_id')) {
            $query->where('project_id', $request->project_id);
        }
        if ($request->filled('status')) {
            $query->where('status', $request->status);
        }
        if ($request->filled('priority')) {
            $query->where('priority', $request->priority);
        }
        if ($request->filled('search')) {
            $query->where('title', 'like', '%' . $request->search . '%');
        }

        $tasks = $query->orderByRaw("CASE status WHEN 'todo' THEN 0 WHEN 'in_progress' THEN 1 ELSE 2 END")
                       ->orderBy('due_date')
                       ->get();

        return response()->json($tasks);
    }

    public function store(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'title'       => 'required|string|max:255',
            'description' => 'nullable|string',
            'priority'    => 'nullable|in:low,medium,high',
            'status'      => 'nullable|in:todo,in_progress,done',
            'due_date'    => 'nullable|date',
            'project_id'  => 'nullable|exists:projects,id',
        ]);

        $validated['user_id'] = Auth::id();
        $task = Task::create($validated);
        $task->load('project');

        return response()->json($task, 201);
    }

    public function show(Task $task): JsonResponse
    {
        $this->authorizeTask($task);
        return response()->json($task->load('project'));
    }

    public function update(Request $request, Task $task): JsonResponse
    {
        $this->authorizeTask($task);

        $validated = $request->validate([
            'title'       => 'sometimes|string|max:255',
            'description' => 'nullable|string',
            'priority'    => 'nullable|in:low,medium,high',
            'status'      => 'nullable|in:todo,in_progress,done',
            'due_date'    => 'nullable|date',
            'project_id'  => 'nullable|exists:projects,id',
            'notified'    => 'nullable|boolean',
        ]);

        $task->update($validated);
        $task->load('project');

        return response()->json($task);
    }

    public function destroy(Task $task): JsonResponse
    {
        $this->authorizeTask($task);
        $task->delete();
        return response()->json(['message' => 'Deleted']);
    }

    public function upcoming(): JsonResponse
    {
        $tasks = Task::with('project')
            ->where('user_id', Auth::id())
            ->where('status', '!=', 'done')
            ->whereNotNull('due_date')
            ->where('due_date', '<=', now()->addHours(24))
            ->where('due_date', '>=', now())
            ->get();

        return response()->json($tasks);
    }

    private function authorizeTask(Task $task): void
    {
        if ($task->user_id !== Auth::id()) {
            abort(403, 'Forbidden');
        }
    }
}
