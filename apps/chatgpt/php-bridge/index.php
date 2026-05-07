<?php
declare(strict_types=1);

header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store');

const API_BASE = 'https://ssl.newsman.app/api/1.2/rest';
const MAX_BODY_BYTES = 100000;
const MAX_CSV_IMPORT_ROWS = 10000;

$configPath = __DIR__ . '/config.php';
if (is_file($configPath)) {
    require $configPath;
}

$allowedTools = [
    'newsman_list_all' => true,
    'newsman_import_status' => true,
    'newsman_import_csv' => true,
    'newsman_segment_all' => true,
    'newsman_segment_count' => true,
    'newsman_segment_refresh' => true,
    'newsman_automation_all' => true,
    'newsman_automation_stats' => true,
    'newsman_automation_set_workflow_status' => true,
];

try {
    $path = parse_url($_SERVER['REQUEST_URI'] ?? '/', PHP_URL_PATH) ?: '/';
    $route = isset($_GET['route']) ? trim((string) $_GET['route'], '/') : '';
    $queryTool = isset($_GET['tool']) ? trim((string) $_GET['tool']) : '';

    if (($_SERVER['REQUEST_METHOD'] ?? '') === 'GET' && ($route === 'health' || preg_match('#/health$#', $path))) {
        send_json(200, [
            'ok' => true,
            'service' => 'NewsMAN AI Sync ChatGPT PHP bridge',
            'version' => '0.2.0',
        ]);
    }

    $tool = '';
    if ($queryTool !== '') {
        $tool = rawurldecode($queryTool);
    } elseif (preg_match('#/tools/([^/]+)$#', $path, $matches)) {
        $tool = rawurldecode($matches[1]);
    }

    if (($_SERVER['REQUEST_METHOD'] ?? '') !== 'POST' || $tool === '') {
        send_json(404, ['ok' => false, 'error' => 'Not found.']);
    }

    require_action_auth();

    if (!isset($allowedTools[$tool])) {
        send_json(404, ['ok' => false, 'error' => "Unknown or disabled tool: {$tool}"]);
    }

    $body = read_json_body();
    [$args, $credentials] = extract_newsman_credentials($body);
    $result = call_tool($tool, $args, $credentials);

    send_json(200, ['ok' => true, 'tool' => $tool, 'result' => $result]);
} catch (Throwable $error) {
    $status = method_exists($error, 'getCode') && $error->getCode() >= 400 && $error->getCode() < 600
        ? $error->getCode()
        : 500;
    send_json($status, ['ok' => false, 'error' => $error->getMessage()]);
}

function require_action_auth(): void
{
    if (!defined('CHATGPT_ACTION_API_KEY') || CHATGPT_ACTION_API_KEY === '') {
        throw new RuntimeException('Bridge is missing CHATGPT_ACTION_API_KEY in config.php.', 500);
    }

    $header = $_SERVER['HTTP_AUTHORIZATION'] ?? '';
    $value = trim((string) preg_replace('/^Bearer\s+/i', '', $header));
    if (!hash_equals((string) CHATGPT_ACTION_API_KEY, $value)) {
        throw new RuntimeException('Unauthorized.', 401);
    }
}

function read_json_body(): array
{
    $contentLength = (int) ($_SERVER['CONTENT_LENGTH'] ?? 0);
    if ($contentLength > MAX_BODY_BYTES) {
        throw new RuntimeException('Request body is too large.', 413);
    }

    $raw = trim((string) file_get_contents('php://input'));
    if ($raw === '') {
        return [];
    }

    $data = json_decode($raw, true);
    if (!is_array($data)) {
        throw new RuntimeException('Invalid JSON body.', 400);
    }
    return $data;
}

function extract_newsman_credentials(array $body): array
{
    $credentials = [
        'user_id' => isset($body['newsman_user_id']) ? trim((string) $body['newsman_user_id']) : '',
        'api_key' => isset($body['newsman_api_key']) ? trim((string) $body['newsman_api_key']) : '',
    ];

    unset($body['newsman_user_id'], $body['newsman_api_key']);

    if (($credentials['user_id'] === '') !== ($credentials['api_key'] === '')) {
        throw new RuntimeException('Provide both newsman_user_id and newsman_api_key, or neither.', 400);
    }

    return [$body, $credentials];
}

