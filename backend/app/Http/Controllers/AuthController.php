<?php

namespace App\Http\Controllers;

use App\Models\AuthToken;
use App\Models\User;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Str;

class AuthController extends Controller
{
    public function register(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'name'     => 'required|string|max:255|unique:users,name',
            'password' => 'required|string|min:3',
        ]);

        $user = User::create([
            'name'     => $validated['name'],
            'email'    => $validated['name'] . '@taskflow.local',
            'password' => Hash::make($validated['password']),
        ]);

        $token = $this->createToken($user->id);

        return response()->json([
            'token' => $token,
            'user'  => ['id' => $user->id, 'name' => $user->name],
        ], 201);
    }

    public function login(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'name'     => 'required|string',
            'password' => 'required|string',
        ]);

        $user = User::where('name', $validated['name'])->first();

        if (!$user || !Hash::check($validated['password'], $user->password)) {
            return response()->json(['message' => 'Tên hoặc mật khẩu không đúng'], 401);
        }

        // Xoa token cu, tao token moi
        AuthToken::where('user_id', $user->id)->delete();
        $token = $this->createToken($user->id);

        return response()->json([
            'token' => $token,
            'user'  => ['id' => $user->id, 'name' => $user->name],
        ]);
    }

    public function logout(Request $request): JsonResponse
    {
        $token = $request->bearerToken();
        if ($token) {
            AuthToken::where('token', $token)->delete();
        }
        return response()->json(['message' => 'Logged out']);
    }

    public function me(Request $request): JsonResponse
    {
        $token = $request->bearerToken();
        if (!$token) {
            return response()->json(['user' => null], 401);
        }

        $authToken = AuthToken::with('user')->where('token', $token)->first();
        if (!$authToken) {
            return response()->json(['user' => null], 401);
        }

        $user = $authToken->user;
        return response()->json(['user' => ['id' => $user->id, 'name' => $user->name]]);
    }

    private function createToken(int $userId): string
    {
        $token = Str::random(64);
        AuthToken::create(['user_id' => $userId, 'token' => $token]);
        return $token;
    }
}
