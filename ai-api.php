<?php
/**
 * Weaver Editor - Endpoint de IA (exemplo de backend)
 *
 * Gera HTML a partir de um prompt usando Google Gemini ou OpenAI.
 * Sem nenhuma chave configurada, responde em modo demonstração.
 *
 * Variáveis de ambiente:
 *   GEMINI_API_KEY / OPENAI_API_KEY   Chaves dos provedores (use ao menos uma).
 *   GEMINI_MODEL                      Padrão: gemini-3.5-flash-lite
 *   OPENAI_MODEL                      Padrão: gpt-6-luna
 *   WEAVER_AI_ALLOW_ANONYMOUS=1       Dispensa login. NÃO recomendado com chave real.
 *   WEAVER_AI_SESSION_KEY             Chave em $_SESSION que indica usuário logado. Padrão: user_id
 *   WEAVER_AI_ALLOWED_ORIGINS         Origens aceitas, separadas por vírgula
 *                                     (ex.: https://admin.site.com). Padrão: o próprio host.
 *   WEAVER_AI_MAX_PROMPT              Tamanho máximo do prompt em caracteres. Padrão: 2000
 *   WEAVER_AI_RATE_LIMIT              Requisições por janela, por usuário. Padrão: 20
 *   WEAVER_AI_RATE_WINDOW             Janela do limite em segundos. Padrão: 3600
 *
 * Mesmo com estas proteções, integre este arquivo ao sistema de autenticação
 * do seu painel e trate a resposta como HTML não confiável.
 */

header('Content-Type: application/json; charset=utf-8');
header('X-Content-Type-Options: nosniff');
header('Cache-Control: no-store');

const WEAVER_AI_MAX_BODY_BYTES = 16384;

function weaver_env($name, $default = '')
{
    $value = getenv($name);
    return ($value === false || $value === '') ? $default : $value;
}

