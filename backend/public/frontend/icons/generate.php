<?php
// Run once to generate icons: php generate.php
function createIcon(int $size, string $filename): void {
    $img = imagecreatetruecolor($size, $size);
    $bg  = imagecolorallocate($img, 99, 102, 241);   // #6366f1
    $fg  = imagecolorallocate($img, 255, 255, 255);
    imagefill($img, 0, 0, $bg);

    // Draw rounded rect feel - just fill with color + text
    $font_size = (int)($size * 0.35);
    $text = 'TF';
    // Center text
    $bbox = imagettfbbox($font_size, 0, __DIR__ . '/../../../../vendor/autoload.php', $text);
    // Fallback: use imagestring
    $char_w = (int)($size * 0.18);
    $char_h = (int)($size * 0.25);
    imagestring($img, 5, (int)($size/2 - $char_w), (int)($size/2 - $char_h), $text, $fg);

    imagepng($img, $filename);
    imagedestroy($img);
    echo "Created: $filename\n";
}

createIcon(192, __DIR__ . '/icon-192.png');
createIcon(512, __DIR__ . '/icon-512.png');
