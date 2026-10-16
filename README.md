# Weaver Editor

O **Weaver Editor** é um editor HTML WYSIWYG leve, moderno e altamente customizável, desenvolvido com JavaScript (ES5) e jQuery. Inspirado nos maiores editores do mercado, este projeto foi construído sob medida para ser fácil de integrar, leve no carregamento e extremamente poderoso.

## ✨ Funcionalidades

- **Substituição Transparente:** Transforma qualquer `<textarea>` automaticamente, mantendo a sincronização de dados invisível para submissões de formulários perfeitas.
- **Barra de Ferramentas Inteligente (Smart Toolbar):** Carregamento de módulos sob demanda. Se você não configurar o botão de Vídeo, o script de vídeo sequer consumirá memória!
- **Visualização de Código (Code View):** Editor de código-fonte integrado com _Syntax Highlighting_ e um formatador inteligente (Pretty Print) de HTML.
- **Modo Preview Responsivo:** Visualize como seu texto ficará em dispositivos Desktop, Tablet e Mobile diretamente de dentro do editor.
- **Imagens Avançadas:** Suporte a arrastar e soltar (Drag & Drop), redimensionamento visual e alinhamento flutuante.
- **Tabelas Interativas:** Construtor visual de tabelas (grid estilo Microsoft Word).
- **Embeds Mágicos:** Cole a URL de um vídeo do YouTube ou Vimeo e ele será convertido automaticamente em um _iframe_ responsivo.
- **Segurança Embutida:** Sanitizador por allowlist (`HtmlSanitizer`) aplicado a toda entrada de conteúdo (textarea inicial, colar, code view, IA, desfazer/refazer), protegendo contra XSS. Veja a seção [Segurança](#-segurança).
- **Histórico:** Suporte completo a Desfazer (Undo) e Refazer (Redo) com atalhos de teclado.

## 🚀 Instalação

O editor foi empacotado para ser distribuído em um único arquivo minificado. Basta incluir o jQuery, (opcionalmente uma biblioteca de ícones como Lucide) e o arquivo do editor.

```html
<!-- jQuery -->
<script src="https://code.jquery.com/jquery-3.6.0.min.js"></script>

<!-- Editor WYSIWYG -->
<script src="dist/weaver-editor.min.js"></script>
```

*Nota:* A estilização do editor insere automaticamente as regras via JavaScript (não é preciso ter Tailwind na página) e os ícones via Lucide.

## 💻 Como Usar

Crie um formulário com um `textarea` padrão:

```html
<form action="/salvar" method="POST">
  <textarea id="meu-editor" name="conteudo_html"></textarea>
  <button type="submit">Enviar</button>
</form>
```

Inicialize o editor via jQuery:

```javascript
$(document).ready(function() {
  $('#meu-editor').weaver({
    height: 500,
    placeholder: 'Comece a escrever sua história aqui...',
    toolbar: [
      ['history', ['undo', 'redo']],
      ['style', ['style', 'fontName', 'fontSize']],
      ['font', ['bold', 'italic', 'underline', 'strikethrough', 'clear']],
      ['color', ['color']],
      ['para', ['ul', 'ol', 'paragraph']],
      ['insert', ['link', 'table', 'picture', 'video', 'hr']],
      ['view', ['preview', 'fullscreen', 'showBlocks', 'codeview']]
    ]
  });
});
```

Para remover o editor (por exemplo, ao trocar de tela numa SPA), use `$('#meu-editor').weaver('destroy')`. O textarea volta a aparecer com o conteúdo atual e todos os eventos são removidos.

## ⚙️ Configuração da Barra de Ferramentas (Aliases)

O sistema de toolbar aceita a mesma sintaxe amigável do Summernote, permitindo agrupar botões em "blocos" divididos visualmente.

**Principais Apelidos (Aliases) Suportados:**
- `'style'`: Carrega os formatos de bloco (Parágrafo, H1-H6, Blockquote, Bloco de Código).
- `'clear'`: Limpa a formatação atual.
- `'picture'`: Injeta a funcionalidade de Imagens.
- `'color'`: Abre os seletores de Cor da Fonte e Cor de Fundo.
- `'paragraph'`: Agrupa os alinhamentos (Esquerda, Centro, Direita, Justificado) e Indentação.

## 🖼️ Imagens

Sem configuração, a imagem escolhida é embutida no HTML em base64, reduzida para no máximo `imageMaxWidth` pixels de largura. Para enviar ao servidor, use `uploadImage` e chame `done(url)` no sucesso ou `done(null, 'mensagem')` no erro (a mensagem aparece dentro do editor):

```javascript
$('#meu-editor').weaver({
  maxImageSize: 5 * 1024 * 1024, // 5 MB (padrão)
  imageMaxWidth: 1600,           // só vale para base64 (padrão)
  uploadImage: function (file, done) {
    var data = new FormData();
    data.append('imagem', file);
    fetch('/upload.php', { method: 'POST', body: data })
      .then(function (r) { return r.json(); })
      .then(function (json) { json.url ? done(json.url) : done(null, json.error || 'Falha no envio.'); })
      .catch(function () { done(null, 'Não foi possível enviar a imagem.'); });
  }
});
```

Formatos aceitos: PNG, JPG, GIF, WebP e AVIF. Ao clicar numa imagem, a barra permite mudar o tamanho (ou arrastar a alça no canto), alinhar, definir o **texto alternativo** e remover.

## ⌨️ Atalhos

| Atalho | Ação |
| --- | --- |
| `Ctrl+B` / `Ctrl+I` / `Ctrl+U` | Negrito / itálico / sublinhado |
| `Ctrl+K` | Inserir ou editar link |
| `Ctrl+Shift+V` | Colar sem formatação |
| `Ctrl+Z` / `Ctrl+Y` (ou `Ctrl+Shift+Z`) | Desfazer / refazer |
| `Tab` / `Shift+Tab` em lista | Aumentar / diminuir o nível do item |
| `Tab` / `Shift+Tab` em tabela | Próxima / célula anterior (no fim, cria uma linha) |

No Mac, use `Cmd` no lugar de `Ctrl`. Texto colado do Word e do Google Docs é limpo automaticamente: listas viram listas de verdade e classes e estilos repetidos são removidos.

## 🛠️ Desenvolvimento e Build

O projeto utiliza o **Gulp** para automatizar a concatenação e minificação dos arquivos em `src/` para a versão final de produção em `dist/`.

### 1. Instalar dependências
Certifique-se de ter o Node.js instalado.
```bash
npm install
```

### 2. Compilar o Editor
Sempre que fizer alterações nos arquivos de código dentro da pasta `src/`, rode o comando abaixo para gerar o arquivo `dist/weaver-editor.min.js`:
```bash
npx gulp
```

Não é obrigatório commitar o `dist/` nos PRs: quando o código entra na `main`, o workflow **Build** do GitHub Actions roda o Gulp e faz o commit do `dist/` sozinho.

### 3. Rodar os testes
Os testes abrem o editor num Chromium real: `tests/security.test.js` reproduz ataques conhecidos (XSS por colar, links, vídeo, preview, IA) e `tests/functional.test.js` cobre formatação, listas, code view, histórico e o ciclo de vida do editor.
```bash
npm install --no-save playwright jquery@3.6.0
npx playwright install chromium
npm test
```

No GitHub, o workflow **CI** roda o build e os testes (versões normal e minificada) em todo PR e em cada push na `main`.

## 🔒 Segurança

- **Sanitize também no servidor.** O sanitizador do editor protege quem está editando, mas o POST do formulário pode ser forjado. Antes de salvar ou exibir o HTML, passe-o por uma biblioteca de servidor como [HTML Purifier](http://htmlpurifier.org/) (PHP) ou [DOMPurify](https://github.com/cure53/DOMPurify) (Node).
- **Tags nunca permitidas:** `script`, `style`, `svg`, `math`, `object`, `embed`, `form` e similares são removidas mesmo se incluídas em `allowedTags`.
- **iframes:** apenas players do YouTube (`youtube-nocookie.com`) e do Vimeo, sempre com `sandbox`. Para liberar outros, passe `allowedIframeSources` (lista de RegExp) nas opções.
- **CSS inline:** só propriedades de formatação (cor, fonte, margens, bordas, tamanhos, alinhamento). `position` e `url()` são removidos. Personalize com `allowedStyles`.
- **Preview:** roda num iframe com `sandbox` e CSP sem scripts.
- **Dependências externas:** os ícones (Lucide) vêm de uma versão fixa, nunca `@latest`. Para garantir que o arquivo não foi adulterado no CDN, informe o hash SRI em `iconsIntegrity`, gerado com:
  ```bash
  curl -s https://unpkg.com/lucide@0.525.0/dist/umd/lucide.min.js | openssl dgst -sha384 -binary | openssl base64 -A
  ```
  Prefere não depender de CDN? Sirva o arquivo do seu domínio (`iconsUrl: '/js/lucide.min.js'`) ou use `iconsUrl: false` se a página já carrega o Lucide. Se os ícones não carregarem, a barra mostra o nome dos botões.
- **Google Fonts e LGPD:** as fontes do menu de fontes vêm do Google, que recebe o IP do visitante. Use `googleFonts: false` para desligar (no editor e no preview) e sirva as fontes localmente se precisar delas.
- **`ai-api.php`:** aceita só `POST` da própria origem, exige sessão PHP quando há chave de API configurada, limita tamanho do prompt e número de chamadas, e sanitiza a resposta. Configuração por variáveis de ambiente, documentadas no topo do arquivo.

## 📂 Estrutura de Diretórios

```text
/wysiwyg-editor
├── dist/                   # Versões finais de produção (.min.js)
├── examples/               # Exemplos práticos de uso em HTML
├── src/                    # Arquivos fontes em desenvolvimento
│   ├── core/               # Núcleo: plugins, comandos, seleção e histórico
│   ├── plugins/            # Ferramentas modulares (Tabelas, Imagens, Vídeos, etc)
│   └── editor.js           # Orquestrador principal do editor
├── gulpfile.js             # Pipeline de automação do build
├── package.json            # Dependências do Node.js
└── README.md               # Esta documentação
```

## 📄 Licença

Este projeto está licenciado sob a ISC License.