<?php

namespace App\Http\Controllers;

use App\Models\Project;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;

class ProjectController extends Controller
{
    public function index(): JsonResponse
    {
        return response()->json(
            Project::withCount('tasks')
                ->where('user_id', Auth::id())
                ->orderBy('created_at', 'desc')
                ->get()
        );
    }

    public function store(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'name'  => 'required|string|max:255',
            'color' => 'nullable|string|max:7',
        ]);

        $validated['user_id'] = Auth::id();
        $project = Project::create($validated);

        return response()->json($project, 201);
    }

    public function update(Request $request, Project $project): JsonResponse
    {
        $this->authorizeProject($project);

        $validated = $request->validate([
            'name'  => 'sometimes|string|max:255',
            'color' => 'sometimes|string|max:7',
        ]);

        $project->update($validated);
        return response()->json($project);
    }

    public function destroy(Project $project): JsonResponse
    {
        $this->authorizeProject($project);
        $project->delete();
        return response()->json(['message' => 'Deleted']);
    }

    private function authorizeProject(Project $project): void
    {
        if ($project->user_id !== Auth::id()) {
            abort(403, 'Forbidden');
        }
    }
}