function weaver_respond($status, array $payload, array $headers = [])
{
    http_response_code($status);
    foreach ($headers as $header) {
        header($header);
    }
    echo json_encode($payload, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    exit;
}

/**
 * Normaliza "https://host:porta" a partir de uma URL (Origin ou Referer).
 */
function weaver_origin_of($url)
{
    $parts = parse_url($url);
    if (!$parts || empty($parts['host']) || empty($parts['scheme'])) {
        return null;
    }
    $origin = strtolower($parts['scheme']) . '://' . strtolower($parts['host']);
    if (!empty($parts['port'])) {
        $origin .= ':' . $parts['port'];
    }
    return $origin;
}

/**
 * Proteção contra CSRF e uso a partir de outros sites: a requisição precisa
 * vir de uma origem permitida (o próprio host, por padrão).
 */
function weaver_check_origin()
{
    $source = $_SERVER['HTTP_ORIGIN'] ?? ($_SERVER['HTTP_REFERER'] ?? '');
    $origin = $source !== '' ? weaver_origin_of($source) : null;

    if ($origin === null) {
        weaver_respond(403, ['error' => 'Origem da requisição não identificada.']);
    }

    $configured = trim(weaver_env('WEAVER_AI_ALLOWED_ORIGINS'));
    if ($configured !== '') {
        $allowed = array_filter(array_map(function ($item) {
            return rtrim(strtolower(trim($item)), '/');
        }, explode(',', $configured)));
    } else {
        $https = (!empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off')
            || (($_SERVER['SERVER_PORT'] ?? '') === '443');
        $host = strtolower($_SERVER['HTTP_HOST'] ?? '');
        $allowed = [($https ? 'https://' : 'http://') . $host];
    }

    if (!in_array($origin, $allowed, true)) {
        weaver_respond(403, ['error' => 'Origem não permitida.']);
    }
}

/**
 * Exige usuário logado (sessão PHP). Retorna o identificador do usuário.
 */
function weaver_require_session()
{
    if (session_status() === PHP_SESSION_NONE) {
        session_start();
    }

    $sessionKey = weaver_env('WEAVER_AI_SESSION_KEY', 'user_id');
    $userId = $_SESSION[$sessionKey] ?? null;

    // Libera o lock da sessão: a chamada à IA pode demorar
    session_write_close();

    if ($userId === null || $userId === '' || $userId === false) {
        weaver_respond(401, ['error' => 'Faça login para usar o assistente de IA.']);
    }

    return 'user:' . (is_scalar($userId) ? (string) $userId : md5(serialize($userId)));
}

/**
 * Limite de requisições por identidade, com arquivo e flock (sem dependências).
 * Em produção com vários servidores, prefira Redis ou o banco de dados.
 */
function weaver_rate_limit($identity)
{
    $limit = max(1, (int) weaver_env('WEAVER_AI_RATE_LIMIT', '20'));
    $window = max(1, (int) weaver_env('WEAVER_AI_RATE_WINDOW', '3600'));

    $dir = rtrim(sys_get_temp_dir(), DIRECTORY_SEPARATOR) . DIRECTORY_SEPARATOR . 'weaver-ai-ratelimit';
    if (!is_dir($dir) && !@mkdir($dir, 0700, true) && !is_dir($dir)) {
        error_log('weaver-ai: não foi possível criar o diretório do rate limit');
        weaver_respond(503, ['error' => 'Serviço de IA temporariamente indisponível.']);
    }

    $file = $dir . DIRECTORY_SEPARATOR . hash('sha256', $identity) . '.json';
    $handle = fopen($file, 'c+');
    if (!$handle) {
        weaver_respond(503, ['error' => 'Serviço de IA temporariamente indisponível.']);
    }

    flock($handle, LOCK_EX);
    $now = time();
    $hits = json_decode(stream_get_contents($handle) ?: '[]', true);
    $hits = array_values(array_filter(is_array($hits) ? $hits : [], function ($ts) use ($now, $window) {
        return is_int($ts) && $ts > $now - $window;
    }));

    if (count($hits) >= $limit) {
        flock($handle, LOCK_UN);
        fclose($handle);
        $retryAfter = max(1, $hits[0] + $window - $now);
        weaver_respond(429, ['error' => 'Limite de uso do assistente atingido. Tente novamente mais tarde.'], ['Retry-After: ' . $retryAfter]);
    }

    $hits[] = $now;
    ftruncate($handle, 0);
    rewind($handle);
    fwrite($handle, json_encode($hits));
    fflush($handle);
    flock($handle, LOCK_UN);
    fclose($handle);
}

function weaver_post_json($url, array $headers, array $body)
{
    $ch = curl_init($url);
    curl_setopt_array($ch, [
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_POST => true,
        CURLOPT_HTTPHEADER => array_merge(['Content-Type: application/json'], $headers),
        CURLOPT_POSTFIELDS => json_encode($body),
        CURLOPT_CONNECTTIMEOUT => 10,
        CURLOPT_TIMEOUT => 30,
    ]);

    $response = curl_exec($ch);
    $httpCode = (int) curl_getinfo($ch, CURLINFO_HTTP_CODE);
    $curlError = curl_error($ch);
    curl_close($ch);

    return [$httpCode, $response === false ? null : $response, $curlError];
}

const WEAVER_AI_SYSTEM_PROMPT = 'Você é um redator web profissional e escreve conteúdo para um editor WYSIWYG. '
    . 'Responda APENAS com HTML simples usando as tags <p>, <h2>, <h3>, <ul>, <ol>, <li>, <b>, <strong>, <i>, <em> e <br>, '
    . 'sem atributos, sem scripts, sem estilos e sem blocos de código Markdown.';

function weaver_call_gemini($apiKey, $prompt)
{
    $model = weaver_env('GEMINI_MODEL', 'gemini-3.5-flash-lite');
    $url = 'https://generativelanguage.googleapis.com/v1beta/models/' . rawurlencode($model) . ':generateContent';

    // A chave vai no header, nunca na query string (que acaba em logs)
    list($status, $response, $curlError) = weaver_post_json($url, ['x-goog-api-key: ' . $apiKey], [
        'system_instruction' => ['parts' => [['text' => WEAVER_AI_SYSTEM_PROMPT]]],
        'contents' => [['role' => 'user', 'parts' => [['text' => $prompt]]]],
    ]);

    if ($status === 200 && $response) {
        $result = json_decode($response, true);
        $text = $result['candidates'][0]['content']['parts'][0]['text'] ?? '';
        if (is_string($text) && trim($text) !== '') {
            return $text;
        }
    }

    error_log(sprintf('weaver-ai: Gemini falhou (HTTP %d) %s %s', $status, $curlError, substr((string) $response, 0, 500)));
    return null;
}

function weaver_call_openai($apiKey, $prompt)
{
    $model = weaver_env('OPENAI_MODEL', 'gpt-6-luna');

    list($status, $response, $curlError) = weaver_post_json('https://api.openai.com/v1/chat/completions', ['Authorization: Bearer ' . $apiKey], [
        'model' => $model,
        'messages' => [
            ['role' => 'system', 'content' => WEAVER_AI_SYSTEM_PROMPT],
            ['role' => 'user', 'content' => $prompt],
        ],
    ]);

    if ($status === 200 && $response) {
        $result = json_decode($response, true);
        $text = $result['choices'][0]['message']['content'] ?? '';
        if (is_string($text) && trim($text) !== '') {
            return $text;
        }
    }

    error_log(sprintf('weaver-ai: OpenAI falhou (HTTP %d) %s %s', $status, $curlError, substr((string) $response, 0, 500)));
    return null;
}

/**
 * A saída do modelo é tratada como não confiável: mantém só tags de texto
 * simples e remove TODOS os atributos.
 */
function weaver_sanitize_ai_html($html)
{
    $html = preg_replace('/```(?:html)?\s*/i', '', $html);

    $allowed = ['p', 'br', 'ul', 'ol', 'li', 'b', 'strong', 'i', 'em', 'u', 'h2', 'h3', 'h4', 'blockquote'];
    $dropWithContent = ['script', 'style', 'iframe', 'object', 'embed', 'svg', 'math', 'template', 'noscript', 'textarea', 'select', 'title', 'head', 'form'];

    $doc = new DOMDocument();
    $previous = libxml_use_internal_errors(true);
    $doc->loadHTML('<?xml encoding="utf-8"?><div id="weaver-root">' . $html . '</div>', LIBXML_NONET);
    libxml_clear_errors();
    libxml_use_internal_errors($previous);

    $root = (new DOMXPath($doc))->query('//div[@id="weaver-root"]')->item(0);
    if (!$root) {
        return '<p>' . htmlspecialchars(strip_tags($html), ENT_QUOTES, 'UTF-8') . '</p>';
    }

    $walk = function (DOMNode $parent) use (&$walk, $allowed, $dropWithContent) {
        foreach (iterator_to_array($parent->childNodes) as $node) {
            if ($node instanceof DOMComment || $node instanceof DOMProcessingInstruction) {
                $parent->removeChild($node);
                continue;
            }
            if (!($node instanceof DOMElement)) {
                continue;
            }

            $tag = strtolower($node->nodeName);
            if (in_array($tag, $dropWithContent, true)) {
                $parent->removeChild($node);
                continue;
            }

            $walk($node);

            if (!in_array($tag, $allowed, true)) {
                while ($node->firstChild) {
                    $parent->insertBefore($node->firstChild, $node);
                }
                $parent->removeChild($node);
                continue;
            }

            while ($node->attributes->length > 0) {
                $node->removeAttribute($node->attributes->item(0)->nodeName);
            }
        }
    };
    $walk($root);

    $out = '';
    foreach ($root->childNodes as $child) {
        $out .= $doc->saveHTML($child);
    }
    return trim($out);
}

// =========================
// FLUXO DA REQUISIÇÃO
// =========================

if (($_SERVER['REQUEST_METHOD'] ?? 'GET') !== 'POST') {
    weaver_respond(405, ['error' => 'Método não permitido.'], ['Allow: POST']);
}

weaver_check_origin();

if ((int) ($_SERVER['CONTENT_LENGTH'] ?? 0) > WEAVER_AI_MAX_BODY_BYTES) {
    weaver_respond(413, ['error' => 'Requisição muito grande.']);
}

$inputRaw = (string) file_get_contents('php://input', false, null, 0, WEAVER_AI_MAX_BODY_BYTES + 1);
if (strlen($inputRaw) > WEAVER_AI_MAX_BODY_BYTES) {
    weaver_respond(413, ['error' => 'Requisição muito grande.']);
}

$input = json_decode($inputRaw, true);
$prompt = $input['prompt'] ?? ($_POST['prompt'] ?? '');
$prompt = is_string($prompt) ? trim($prompt) : '';

if ($prompt === '') {
    weaver_respond(422, ['error' => 'Por favor, forneça uma descrição ou instrução para a IA.']);
}

$maxPrompt = max(1, (int) weaver_env('WEAVER_AI_MAX_PROMPT', '2000'));
if (mb_strlen($prompt, 'UTF-8') > $maxPrompt) {
    weaver_respond(422, ['error' => 'A instrução pode ter no máximo ' . $maxPrompt . ' caracteres.']);
}

$geminiApiKey = weaver_env('GEMINI_API_KEY');
$openAiApiKey = weaver_env('OPENAI_API_KEY');
$hasProvider = $geminiApiKey !== '' || $openAiApiKey !== '';

// Modo demonstração: só quando NENHUMA chave está configurada.
// Falhas reais da API nunca caem aqui (antes elas eram mascaradas como sucesso).
if (!$hasProvider) {
    $simulatedResponse = '<p><b>Conteúdo gerado para:</b> ' . htmlspecialchars($prompt, ENT_QUOTES, 'UTF-8') . '</p>' .
        '<p>Este é um texto gerado pela API de IA integrando o <b>Weaver Editor</b>. O conteúdo foi estruturado e formatado automaticamente em HTML de alta qualidade.</p>' .
        '<ul>' .
        '<li><b>Qualidade Garantida:</b> Texto otimizado para leitura e engajamento.</li>' .
        '<li><b>Pronto para Publicação:</b> Formatação limpa e sem sujeiras no código.</li>' .
        '</ul>' .
        '<p><br></p>';

    weaver_respond(200, [
        'success' => true,
        'html' => $simulatedResponse,
        'note' => 'Modo Demonstração Ativo. Defina GEMINI_API_KEY ou OPENAI_API_KEY no servidor para usar chamadas reais.',
    ]);
}

// Com chave real, cada chamada custa dinheiro: exige login e aplica limite
if (weaver_env('WEAVER_AI_ALLOW_ANONYMOUS') === '1') {
    $identity = 'ip:' . ($_SERVER['REMOTE_ADDR'] ?? 'unknown');
} else {
    $identity = weaver_require_session();
}

weaver_rate_limit($identity);

$generated = null;
if ($geminiApiKey !== '') {
    $generated = weaver_call_gemini($geminiApiKey, $prompt);
}
if ($generated === null && $openAiApiKey !== '') {
    $generated = weaver_call_openai($openAiApiKey, $prompt);
}

if ($generated === null) {
    weaver_respond(502, ['error' => 'O serviço de IA não respondeu. Tente novamente em instantes.']);
}

$html = weaver_sanitize_ai_html($generated);
if ($html === '') {
    weaver_respond(502, ['error' => 'A IA não retornou conteúdo utilizável.']);
}

weaver_respond(200, ['success' => true, 'html' => $html]);