function call_tool(string $tool, array $args, array $credentials): array
{
    switch ($tool) {
        case 'newsman_list_all':
            return call_newsman('list.all', [], 'GET', $credentials);
        case 'newsman_import_status':
            return call_newsman('import.status', pick($args, ['import_id']), 'GET', $credentials);
        case 'newsman_import_csv':
            return import_csv($args, $credentials);
        case 'newsman_segment_all':
            return call_newsman('segment.all', pick($args, ['list_id']), 'GET', $credentials);
        case 'newsman_segment_count':
            return call_newsman('segment.count', pick($args, ['segment_id']), 'GET', $credentials);
        case 'newsman_segment_refresh':
            require_confirm($args, 'refresh a segment');
            return call_newsman('segment.refresh', pick($args, ['segment_id']), 'POST', $credentials);
        case 'newsman_automation_all':
            return call_newsman('automation.all', with_defaults($args, [
                'name' => '',
                'type' => 'all',
                'status' => 'all',
            ], ['list_id', 'name', 'type', 'status', 'start_date', 'stop_date']), 'GET', $credentials);
        case 'newsman_automation_stats':
            return call_newsman('automation.stats', pick($args, [
                'list_id', 'workflow_ids', 'trigger_id', 'start_date', 'stop_date', 'days', 'month',
            ]), 'GET', $credentials);
        case 'newsman_automation_set_workflow_status':
            require_confirm($args, 'change automation workflow status');
            return call_newsman('automation.setWorkflowStatus', pick($args, ['workflow_id', 'status']), 'POST', $credentials);
        default:
            throw new RuntimeException("Unknown tool: {$tool}", 404);
    }
}

function import_csv(array $args, array $credentials): array
{
    $csv = isset($args['csv_data']) ? (string) $args['csv_data'] : '';
    validate_csv_import_data($csv);

    if (($args['dry_run'] ?? true) !== false) {
        return [
            'dry_run' => true,
            'message' => 'No CSV import task was created. Re-run with dry_run=false and confirm=true to call import.csv.',
            'list_id' => $args['list_id'] ?? null,
            'segments' => $args['segments'] ?? null,
            'csv_bytes' => strlen($csv),
        ];
    }

    require_confirm($args, 'create a CSV import task');
    return call_newsman('import.csv', pick($args, ['list_id', 'segments', 'csv_data']), 'POST', $credentials);
}

function call_newsman(string $method, array $params, string $httpMethod, array $credentials): array
{
    if (!preg_match('/^[a-zA-Z0-9_.-]+$/', $method)) {
        throw new RuntimeException("Invalid NewsMAN method: {$method}", 400);
    }

    $userId = $credentials['user_id'] !== '' ? $credentials['user_id'] : getenv('NEWSMAN_USER_ID');
    $apiKey = $credentials['api_key'] !== '' ? $credentials['api_key'] : getenv('NEWSMAN_API_KEY');
    if (!$userId || !$apiKey) {
        throw new RuntimeException('Missing NewsMAN credentials. Provide newsman_user_id and newsman_api_key in Action fields.', 400);
    }

    $url = API_BASE . '/' . rawurlencode((string) $userId) . '/' . rawurlencode((string) $apiKey) . '/' . $method . '.json';
    $encoded = http_build_query($params);

    $context = [
        'http' => [
            'method' => strtoupper($httpMethod),
            'ignore_errors' => true,
            'timeout' => 45,
        ],
    ];

    if (strtoupper($httpMethod) === 'GET' && $encoded !== '') {
        $url .= '?' . $encoded;
    } elseif (strtoupper($httpMethod) === 'POST') {
        $context['http']['header'] = "Content-Type: application/x-www-form-urlencoded\r\n";
        $context['http']['content'] = $encoded;
    }

    $raw = file_get_contents($url, false, stream_context_create($context));
    if ($raw === false) {
        throw new RuntimeException('NewsMAN API request failed.', 502);
    }

    $data = json_decode($raw, true);
    if ($data === null && json_last_error() !== JSON_ERROR_NONE) {
        return ['raw' => $raw];
    }

    if (is_array($data) && !empty($data['err'])) {
        $message = isset($data['message']) ? (string) $data['message'] : 'NewsMAN API error.';
        throw new RuntimeException("NewsMAN API error: {$message}", 502);
    }

    return is_array($data) ? $data : ['value' => $data];
}

function validate_csv_import_data(string $csv): void
{
    if (trim($csv) === '') {
        throw new RuntimeException('csv_data must contain a header row.', 400);
    }

    $rows = array_values(array_filter(preg_split('/\r?\n/', $csv), static fn($line) => trim($line) !== ''));
    if ((count($rows) - 1) > MAX_CSV_IMPORT_ROWS) {
        throw new RuntimeException('csv_data accepts up to ' . MAX_CSV_IMPORT_ROWS . ' data rows per call.', 400);
    }

    $headers = array_map(static fn($header) => strtolower(trim(trim($header), '"')), explode(',', $rows[0]));
    if (!in_array('email', $headers, true)) {
        throw new RuntimeException('csv_data header must include email.', 400);
    }
}

function pick(array $source, array $keys): array
{
    $result = [];
    foreach ($keys as $key) {
        if (array_key_exists($key, $source) && $source[$key] !== null) {
            $result[$key] = $source[$key];
        }
    }
    return $result;
}

function with_defaults(array $source, array $defaults, array $keys): array
{
    return pick(array_merge($defaults, $source), $keys);
}

function require_confirm(array $args, string $action): void
{
    if (($args['confirm'] ?? false) !== true) {
        throw new RuntimeException("Set confirm=true to {$action}.", 400);
    }
}

function send_json(int $status, array $payload): never
{
    http_response_code($status);
    echo json_encode($payload, JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES);
    exit;
}
