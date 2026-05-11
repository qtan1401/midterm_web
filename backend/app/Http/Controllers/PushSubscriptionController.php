<?php

namespace App\Http\Controllers;

use App\Models\PushSubscription;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class PushSubscriptionController extends Controller
{
    public function store(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'endpoint'   => 'required|string',
            'p256dh_key' => 'required|string',
            'auth_token' => 'required|string',
        ]);

        PushSubscription::updateOrCreate(
            ['endpoint' => $validated['endpoint']],
            $validated
        );

        return response()->json(['message' => 'Subscribed'], 201);
    }

    public function destroy(Request $request): JsonResponse
    {
        PushSubscription::where('endpoint', $request->endpoint)->delete();
        return response()->json(['message' => 'Unsubscribed']);
    }
}
