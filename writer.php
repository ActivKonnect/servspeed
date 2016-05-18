<?php

if (!isset($_POST['data'])) {
    exit();
}

$data = $_POST['data'];

if (json_decode($data) === null or strlen($data) === 0 or strlen($data) >= 10000) {
    exit();
}

$ip = $_SERVER['REMOTE_ADDR'];
$time = intval(microtime(true) * 1000);

$path = __DIR__ . "/logs/$ip/$time.json";

mkdir(dirname($path), 0777, true);

$f = fopen($path, 'w');
fwrite($f, $data);
fclose($f);
