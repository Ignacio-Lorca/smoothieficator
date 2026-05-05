<?php
declare(strict_types=1);

header("Content-Type: application/json; charset=utf-8");
header("Access-Control-Allow-Origin: *");
header("Access-Control-Allow-Methods: GET, POST, OPTIONS");
header("Access-Control-Allow-Headers: Content-Type");

if ($_SERVER["REQUEST_METHOD"] === "OPTIONS") {
    http_response_code(204);
    exit;
}

$dataDir = dirname(__DIR__) . DIRECTORY_SEPARATOR . "data";
$dataFile = $dataDir . DIRECTORY_SEPARATOR . "songs.json";

if (!is_dir($dataDir)) {
    mkdir($dataDir, 0775, true);
}

if (!file_exists($dataFile)) {
    file_put_contents($dataFile, json_encode([
        "songs" => new stdClass(),
        "updatedAt" => gmdate("c"),
    ], JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE));
}

function respond(int $code, array $payload): void
{
    http_response_code($code);
    echo json_encode($payload, JSON_UNESCAPED_UNICODE);
    exit;
}

if ($_SERVER["REQUEST_METHOD"] === "GET") {
    $content = file_get_contents($dataFile);
    if ($content === false || trim($content) === "") {
        respond(200, [
            "songs" => new stdClass(),
            "updatedAt" => gmdate("c"),
        ]);
    }

    $decoded = json_decode($content, true);
    if (!is_array($decoded)) {
        respond(200, [
            "songs" => new stdClass(),
            "updatedAt" => gmdate("c"),
        ]);
    }

    if (!array_key_exists("songs", $decoded)) {
        $decoded = [
            "songs" => $decoded,
            "updatedAt" => gmdate("c"),
        ];
    }

    respond(200, $decoded);
}

if ($_SERVER["REQUEST_METHOD"] === "POST") {
    $raw = file_get_contents("php://input");
    $payload = json_decode($raw ?? "", true);

    if (!is_array($payload)) {
        respond(400, ["error" => "Invalid JSON payload"]);
    }

    $songs = $payload["songs"] ?? null;
    if (!is_array($songs)) {
        respond(400, ["error" => "Payload must include a songs object"]);
    }

    $normalized = [
        "songs" => $songs,
        "updatedAt" => gmdate("c"),
    ];

    $handle = fopen($dataFile, "c+");
    if ($handle === false) {
        respond(500, ["error" => "Unable to open data file"]);
    }

    if (!flock($handle, LOCK_EX)) {
        fclose($handle);
        respond(500, ["error" => "Unable to lock data file"]);
    }

    ftruncate($handle, 0);
    rewind($handle);
    fwrite($handle, json_encode($normalized, JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE));
    fflush($handle);
    flock($handle, LOCK_UN);
    fclose($handle);

    respond(200, ["ok" => true, "updatedAt" => $normalized["updatedAt"]]);
}

respond(405, ["error" => "Method not allowed"]);
