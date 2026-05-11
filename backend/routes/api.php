<?php

use App\Http\Controllers\AuthController;
use App\Http\Controllers\ProjectController;
use App\Http\Controllers\PushSubscriptionController;
use App\Http\Controllers\TaskController;
use Illuminate\Support\Facades\Route;

// Auth routes (public)
Route::post('auth/register', [AuthController::class, 'register']);
Route::post('auth/login',    [AuthController::class, 'login']);
Route::post('auth/logout',   [AuthController::class, 'logout']);
Route::get('auth/me',        [AuthController::class, 'me']);

// Protected routes - dung token.auth middleware
Route::middleware('token.auth')->group(function () {
    Route::apiResource('projects', ProjectController::class);

    Route::get('tasks/upcoming', [TaskController::class, 'upcoming']);
    Route::apiResource('tasks', TaskController::class);

    Route::post('push-subscriptions',   [PushSubscriptionController::class, 'store']);
    Route::delete('push-subscriptions', [PushSubscriptionController::class, 'destroy']);
});
