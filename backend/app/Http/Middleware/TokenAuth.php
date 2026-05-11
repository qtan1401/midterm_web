<?php

namespace App\Http\Middleware;

use App\Models\AuthToken;
use Closure;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;

class TokenAuth
{
    public function handle(Request $request, Closure $next)
    {
        $token = $request->bearerToken();

        if (!$token) {
            return response()->json(['message' => 'Unauthenticated'], 401);
        }

        $authToken = AuthToken::with('user')->where('token', $token)->first();

        if (!$authToken) {
            return response()->json(['message' => 'Unauthenticated'], 401);
        }

        // Set user vao request de cac controller dung Auth::user()
        Auth::setUser($authToken->user);

        return $next($request);
    }
}
