<?php
header('Content-Type: application/json; charset=utf-8');

// Permite a configuração da chave através de variável de ambiente ou constante
$geminiApiKey = getenv('GEMINI_API_KEY') ?: '';
$openAiApiKey = getenv('OPENAI_API_KEY') ?: '';

// Lê o payload JSON da requisição
$inputRaw = file_get_contents('php://input');
$input = json_decode($inputRaw, true);

$prompt = trim($input['prompt'] ?? $_POST['prompt'] ?? '');

if (empty($prompt)) {
    echo json_encode(['error' => 'Por favor, forneça uma descrição ou instrução para a IA.']);
    exit;
}

/**
 * Chamada para a API do Google Gemini (gemini-1.5-flash) se a chave estiver presente
 */
if (!empty($geminiApiKey)) {
    $url = "https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=" . urlencode($geminiApiKey);
    
    $systemInstruction = "Você é um assistente especialista em criação e redação de conteúdo HTML rico para editores WYSIWYG. " .
                         "Responda SEMPRE gerando APENAS tags HTML limpas (como <p>, <ul>, <li>, <b>, <h3>), sem marcadores de código Markdown ```html.";

    $data = [
        'contents' => [
            [
                'parts' => [
                    ['text' => $systemInstruction . "\n\nSolicitação do usuário: " . $prompt]
                ]
            ]
        ]
    ];

    $ch = curl_init($url);
    curl_setopt_array($ch, [
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_POST => true,
        CURLOPT_HTTPHEADER => ['Content-Type: application/json'],
        CURLOPT_POSTFIELDS => json_encode($data),
        CURLOPT_TIMEOUT => 30
    ]);

    $response = curl_exec($ch);
    $httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
    curl_close($ch);

    if ($httpCode === 200 && $response) {
        $result = json_decode($response, true);
        $generatedText = $result['candidates'][0]['content']['parts'][0]['text'] ?? '';

        // Limpa trechos markdown que a IA possa ter retornado involuntariamente
        $generatedHtml = preg_replace('/```html\s*/i', '', $generatedText);
        $generatedHtml = preg_replace('/```\s*/', '', $generatedHtml);

        echo json_encode([
            'success' => true,
            'html' => trim($generatedHtml)
        ]);
        exit;
    }
}

/**
 * Chamada para a API do OpenAI (gpt-4o-mini) se a chave estiver presente
 */
if (!empty($openAiApiKey)) {
    $url = "https://api.openai.com/v1/chat/completions";
    
    $data = [
        'model' => 'gpt-4o-mini',
        'messages' => [
            ['role' => 'system', 'content' => 'Você é um redator web profissional. Gere respostas formatadas exclusivamente em HTML (tags <p>, <ul>, <li>, <b>, <h3>).'],
            ['role' => 'user', 'content' => $prompt]
        ]
    ];

    $ch = curl_init($url);
    curl_setopt_array($ch, [
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_POST => true,
        CURLOPT_HTTPHEADER => [
            'Content-Type: application/json',
            'Authorization: Bearer ' . $openAiApiKey
        ],
        CURLOPT_POSTFIELDS => json_encode($data),
        CURLOPT_TIMEOUT => 30
    ]);

    $response = curl_exec($ch);
    $httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
    curl_close($ch);

    if ($httpCode === 200 && $response) {
        $result = json_decode($response, true);
        $generatedText = $result['choices'][0]['message']['content'] ?? '';

        $generatedHtml = preg_replace('/```html\s*/i', '', $generatedText);
        $generatedHtml = preg_replace('/```\s*/', '', $generatedHtml);

        echo json_encode([
            'success' => true,
            'html' => trim($generatedHtml)
        ]);
        exit;
    }
}

// Fallback Inteligente (modo demonstração quando nenhuma chave de API externa foi definida)
$simulatedResponse = '<p><b>Conteúdo gerado para:</b> ' . htmlspecialchars($prompt) . '</p>' .
    '<p>Este é um texto gerado pela API de IA integrando o <b>Weaver Editor</b>. O conteúdo foi estruturado e formatado automaticamente em HTML de alta qualidade.</p>' .
    '<ul>' .
    '<li><b>Qualidade Garantida:</b> Texto otimizado para leitura e engajamento.</li>' .
    '<li><b>Pronto para Publicação:</b> Formatação limpa e sem sujeiras no código.</li>' .
    '</ul>' .
    '<p><br></p>';

echo json_encode([
    'success' => true,
    'html' => $simulatedResponse,
    'note' => 'Modo Demonstração Ativo. Defina a variável GEMINI_API_KEY ou OPENAI_API_KEY no servidor para usar chamadas reais.'
]);
