<?php

use Illuminate\Support\Facades\Route;

Route::get('/auth', function () {
    return file_get_contents(public_path('frontend/auth.html'));
});

Route::get('/{any?}', function () {
    return file_get_contents(public_path('frontend/index.html'));
})->where('any', '.*');
