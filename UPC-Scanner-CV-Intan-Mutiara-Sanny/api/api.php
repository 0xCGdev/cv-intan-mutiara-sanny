<?php

// Proxy PHP: browser -> PHP -> Google Apps Script.
// HTML boleh di-host di hosting/static hosting.
const APPS_SCRIPT_URL = 'https://script.google.com/macros/s/AKfycbx5CTEKU0ewdtYPhbFHxNJSM5T-anCpcsb_o4WSG3uz8xsP5zK0VbLNG72OKQbs6W49/exec';

header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store, no-cache, must-revalidate, max-age=0');
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: POST, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type, Accept');

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(204);
    exit;
}

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    http_response_code(405);
    echo json_encode([
        'success' => false,
        'code' => 'METHOD_NOT_ALLOWED',
        'message' => 'Gunakan POST.'
    ]);
    exit;
}

$raw = file_get_contents('php://input');
if (!$raw) {
    http_response_code(400);
    echo json_encode([
        'success' => false,
        'code' => 'EMPTY_BODY',
        'message' => 'Request kosong.'
    ]);
    exit;
}

$ch = curl_init(APPS_SCRIPT_URL);

curl_setopt_array($ch, [
    CURLOPT_POST => true,
    CURLOPT_POSTFIELDS => $raw,
    CURLOPT_HTTPHEADER => [
        'Content-Type: application/json',
        'Accept: application/json'
    ],
    CURLOPT_RETURNTRANSFER => true,
    CURLOPT_FOLLOWLOCATION => true,
    CURLOPT_CONNECTTIMEOUT => 15,
    CURLOPT_TIMEOUT => 30,
    CURLOPT_SSL_VERIFYPEER => true,
    CURLOPT_SSL_VERIFYHOST => 2
]);

$response = curl_exec($ch);
$error = curl_error($ch);
$status = curl_getinfo($ch, CURLINFO_HTTP_CODE);

// Jangan panggil curl_close() karena pada PHP 8.5 fungsi tersebut sudah deprecated.
unset($ch);

if ($response === false || $error) {
    http_response_code(502);
    echo json_encode([
        'success' => false,
        'code' => 'UPSTREAM_ERROR',
        'message' => 'Backend Apps Script tidak dapat dihubungi.',
        'detail' => $error
    ]);
    exit;
}

if ($status < 200 || $status >= 600) {
    $status = 502;
}

http_response_code($status);
echo $response;
