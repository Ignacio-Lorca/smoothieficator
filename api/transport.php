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
$dataFile = $dataDir . DIRECTORY_SEPARATOR . "transport.json";

if (!is_dir($dataDir)) {
    mkdir($dataDir, 0775, true);
}

function default_state(): array
{
    return [
        "songId" => "",
        "isPlaying" => false,
        "speed" => 8,
        "positionPx" => 0,
        "updatedAt" => gmdate("c"),
        "sourceId" => "",
        "version" => 1,
        "conductorId" => "",
        "conductorUntil" => "",
        "lastHeartbeatAt" => "",
        "serverNow" => gmdate("c"),
    ];
}

if (!file_exists($dataFile)) {
    file_put_contents($dataFile, json_encode(default_state(), JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE));
}

function respond(int $code, array $payload): void
{
    http_response_code($code);
    echo json_encode($payload, JSON_UNESCAPED_UNICODE);
    exit;
}

if ($_SERVER["REQUEST_METHOD"] === "GET") {
    $content = file_get_contents($dataFile);
    $decoded = json_decode($content ?: "", true);
    if (!is_array($decoded)) {
        $decoded = default_state();
    }
    $decoded["serverNow"] = gmdate("c");
    respond(200, $decoded);
}

if ($_SERVER["REQUEST_METHOD"] === "POST") {
    $raw = file_get_contents("php://input");
    $payload = json_decode($raw ?: "", true);

    if (!is_array($payload)) {
        respond(400, ["error" => "Invalid JSON payload"]);
    }

    $currentContent = file_get_contents($dataFile);
    $current = json_decode($currentContent ?: "", true);
    if (!is_array($current)) {
        $current = default_state();
    }

    $sourceId = (string)($payload["sourceId"] ?? "");
    $nowIso = gmdate("c");
    $nowTs = strtotime($nowIso);
    $currentConductorId = (string)($current["conductorId"] ?? "");
    $currentConductorUntil = (string)($current["conductorUntil"] ?? "");
    $currentConductorUntilTs = strtotime($currentConductorUntil ?: "");
    $leaseActive = $currentConductorId !== ""
        && $currentConductorUntilTs !== false
        && $currentConductorUntilTs >= $nowTs;

    $releaseLease = (bool)($payload["releaseLease"] ?? false);
    if ($releaseLease && $sourceId !== "" && $sourceId === $currentConductorId) {
        $currentConductorId = "";
        $leaseActive = false;
    }

    if ($leaseActive && $sourceId !== $currentConductorId) {
        respond(409, [
            "error" => "Conductor lease is held by another client",
            "conductorId" => $currentConductorId,
            "conductorUntil" => $currentConductorUntil,
            "serverNow" => $nowIso,
        ]);
    }

    if ($sourceId !== "") {
        $currentConductorId = $sourceId;
    }

    $leaseMs = (int)($payload["leaseMs"] ?? 1500);
    if ($leaseMs < 500) {
        $leaseMs = 500;
    }
    if ($leaseMs > 10000) {
        $leaseMs = 10000;
    }
    $conductorUntilIso = gmdate("c", $nowTs + (int)ceil($leaseMs / 1000));

    $next = [
        "songId" => (string)($payload["songId"] ?? ""),
        "isPlaying" => (bool)($payload["isPlaying"] ?? false),
        "speed" => (int)($payload["speed"] ?? 8),
        "positionPx" => (float)($payload["positionPx"] ?? 0),
        "updatedAt" => $nowIso,
        "sourceId" => $sourceId,
        "version" => (int)($current["version"] ?? 0) + 1,
        "conductorId" => $currentConductorId,
        "conductorUntil" => $conductorUntilIso,
        "lastHeartbeatAt" => $nowIso,
        "serverNow" => $nowIso,
    ];

    $handle = fopen($dataFile, "c+");
    if ($handle === false) {
        respond(500, ["error" => "Unable to open transport data file"]);
    }

    if (!flock($handle, LOCK_EX)) {
        fclose($handle);
        respond(500, ["error" => "Unable to lock transport data file"]);
    }

    ftruncate($handle, 0);
    rewind($handle);
    fwrite($handle, json_encode($next, JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE));
    fflush($handle);
    flock($handle, LOCK_UN);
    fclose($handle);

    respond(200, [
        "ok" => true,
        "updatedAt" => $next["updatedAt"],
        "version" => $next["version"],
        "conductorId" => $next["conductorId"],
        "conductorUntil" => $next["conductorUntil"],
        "serverNow" => $nowIso,
    ]);
}

respond(405, ["error" => "Method not allowed"]);
