<?php
// This script saves custom satellite data to a JSON file

// Get posted data
$json = file_get_contents('php://input');
$data = json_decode($json, true);

// Check if data is valid
if (!$data || !isset($data['satellites']) || !is_array($data['satellites'])) {
    header('HTTP/1.1 400 Bad Request');
    echo json_encode(['error' => 'Invalid data format']);
    exit;
}

// Save data to file
$result = file_put_contents('data/custom_satellites.json', $json);

if ($result === false) {
    header('HTTP/1.1 500 Internal Server Error');
    echo json_encode(['error' => 'Failed to save data']);
    exit;
}

// Return success response
header('Content-Type: application/json');
echo json_encode(['success' => true]);
?>