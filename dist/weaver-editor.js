function CommandRegistry(editor) {
  this.editor = editor;
  this.commands = {};
}

CommandRegistry.prototype.register = function (name, fn) {
  this.commands[name] = fn;
};

CommandRegistry.prototype.exec = function (name, editor, value) {
  if (this.commands[name]) {
    this.commands[name](editor, value);
  }
};
function Plugin(editor) {
  this.editor = editor;
}

Plugin.prototype.init = function () {};
/**
 * HtmlSanitizer - Sanitizador central do Weaver Editor (allowlist).
 *
 * Todo HTML que entra no editor (conteúdo inicial, setContent, colar, IA,
 * code view, desfazer/refazer e plugins) passa por aqui.
 *
 * Princípios:
 * - O HTML é interpretado num documento inerte (createHTMLDocument), onde
 *   scripts não rodam e imagens não carregam, então `onerror` nunca dispara.
 * - Somente tags e atributos da allowlist sobrevivem. Tags perigosas são
 *   removidas junto com o conteúdo, mesmo que o integrador as libere.
 * - URLs são normalizadas como o navegador faz (removendo espaços e
 *   caracteres de controle) antes de validar o protocolo.
 * - CSS inline passa por uma allowlist de propriedades e não aceita url().
 * - iframes só são aceitos para players do YouTube e do Vimeo.
 */
function HtmlSanitizer(options) {
  options = options || {};

  this.allowedTags = options.allowedTags || HtmlSanitizer.defaults.allowedTags;
  this.allowedAttributes = options.allowedAttributes || HtmlSanitizer.defaults.allowedAttributes;
  this.allowedStyles = options.allowedStyles || HtmlSanitizer.defaults.allowedStyles;
  this.allowedIframeSources = options.allowedIframeSources || HtmlSanitizer.defaults.allowedIframeSources;
}

HtmlSanitizer.HTML_NS = 'http://www.w3.org/1999/xhtml';

/**
 * Tags removidas SEMPRE, com todo o conteúdo, mesmo se constarem em allowedTags.
 * Inclui as que executam código, carregam recursos ou causam confusão de
 * namespace no parser (svg/math), base de ataques de mXSS.
 */
HtmlSanitizer.FORBIDDEN_TAGS = [
  'script', 'style', 'noscript', 'template', 'object', 'embed', 'applet',
  'frame', 'frameset', 'base', 'link', 'meta', 'title', 'head', 'svg', 'math',
  'xmp', 'plaintext', 'noembed', 'noframes', 'textarea', 'select', 'option',
  'button', 'input', 'form', 'portal'
];

/** Atributos que contêm URLs e precisam de validação de protocolo. */
HtmlSanitizer.URL_ATTRIBUTES = ['href', 'src', 'poster', 'cite'];

/** Padrões CSS que podem carregar recursos ou executar código. */
HtmlSanitizer.UNSAFE_CSS_VALUE = /url\s*\(|expression\s*\(|javascript\s*:|vbscript\s*:|@import|behavior\s*:|-moz-binding|[<>\\]/i;

HtmlSanitizer.defaults = {
  allowedTags: [
    'p', 'b', 'i', 'u', 'strong', 'em',
    'ul', 'ol', 'li',
    'a', 'img',
    'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
    'div', 'span', 'br',
    'table', 'thead', 'tbody', 'tfoot', 'tr', 'th', 'td', 'caption', 'colgroup', 'col',
    'blockquote', 'pre', 'code', 's', 'strike', 'del', 'sub', 'sup', 'hr', 'mark',
    'iframe', 'video', 'audio', 'source', 'figure', 'figcaption'
  ],

  allowedAttributes: {
    '*': ['class', 'id', 'style', 'title', 'dir', 'lang'],
    a: ['href', 'target', 'rel'],
    img: ['src', 'alt', 'width', 'height'],
    iframe: ['src', 'width', 'height', 'allow', 'allowfullscreen', 'frameborder', 'title'],
    table: ['border', 'cellpadding', 'cellspacing', 'width'],
    td: ['colspan', 'rowspan', 'scope', 'width', 'height', 'valign'],
    th: ['colspan', 'rowspan', 'scope', 'width', 'height', 'valign'],
    col: ['span', 'width'],
    colgroup: ['span', 'width'],
    ol: ['start', 'type', 'reversed'],
    blockquote: ['cite'],
    video: ['src', 'controls', 'width', 'height', 'poster', 'loop', 'muted', 'playsinline', 'preload'],
    audio: ['src', 'controls', 'loop', 'muted', 'preload'],
    source: ['src', 'type']
  },

  allowedStyles: [
    'color', 'background-color', 'background',
    'font-family', 'font-size', 'font-weight', 'font-style', 'font-variant',
    'text-decoration', 'text-decoration-line', 'text-align', 'text-indent', 'text-transform',
    'line-height', 'letter-spacing', 'word-spacing', 'white-space', 'vertical-align',
    'margin', 'margin-top', 'margin-right', 'margin-bottom', 'margin-left',
    'padding', 'padding-top', 'padding-right', 'padding-bottom', 'padding-left',
    'border', 'border-top', 'border-right', 'border-bottom', 'border-left',
    'border-width', 'border-style', 'border-color', 'border-radius', 'border-collapse', 'border-spacing',
    'width', 'height', 'max-width', 'min-width', 'max-height', 'min-height',
    'float', 'clear', 'display', 'list-style-type', 'list-style-position'
  ],

  // Somente players de vídeo conhecidos podem ser incorporados.
  allowedIframeSources: [
    /^https:\/\/(?:www\.)?youtube(?:-nocookie)?\.com\/embed\/[A-Za-z0-9_-]{11}(?:\?[^"'<>\s]*)?$/,
    /^https:\/\/player\.vimeo\.com\/video\/\d+(?:\?[^"'<>\s]*)?$/
  ]
};

/**
 * Valores de `display` aceitos. Bloqueia, por exemplo, `contents` e `fixed`
 * em combinações usadas para sobrepor a interface.
 */
HtmlSanitizer.ALLOWED_DISPLAY = ['block', 'inline', 'inline-block', 'none', 'table', 'table-cell', 'table-row', 'list-item', 'flex', 'inline-flex'];

/**
 * Sanitiza e devolve uma string HTML.
 * @param {string} html
 * @returns {string}
 */
HtmlSanitizer.prototype.sanitize = function (html) {
  return this._parse(html).innerHTML;
};

/**
 * Sanitiza e devolve um DocumentFragment pronto para inserir no documento.
 * Os nós são importados de um documento inerte, então nada executa.
 * @param {string} html
 * @returns {DocumentFragment}
 */
HtmlSanitizer.prototype.toFragment = function (html) {
  var body = this._parse(html);
  var fragment = document.createDocumentFragment();

  while (body.firstChild) {
    fragment.appendChild(document.importNode(body.firstChild, true));
    body.removeChild(body.firstChild);
  }

  return fragment;
};

/**
 * Converte texto puro em HTML seguro, preservando quebras de linha.
 * @param {string} text
 * @returns {string}
 */
HtmlSanitizer.prototype.textToHtml = function (text) {
  var escaped = HtmlSanitizer.escapeHtml(String(text || '').replace(/\r\n?/g, '\n'));
  var paragraphs = escaped.split(/\n{2,}/);
  var out = [];

  for (var i = 0; i < paragraphs.length; i++) {
    out.push('<p>' + (paragraphs[i].replace(/\n/g, '<br>') || '<br>') + '</p>');
  }

  return paragraphs.length === 1 ? paragraphs[0].replace(/\n/g, '<br>') : out.join('');
};

/**
 * Valida uma URL para um atributo.
 * @param {string} url
 * @param {string} [tag] - tag do elemento (ex.: 'a', 'img')
 * @param {string} [attr] - atributo (ex.: 'href', 'src')
 * @returns {boolean}
 */
HtmlSanitizer.prototype.isSafeUrl = function (url, tag, attr) {
  if (url === null || url === undefined) return false;

  // O navegador ignora espaços e caracteres de controle antes de interpretar
  // o protocolo (" javascript:" e "java\tscript:" executam). Normalizamos igual.
  var normalized = String(url).replace(/[\u0000-\u0020\u007F-\u00A0\u1680\u180E\u2000-\u200F\u2028\u2029\u202F\u205F\u3000\uFEFF]/g, '');

  var match = /^([a-z][a-z0-9+.\-]*):/i.exec(normalized);

  // Sem protocolo: caminho relativo, âncora ou URL relativa ao protocolo ("//...").
  if (!match) return true;

  var scheme = match[1].toLowerCase();

  if (scheme === 'http' || scheme === 'https') return true;

  if ((scheme === 'mailto' || scheme === 'tel') && (!attr || attr === 'href')) return true;

  if (scheme === 'data' && tag === 'img' && attr === 'src') {
    return /^data:image\/(?:png|jpe?g|gif|webp|avif);/i.test(normalized);
  }

  return false;
};

/**
 * Indica se a URL pode ser usada como src de iframe.
 * @param {string} src
 * @returns {boolean}
 */
HtmlSanitizer.prototype.isAllowedIframeSource = function (src) {
  if (!src) return false;
  for (var i = 0; i < this.allowedIframeSources.length; i++) {
    if (this.allowedIframeSources[i].test(src)) return true;
  }
  return false;
};

/**
 * Filtra uma declaração CSS inline pela allowlist de propriedades.
 * @param {string} cssText
 * @returns {string} CSS limpo (pode ser vazio)
 */
HtmlSanitizer.prototype.cleanStyle = function (cssText) {
  var declarations = HtmlSanitizer.splitDeclarations(cssText || '');
  var kept = [];

  for (var i = 0; i < declarations.length; i++) {
    var decl = declarations[i];
    var colon = decl.indexOf(':');
    if (colon === -1) continue;

    var prop = decl.substring(0, colon).trim().toLowerCase();
    var value = decl.substring(colon + 1).trim();

    if (!prop || !value) continue;
    if (this.allowedStyles.indexOf(prop) === -1) continue;
    if (HtmlSanitizer.UNSAFE_CSS_VALUE.test(value)) continue;

    if (prop === 'display') {
      var displayValue = value.replace(/\s*!important\s*$/i, '').toLowerCase();
      if (HtmlSanitizer.ALLOWED_DISPLAY.indexOf(displayValue) === -1) continue;
    }

    kept.push(prop + ': ' + value);
  }

  return kept.join('; ');
};

// =========================
// INTERNOS
// =========================

HtmlSanitizer.prototype._parse = function (html) {
  var doc = document.implementation.createHTMLDocument('');
  var body = doc.body;

  body.innerHTML = html === null || html === undefined ? '' : String(html);

  this._walk(body);

  return body;
};

HtmlSanitizer.prototype._walk = function (parent) {
  var children = Array.prototype.slice.call(parent.childNodes);

  for (var i = 0; i < children.length; i++) {
    var node = children[i];

    // Comentários e instruções de processamento são descartados.
    if (node.nodeType === 8 || node.nodeType === 7) {
      parent.removeChild(node);
      continue;
    }

    if (node.nodeType !== 1) continue;

    var tag = (node.localName || node.nodeName).toLowerCase();

    // Elementos fora do namespace HTML (svg, math e filhos) são removidos inteiros.
    if (node.namespaceURI && node.namespaceURI !== HtmlSanitizer.HTML_NS) {
      parent.removeChild(node);
      continue;
    }

    if (HtmlSanitizer.FORBIDDEN_TAGS.indexOf(tag) !== -1) {
      parent.removeChild(node);
      continue;
    }

    // Limpa os filhos antes de decidir sobre o pai (bottom-up).
    this._walk(node);

    if (this.allowedTags.indexOf(tag) === -1) {
      // Tag desconhecida: mantém o conteúdo, descarta a tag.
      while (node.firstChild) {
        parent.insertBefore(node.firstChild, node);
      }
      parent.removeChild(node);
      continue;
    }

    if (!this._cleanAttributes(node, tag)) {
      parent.removeChild(node);
    }
  }
};

/**
 * @returns {boolean} false quando o elemento inteiro deve ser removido.
 */
HtmlSanitizer.prototype._cleanAttributes = function (el, tag) {
  var allowedForTag = this.allowedAttributes[tag] || [];
  var allowedGlobal = this.allowedAttributes['*'] || [];
  var attrs = Array.prototype.slice.call(el.attributes);

  for (var i = 0; i < attrs.length; i++) {
    var originalName = attrs[i].name;
    var name = originalName.toLowerCase();
    var value = attrs[i].value;

    // Handlers de evento nunca passam, mesmo se liberados por engano.
    if (name.indexOf('on') === 0 || name === 'srcdoc' || name === 'formaction' || name === 'xmlns' || name.indexOf(':') !== -1) {
      el.removeAttribute(originalName);
      continue;
    }

    if (allowedForTag.indexOf(name) === -1 && allowedGlobal.indexOf(name) === -1) {
      el.removeAttribute(originalName);
      continue;
    }

    if (HtmlSanitizer.URL_ATTRIBUTES.indexOf(name) !== -1 && !this.isSafeUrl(value, tag, name)) {
      el.removeAttribute(originalName);
      continue;
    }

    if (name === 'style') {
      var cleanCss = this.cleanStyle(value);
      if (cleanCss) {
        el.setAttribute('style', cleanCss);
      } else {
        el.removeAttribute(originalName);
      }
      continue;
    }

    if (name === 'target' && ['_blank', '_self', '_parent', '_top'].indexOf(value) === -1) {
      el.removeAttribute(originalName);
    }
  }

  if (tag === 'a') {
    if (el.getAttribute('target') === '_blank') {
      el.setAttribute('rel', 'noopener noreferrer');
    } else {
      el.removeAttribute('rel');
    }
  }

  if (tag === 'iframe') {
    if (!this.isAllowedIframeSource(el.getAttribute('src'))) {
      return false;
    }
    el.setAttribute('sandbox', 'allow-scripts allow-same-origin allow-presentation allow-popups');
    el.setAttribute('referrerpolicy', 'strict-origin-when-cross-origin');
    el.setAttribute('loading', 'lazy');
  }

  return true;
};

/**
 * Divide um cssText em declarações respeitando aspas e parênteses.
 * @param {string} cssText
 * @returns {string[]}
 */
HtmlSanitizer.splitDeclarations = function (cssText) {
  var parts = [];
  var current = '';
  var quote = null;
  var depth = 0;

  for (var i = 0; i < cssText.length; i++) {
    var ch = cssText.charAt(i);

    if (quote) {
      if (ch === quote) quote = null;
    } else if (ch === '"' || ch === "'") {
      quote = ch;
    } else if (ch === '(') {
      depth++;
    } else if (ch === ')') {
      depth = Math.max(0, depth - 1);
    } else if (ch === ';' && depth === 0) {
      parts.push(current);
      current = '';
      continue;
    }

    current += ch;
  }

  if (current.trim()) parts.push(current);

  return parts;
};

HtmlSanitizer.escapeHtml = function (text) {
  return String(text)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
};

window.HtmlSanitizer = HtmlSanitizer;

/**
 * Estilos base do Weaver Editor.
 *
 * A interface usa nomes de classe no padrão do Tailwind (hidden, absolute,
 * z-50...). Sem Tailwind na página, os popovers apareciam todos abertos
 * embaixo do editor. Este CSS cobre essas classes, com escopo em
 * .wysiwyg-editor, então o editor funciona com ou sem Tailwind.
 *
 * Arquivo gerado a partir da lista de classes usadas em src/. Ao usar uma
 * classe utilitária nova num plugin, acrescente-a aqui.
 */
var WeaverBaseStyles = [
  "@keyframes weaver-spin{to{transform:rotate(360deg)}}",
  ".wysiwyg-editor, .wysiwyg-editor *{box-sizing:border-box}",
  ".wysiwyg-editor button{font:inherit;color:inherit;cursor:pointer}",
  ".wysiwyg-editor .editor-content{line-height:1.6}",
  ".wysiwyg-editor .relative{position:relative}",
  ".wysiwyg-editor .absolute{position:absolute}",
  ".wysiwyg-editor .inline-block{display:inline-block}",
  ".wysiwyg-editor .flex{display:flex}",
  ".wysiwyg-editor .flex-col{flex-direction:column}",
  ".wysiwyg-editor .flex-row{flex-direction:row}",
  ".wysiwyg-editor .flex-wrap{flex-wrap:wrap}",
  ".wysiwyg-editor .flex-nowrap{flex-wrap:nowrap}",
  ".wysiwyg-editor .items-center{align-items:center}",
  ".wysiwyg-editor .justify-between{justify-content:space-between}",
  ".wysiwyg-editor .justify-center{justify-content:center}",
  ".wysiwyg-editor .gap-1{gap:.25rem}",
  ".wysiwyg-editor .gap-2{gap:.5rem}",
  ".wysiwyg-editor .gap-3{gap:.75rem}",
  ".wysiwyg-editor .top-full{top:100%}",
  ".wysiwyg-editor .left-0{left:0}",
  ".wysiwyg-editor .right-0{right:0}",
  ".wysiwyg-editor .w-4{width:1rem}",
  ".wysiwyg-editor .h-4{height:1rem}",
  ".wysiwyg-editor .w-8{width:2rem}",
  ".wysiwyg-editor .h-8{height:2rem}",
  ".wysiwyg-editor .w-72{width:18rem}",
  ".wysiwyg-editor .w-80{width:20rem}",
  ".wysiwyg-editor .w-full{width:100%}",
  ".wysiwyg-editor .w-max{width:max-content}",
  ".wysiwyg-editor .w-\\[150px\\]{width:150px}",
  ".wysiwyg-editor .w-\\[15px\\]{width:15px}",
  ".wysiwyg-editor .h-\\[15px\\]{height:15px}",
  ".wysiwyg-editor .h-px{height:1px}",
  ".wysiwyg-editor .min-w-\\[180px\\]{min-width:180px}",
  ".wysiwyg-editor .min-w-\\[32px\\]{min-width:32px}",
  ".wysiwyg-editor .min-w-\\[80px\\]{min-width:80px}",
  ".wysiwyg-editor .max-h-60{max-height:15rem}",
  ".wysiwyg-editor .max-w-none{max-width:none}",
  ".wysiwyg-editor .\\!w-3{width:.75rem!important}",
  ".wysiwyg-editor .\\!h-3{height:.75rem!important}",
  ".wysiwyg-editor .m-0{margin:0}",
  ".wysiwyg-editor .ml-0\\.5{margin-left:.125rem}",
  ".wysiwyg-editor .ml-1{margin-left:.25rem}",
  ".wysiwyg-editor .ml-auto{margin-left:auto}",
  ".wysiwyg-editor .mr-1{margin-right:.25rem}",
  ".wysiwyg-editor .mr-2{margin-right:.5rem}",
  ".wysiwyg-editor .mt-1{margin-top:.25rem}",
  ".wysiwyg-editor .mt-2{margin-top:.5rem}",
  ".wysiwyg-editor .mx-1{margin-left:.25rem;margin-right:.25rem}",
  ".wysiwyg-editor .my-1{margin-top:.25rem;margin-bottom:.25rem}",
  ".wysiwyg-editor .-ml-px{margin-left:-1px}",
  ".wysiwyg-editor .p-1\\.5{padding:.375rem}",
  ".wysiwyg-editor .p-2{padding:.5rem}",
  ".wysiwyg-editor .p-3{padding:.75rem}",
  ".wysiwyg-editor .p-4{padding:1rem}",
  ".wysiwyg-editor .pr-2{padding-right:.5rem}",
  ".wysiwyg-editor .px-1{padding-left:.25rem;padding-right:.25rem}",
  ".wysiwyg-editor .px-2{padding-left:.5rem;padding-right:.5rem}",
  ".wysiwyg-editor .px-3{padding-left:.75rem;padding-right:.75rem}",
  ".wysiwyg-editor .px-4{padding-left:1rem;padding-right:1rem}",
  ".wysiwyg-editor .py-1{padding-top:.25rem;padding-bottom:.25rem}",
  ".wysiwyg-editor .py-1\\.5{padding-top:.375rem;padding-bottom:.375rem}",
  ".wysiwyg-editor .py-2{padding-top:.5rem;padding-bottom:.5rem}",
  ".wysiwyg-editor .border{border:1px solid #e5e7eb}",
  ".wysiwyg-editor .border-b{border-bottom:1px solid #e5e7eb}",
  ".wysiwyg-editor .border-r{border-right:1px solid #e5e7eb}",
  ".wysiwyg-editor .border-none{border:none}",
  ".wysiwyg-editor .border-gray-50{border-color:#f9fafb}",
  ".wysiwyg-editor .border-gray-100{border-color:#f3f4f6}",
  ".wysiwyg-editor .border-gray-200{border-color:#e5e7eb}",
  ".wysiwyg-editor .border-gray-300{border-color:#d1d5db}",
  ".wysiwyg-editor .border-red-200{border-color:#fecaca}",
  ".wysiwyg-editor .border-red-500{border-color:#ef4444}",
  ".wysiwyg-editor .box-border{box-sizing:border-box}",
  ".wysiwyg-editor .rounded{border-radius:.25rem}",
  ".wysiwyg-editor .rounded-sm{border-radius:.125rem}",
  ".wysiwyg-editor .rounded-md{border-radius:.375rem}",
  ".wysiwyg-editor .rounded-none{border-radius:0}",
  ".wysiwyg-editor .rounded-l{border-radius:.25rem 0 0 .25rem}",
  ".wysiwyg-editor .rounded-r{border-radius:0 .25rem .25rem 0}",
  ".wysiwyg-editor .rounded-t-md{border-radius:.375rem .375rem 0 0}",
  ".wysiwyg-editor .rounded-b-md{border-radius:0 0 .375rem .375rem}",
  ".wysiwyg-editor .bg-white{background-color:#fff}",
  ".wysiwyg-editor .bg-gray-50{background-color:#f9fafb}",
  ".wysiwyg-editor .bg-gray-200{background-color:#e5e7eb}",
  ".wysiwyg-editor .bg-blue-600{background-color:#2563eb}",
  ".wysiwyg-editor .bg-purple-600{background-color:#9333ea}",
  ".wysiwyg-editor .text-sm{font-size:.875rem;line-height:1.25rem}",
  ".wysiwyg-editor .text-xs{font-size:.75rem;line-height:1rem}",
  ".wysiwyg-editor .text-center{text-align:center}",
  ".wysiwyg-editor .text-left{text-align:left}",
  ".wysiwyg-editor .text-gray-500{color:#6b7280}",
  ".wysiwyg-editor .text-gray-700{color:#374151}",
  ".wysiwyg-editor .text-gray-800{color:#1f2937}",
  ".wysiwyg-editor .text-blue-600{color:#2563eb}",
  ".wysiwyg-editor .text-purple-600{color:#9333ea}",
  ".wysiwyg-editor .text-red-500{color:#ef4444}",
  ".wysiwyg-editor .text-red-600{color:#dc2626}",
  ".wysiwyg-editor .text-white{color:#fff}",
  ".wysiwyg-editor .font-medium{font-weight:500}",
  ".wysiwyg-editor .font-semibold{font-weight:600}",
  ".wysiwyg-editor .font-sans{font-family:ui-sans-serif,system-ui,-apple-system,\"Segoe UI\",Roboto,Arial,sans-serif}",
  ".wysiwyg-editor .leading-tight{line-height:1.25}",
  ".wysiwyg-editor .shadow-sm{box-shadow:0 1px 2px rgba(0,0,0,.05)}",
  ".wysiwyg-editor .shadow-md{box-shadow:0 4px 6px -1px rgba(0,0,0,.1),0 2px 4px -2px rgba(0,0,0,.1)}",
  ".wysiwyg-editor .shadow-lg{box-shadow:0 10px 15px -3px rgba(0,0,0,.1),0 4px 6px -4px rgba(0,0,0,.1)}",
  ".wysiwyg-editor .shadow-inner{box-shadow:inset 0 2px 4px rgba(0,0,0,.06)}",
  ".wysiwyg-editor .opacity-60{opacity:.6}",
  ".wysiwyg-editor .opacity-70{opacity:.7}",
  ".wysiwyg-editor .opacity-80{opacity:.8}",
  ".wysiwyg-editor .transition-colors{transition:color .15s,background-color .15s,border-color .15s}",
  ".wysiwyg-editor .cursor-pointer{cursor:pointer}",
  ".wysiwyg-editor .select-none{user-select:none}",
  ".wysiwyg-editor .outline-none{outline:none}",
  ".wysiwyg-editor .overflow-hidden{overflow:hidden}",
  ".wysiwyg-editor .overflow-y-auto{overflow-y:auto}",
  ".wysiwyg-editor .resize-none{resize:none}",
  ".wysiwyg-editor .z-10{z-index:10}",
  ".wysiwyg-editor .z-50{z-index:50}",
  ".wysiwyg-editor .z-\\[100\\]{z-index:100}",
  ".wysiwyg-editor .animate-spin{animation:weaver-spin 1s linear infinite}",
  ".wysiwyg-editor .hover\\:bg-gray-50:hover{background-color:#f9fafb}",
  ".wysiwyg-editor .hover\\:bg-gray-100:hover{background-color:#f3f4f6}",
  ".wysiwyg-editor .hover\\:bg-blue-700:hover{background-color:#1d4ed8}",
  ".wysiwyg-editor .hover\\:bg-purple-700:hover{background-color:#7e22ce}",
  ".wysiwyg-editor .hover\\:bg-red-50:hover{background-color:#fef2f2}",
  ".wysiwyg-editor .hover\\:border-blue-500:hover{border-color:#3b82f6}",
  ".wysiwyg-editor .hover\\:z-10:hover{z-index:10}",
  ".wysiwyg-editor .focus\\:outline-none:focus{outline:none}",
  ".wysiwyg-editor .focus\\:border-blue-500:focus{border-color:#3b82f6}",
  ".wysiwyg-editor .focus\\:border-purple-500:focus{border-color:#a855f7}",
  ".wysiwyg-editor .focus\\:ring-1:focus{box-shadow:0 0 0 1px #3b82f6}",
  ".wysiwyg-editor .focus\\:ring-2:focus{box-shadow:inset 0 0 0 2px #3b82f6}",
  ".wysiwyg-editor .focus\\:ring-purple-500:focus{box-shadow:0 0 0 1px #a855f7}",
  ".wysiwyg-editor .disabled\\:opacity-50:disabled{opacity:.5}",
  ".wysiwyg-editor .disabled\\:cursor-not-allowed:disabled{cursor:not-allowed}",
  ".wysiwyg-editor .last\\:border-0:last-child{border-width:0}",
  ".wysiwyg-editor .last\\:border-r-0:last-child{border-right-width:0}",
  ".wysiwyg-editor .last\\:mr-0:last-child{margin-right:0}",
  ".wysiwyg-editor .last\\:pr-0:last-child{padding-right:0}",
  ".wysiwyg-editor .\\[\\&\\.active\\]\\:z-10.active{z-index:10}",
  ".wysiwyg-editor .\\[\\&\\>svg\\]\\:w-4>svg{width:1rem;height:1rem}",
  ".wysiwyg-editor .hidden{display:none}"
].join('\n');

window.WeaverBaseStyles = WeaverBaseStyles;

function SelectionManager(editor) {
  this.editor = editor;
}

/**
 * Tags consideradas equivalentes ao aplicar ou remover uma formatação.
 * Ex.: o botão Negrito reconhece e remove tanto <b> quanto <strong>.
 */
SelectionManager.EQUIVALENT_TAGS = {
  b: ['b', 'strong'],
  i: ['i', 'em'],
  u: ['u', 'ins'],
  s: ['s', 'strike', 'del'],
  sub: ['sub'],
  sup: ['sup']
};

/** Elementos de bloco (usados para agrupar texto solto e achar o bloco atual). */
SelectionManager.BLOCK_TAGS = [
  'P', 'DIV', 'H1', 'H2', 'H3', 'H4', 'H5', 'H6', 'UL', 'OL', 'LI', 'BLOCKQUOTE', 'PRE',
  'TABLE', 'THEAD', 'TBODY', 'TFOOT', 'TR', 'TD', 'TH', 'HR', 'FIGURE', 'FIGCAPTION',
  'IFRAME', 'VIDEO', 'AUDIO', 'SECTION', 'ARTICLE', 'HEADER', 'FOOTER', 'ASIDE', 'NAV'
];

/** Contêineres cujo texto "solto" é só espaço entre tags (não deve ser formatado). */
SelectionManager.STRUCTURAL_TAGS = ['UL', 'OL', 'TABLE', 'THEAD', 'TBODY', 'TFOOT', 'TR', 'COLGROUP'];

SelectionManager.isBlock = function (node) {
  return !!node && node.nodeType === 1 && SelectionManager.BLOCK_TAGS.indexOf(node.tagName) !== -1;
};

SelectionManager.prototype.root = function () {
  return this.editor.$content[0];
};

SelectionManager.prototype.getSelection = function () {
  return window.getSelection();
};

/**
 * Retorna uma CÓPIA do range atual. O range vivo de getRangeAt muda junto
 * com o DOM; guardá-lo para restaurar depois desloca o ponto de inserção.
 */
SelectionManager.prototype.getRange = function () {
  var sel = this.getSelection();
  if (sel.rangeCount === 0) return null;
  return sel.getRangeAt(0).cloneRange();
};

SelectionManager.prototype.setRange = function (range) {
  if (!range) return;
  var sel = this.getSelection();
  sel.removeAllRanges();
  sel.addRange(range);
};

SelectionManager.prototype.isInsideEditor = function () {
  var sel = this.getSelection();
  if (!sel.anchorNode) return false;

  return this.root().contains(sel.anchorNode);
};

/**
 * Como Element.closest, mas NUNCA sobe além do conteúdo do editor.
 * Antes, .closest('div') encontrava a própria div do editor e a substituía.
 */
SelectionManager.prototype.closest = function (node, selector) {
  var root = this.root();
  var el = node && node.nodeType !== 1 ? node.parentNode : node;

  while (el && el !== root && el.nodeType === 1) {
    if (SelectionManager.matches(el, selector)) return el;
    el = el.parentNode;
  }

  return null;
};

SelectionManager.matches = function (el, selector) {
  var fn = el.matches || el.msMatchesSelector || el.webkitMatchesSelector;
  return fn ? fn.call(el, selector) : false;
};

/**
 * Garante que o cursor esteja dentro de um bloco. Texto solto direto na raiz
 * do editor (comum na primeira linha digitada no Chrome) é envolvido num <p>.
 * @returns {Element|null} o bloco de nível superior que contém o cursor
 */
SelectionManager.prototype.ensureBlock = function () {
  var range = this.getRange();
  var root = this.root();
  if (!range || !root.contains(range.startContainer)) return null;

  var node = range.startContainer;
  if (node === root) {
    node = root.childNodes[range.startOffset] || root.childNodes[range.startOffset - 1];
  }
  if (!node) return null;

  while (node.parentNode && node.parentNode !== root) {
    node = node.parentNode;
  }
  if (node.parentNode !== root) return null;
  if (SelectionManager.isBlock(node)) return node;

  // Agrupa a sequência de nós inline vizinhos num único parágrafo
  var start = node;
  var end = node;
  while (start.previousSibling && !SelectionManager.isBlock(start.previousSibling)) start = start.previousSibling;
  while (end.nextSibling && !SelectionManager.isBlock(end.nextSibling)) end = end.nextSibling;

  var sc = range.startContainer, so = range.startOffset;
  var ec = range.endContainer, eo = range.endOffset;

  var p = document.createElement('p');
  root.insertBefore(p, start);

  var stop = end.nextSibling;
  var current = start;
  while (current && current !== stop) {
    var next = current.nextSibling;
    p.appendChild(current);
    current = next;
  }

  // Mover nós reposiciona ranges; restaura a seleção original quando possível
  var restored = document.createRange();
  try {
    if (sc === root || ec === root) throw new Error('raiz');
    restored.setStart(sc, so);
    restored.setEnd(ec, eo);
  } catch (e) {
    restored.selectNodeContents(p);
    restored.collapse(false);
  }
  this.setRange(restored);

  return p;
};

/**
 * Blocos (que casam com o seletor) tocados pela seleção atual, só os mais
 * internos. Com o cursor recolhido, devolve o bloco que contém o cursor.
 * @param {string} selector
 * @returns {Element[]}
 */
SelectionManager.prototype.getSelectedBlocks = function (selector) {
  this.ensureBlock();

  var range = this.getRange();
  if (!range) return [];

  var root = this.root();
  var blocks = [];

  if (range.collapsed || !range.intersectsNode) {
    var single = this.closest(range.startContainer, selector);
    return single ? [single] : [];
  }

  var candidates = root.querySelectorAll(selector);
  for (var i = 0; i < candidates.length; i++) {
    if (range.intersectsNode(candidates[i]) && this._hasSelectedContent(candidates[i], range)) {
      blocks.push(candidates[i]);
    }
  }

  // Mantém só os mais internos (um <div> que envolve vários <p> sai da lista)
  var deepest = [];
  for (var j = 0; j < blocks.length; j++) {
    var containsOther = false;
    for (var k = 0; k < blocks.length; k++) {
      if (j !== k && blocks[j].contains(blocks[k])) {
        containsOther = true;
        break;
      }
    }
    if (!containsOther) deepest.push(blocks[j]);
  }

  if (!deepest.length) {
    var fallback = this.closest(range.startContainer, selector);
    if (fallback) deepest.push(fallback);
  }

  return deepest;
};

/**
 * Evita incluir um bloco só porque a seleção termina na posição 0 dele
 * (ex.: selecionar um parágrafo inteiro com triplo clique).
 * @private
 */
SelectionManager.prototype._hasSelectedContent = function (block, range) {
  if (range.endContainer === block && range.endOffset === 0) return false;

  var probe = document.createRange();
  probe.selectNodeContents(block);

  if (range.compareBoundaryPoints(Range.START_TO_END, probe) <= 0) return false; // seleção termina antes
  if (range.compareBoundaryPoints(Range.END_TO_START, probe) >= 0) return false; // seleção começa depois

  // Seleção termina no início do bloco
  var startOfBlock = document.createRange();
  startOfBlock.setStart(block, 0);
  startOfBlock.collapse(true);
  if (range.compareBoundaryPoints(Range.END_TO_END, startOfBlock) <= 0) return false;

  var textNode = this._firstTextNode(block);
  if (textNode && range.endContainer === textNode && range.endOffset === 0 && !block.contains(range.startContainer)) {
    return false;
  }

  return true;
};

SelectionManager.prototype._firstTextNode = function (node) {
  var walker = document.createTreeWalker(node, NodeFilter.SHOW_TEXT, null, false);
  return walker.nextNode();
};

/**
 * Nós de texto (não vazios) dentro do range, já divididos nas bordas da seleção.
 * @private
 */
SelectionManager.prototype._textNodesInRange = function (range) {
  var root = this.root();
  var container = range.commonAncestorContainer;
  var nodes = [];

  if (container.nodeType === 3) {
    nodes.push(container);
  } else {
    var walker = document.createTreeWalker(container, NodeFilter.SHOW_TEXT, null, false);
    var n;
    while ((n = walker.nextNode())) {
      if (range.intersectsNode(n)) nodes.push(n);
    }
  }

  var result = [];
  for (var i = 0; i < nodes.length; i++) {
    var text = nodes[i];
    if (!root.contains(text)) continue;

    var startOffset = text === range.startContainer ? range.startOffset : 0;
    var endOffset = text === range.endContainer ? range.endOffset : text.nodeValue.length;
    if (endOffset <= startOffset) continue;

    // Espaço entre tags estruturais (<tr>, <ul>...) não é conteúdo
    var parent = text.parentNode;
    if (!/\S/.test(text.nodeValue) && (parent === root || SelectionManager.STRUCTURAL_TAGS.indexOf(parent.tagName) !== -1)) {
      continue;
    }

    if (endOffset < text.nodeValue.length) text.splitText(endOffset);
    if (startOffset > 0) text = text.splitText(startOffset);

    result.push(text);
  }

  return result;
};

/**
 * Elemento ancestral (dentro do editor) com uma das tags equivalentes.
 * @private
 */
SelectionManager.prototype._formatAncestor = function (node, tag) {
  var tags = SelectionManager.EQUIVALENT_TAGS[tag] || [tag];
  return this.closest(node, tags.join(','));
};

/**
 * Aplica a tag inline em cada trecho de texto selecionado, sem quebrar blocos.
 * Antes, um negrito entre dois parágrafos gerava <b><p>…</p><p>…</p></b>.
 */
SelectionManager.prototype.wrap = function (tag) {
  var range = this.getRange();
  if (!range || range.collapsed) return;

  var texts = this._textNodesInRange(range);
  if (!texts.length) return;

  for (var i = 0; i < texts.length; i++) {
    var text = texts[i];
    if (this._formatAncestor(text, tag)) continue;

    var wrapper = document.createElement(tag);
    text.parentNode.insertBefore(wrapper, text);
    wrapper.appendChild(text);
  }

  this._mergeAdjacent(tag);

  // Os nós de texto sobrevivem às fusões: servem de âncora para a seleção
  var first = texts[0];
  var last = texts[texts.length - 1];
  var newRange = document.createRange();
  newRange.setStart(first, 0);
  newRange.setEnd(last, last.nodeValue.length);
  this.setRange(newRange);
  this.root().normalize();
};

/**
 * Indica se TODO o texto selecionado já tem a formatação (ou equivalente).
 */
SelectionManager.prototype.isWrapped = function (tag) {
  var range = this.getRange();
  if (!range) return false;

  if (range.collapsed) {
    return !!this._formatAncestor(range.startContainer, tag);
  }

  var probe = range.cloneRange();
  var texts = this._textNodesWithoutSplitting(probe);
  if (!texts.length) return !!this._formatAncestor(range.commonAncestorContainer, tag);

  for (var i = 0; i < texts.length; i++) {
    if (!this._formatAncestor(texts[i], tag)) return false;
  }
  return true;
};

/** @private Versão de leitura de _textNodesInRange, sem alterar o DOM. */
SelectionManager.prototype._textNodesWithoutSplitting = function (range) {
  var root = this.root();
  var container = range.commonAncestorContainer;
  var nodes = [];

  if (container.nodeType === 3) return [container];

  var walker = document.createTreeWalker(container, NodeFilter.SHOW_TEXT, null, false);
  var n;
  while ((n = walker.nextNode())) {
    if (!range.intersectsNode(n) || !root.contains(n)) continue;
    if (n === range.endContainer && range.endOffset === 0) continue;
    if (n === range.startContainer && range.startOffset === n.nodeValue.length) continue;
    if (!/\S/.test(n.nodeValue) && (n.parentNode === root || SelectionManager.STRUCTURAL_TAGS.indexOf(n.parentNode.tagName) !== -1)) continue;
    nodes.push(n);
  }
  return nodes;
};

/**
 * Remove a formatação SOMENTE do trecho selecionado. Se o negrito cobre a
 * frase inteira e só uma palavra foi selecionada, o resto continua negrito.
 */
SelectionManager.prototype.unwrap = function (tag) {
  var range = this.getRange();
  if (!range) return;

  var root = this.root();
  var tags = SelectionManager.EQUIVALENT_TAGS[tag] || [tag];
  var selector = tags.join(',');

  // Cursor sem seleção: remove a formatação da palavra/elemento inteiro
  if (range.collapsed) {
    var whole = this._formatAncestor(range.startContainer, tag);
    if (whole) this._unwrapElement(whole);
    return;
  }

  // Marcadores preservam as bordas da seleção enquanto o DOM é reorganizado
  // Elemento próprio (não <span>), para não ser confundido com a formatação
  // que está sendo removida (ex.: Remover Formatação tira <span>)
  var startMarker = document.createElement('weaver-marker');
  var endMarker = document.createElement('weaver-marker');
  startMarker.setAttribute('data-weaver-marker', 'start');
  endMarker.setAttribute('data-weaver-marker', 'end');

  var endRange = range.cloneRange();
  endRange.collapse(false);
  endRange.insertNode(endMarker);
  var startRange = range.cloneRange();
  startRange.collapse(true);
  startRange.insertNode(startMarker);

  var between = document.createRange();
  between.setStartAfter(startMarker);
  between.setEndBefore(endMarker);

  // Elementos de formatação tocados pela seleção
  var targets = [];
  var addTarget = function (el) {
    if (el && targets.indexOf(el) === -1) targets.push(el);
  };
  var self = this;
  var collectAncestors = function (node) {
    var el = self.closest(node, selector);
    while (el) {
      addTarget(el);
      el = self.closest(el.parentNode, selector);
    }
  };
  collectAncestors(startMarker);
  collectAncestors(endMarker);

  var inner = root.querySelectorAll(selector);
  for (var i = 0; i < inner.length; i++) {
    if (between.intersectsNode(inner[i])) addTarget(inner[i]);
  }

  for (var t = 0; t < targets.length; t++) {
    var el = targets[t];
    if (!el.parentNode) continue;

    // Parte antes da seleção continua formatada
    if (el.contains(startMarker)) {
      var before = document.createRange();
      before.setStart(el, 0);
      before.setEndBefore(startMarker);
      var beforeFragment = SelectionManager.pruneEmpty(before.extractContents());
      if (/\S/.test(beforeFragment.textContent) || beforeFragment.querySelector && beforeFragment.querySelector('img,br')) {
        var beforeShell = el.cloneNode(false);
        beforeShell.appendChild(beforeFragment);
        el.parentNode.insertBefore(beforeShell, el);
      } else if (beforeFragment.childNodes.length) {
        el.parentNode.insertBefore(beforeFragment, el);
      }
    }

    // Parte depois da seleção continua formatada
    if (el.contains(endMarker)) {
      var after = document.createRange();
      after.setStartAfter(endMarker);
      after.setEnd(el, el.childNodes.length);
      var afterFragment = SelectionManager.pruneEmpty(after.extractContents());
      if (/\S/.test(afterFragment.textContent) || afterFragment.querySelector && afterFragment.querySelector('img,br')) {
        var afterShell = el.cloneNode(false);
        afterShell.appendChild(afterFragment);
        el.parentNode.insertBefore(afterShell, el.nextSibling);
      } else if (afterFragment.childNodes.length) {
        el.parentNode.insertBefore(afterFragment, el.nextSibling);
      }
    }

    this._unwrapElement(el);
  }

  // Restaura a seleção onde estavam os marcadores e remove-os
  var startParent = startMarker.parentNode;
  var endParent = endMarker.parentNode;
  var startIndex = this._indexOf(startMarker);
  var endIndex = this._indexOf(endMarker);

  startParent.removeChild(startMarker);
  if (startParent === endParent && startIndex < endIndex) endIndex--;
  endParent.removeChild(endMarker);

  var restored = document.createRange();
  try {
    restored.setStart(startParent, Math.min(startIndex, startParent.childNodes.length));
    restored.setEnd(endParent, Math.min(endIndex, endParent.childNodes.length));
  } catch (e) {
    restored.selectNodeContents(startParent);
  }
  this.setRange(restored);

  // O range da seleção é vivo: normalize() junta textos sem perder a posição
  this._mergeAdjacent(tag);
  this.root().normalize();
};

/**
 * Remove elementos inline que ficaram vazios ao dividir a formatação
 * (extractContents clona os ancestrais parcialmente selecionados).
 */
SelectionManager.pruneEmpty = function (fragment) {
  var elements = fragment.querySelectorAll ? fragment.querySelectorAll('*') : [];
  for (var i = elements.length - 1; i >= 0; i--) {
    var el = elements[i];
    if (!el.parentNode || el.tagName === 'BR' || el.tagName === 'IMG' || el.tagName === 'WEAVER-MARKER') continue;
    // Sem texto (nem espaço) e sem imagem/quebra dentro: casca vazia
    if (el.textContent === '' && !el.querySelector('img, br, weaver-marker')) {
      el.parentNode.removeChild(el);
    }
  }
  return fragment;
};

SelectionManager.prototype._indexOf = function (node) {
  var index = 0;
  while ((node = node.previousSibling)) index++;
  return index;
};

SelectionManager.prototype._unwrapElement = function (el) {
  var parent = el.parentNode;
  if (!parent) return;
  while (el.firstChild) {
    parent.insertBefore(el.firstChild, el);
  }
  parent.removeChild(el);
};

/**
 * Junta irmãos adjacentes com a mesma tag (<b>a</b><b>b</b> -> <b>ab</b>).
 * @private
 */
SelectionManager.prototype._mergeAdjacent = function (tag) {
  var root = this.root();
  var elements = root.querySelectorAll(tag);

  for (var i = elements.length - 1; i >= 0; i--) {
    var el = elements[i];
    var prev = el.previousSibling;
    if (prev && prev.nodeType === 1 && prev.tagName === el.tagName && !prev.attributes.length && !el.attributes.length) {
      while (el.firstChild) prev.appendChild(el.firstChild);
      el.parentNode.removeChild(el);
    }
  }
};

SelectionManager.prototype.restoreSelection = function (node) {
  var range = document.createRange();
  range.selectNodeContents(node);
  this.setRange(range);
};

SelectionManager.prototype.toggle = function (tag) {
  if (this.isWrapped(tag)) {
    this.unwrap(tag);
  } else {
    this.wrap(tag);
  }
};

SelectionManager.prototype.getActiveFormats = function () {
  var formats = {};
  var range = this.getRange();
  var node = range ? range.commonAncestorContainer : null;
  var root = this.root();

  if (!node || !root.contains(node)) return formats;

  while (node && node !== root) {
    if (node.nodeType === 1) {
      var tag = node.tagName.toLowerCase();

      if (tag === 'b' || tag === 'strong') formats.bold = true;
      if (tag === 'i' || tag === 'em') formats.italic = true;
      if (tag === 'u' || tag === 'ins') formats.underline = true;
      if (tag === 's' || tag === 'strike' || tag === 'del') formats.strikethrough = true;
      if (tag === 'sub') formats.subscript = true;
      if (tag === 'sup') formats.superscript = true;
      if (tag === 'a') formats.link = true;
      if (tag === 'ul') formats.ul = true;
      if (tag === 'ol') formats.ol = true;
    }
    node = node.parentNode;
  }

  return formats;
};

/**
 * Posição do cursor como caminho de índices a partir da raiz, para ser
 * guardada no histórico e restaurada depois de desfazer/refazer.
 * @returns {{start: number[], startOffset: number, end: number[], endOffset: number}|null}
 */
SelectionManager.prototype.serialize = function () {
  var range = this.getRange();
  var root = this.root();
  if (!range || !root.contains(range.startContainer) || !root.contains(range.endContainer)) return null;

  return {
    start: this._pathTo(range.startContainer),
    startOffset: range.startOffset,
    end: this._pathTo(range.endContainer),
    endOffset: range.endOffset
  };
};

SelectionManager.prototype.deserialize = function (saved) {
  if (!saved) return false;

  var start = this._nodeAt(saved.start);
  var end = this._nodeAt(saved.end);
  if (!start || !end) return false;

  try {
    var range = document.createRange();
    range.setStart(start, Math.min(saved.startOffset, this._maxOffset(start)));
    range.setEnd(end, Math.min(saved.endOffset, this._maxOffset(end)));
    this.setRange(range);
    return true;
  } catch (e) {
    return false;
  }
};

SelectionManager.prototype._pathTo = function (node) {
  var root = this.root();
  var path = [];
  while (node && node !== root) {
    var index = 0;
    var sibling = node.previousSibling;
    while (sibling) {
      index++;
      sibling = sibling.previousSibling;
    }
    path.unshift(index);
    node = node.parentNode;
  }
  return path;
};

SelectionManager.prototype._nodeAt = function (path) {
  var node = this.root();
  for (var i = 0; i < path.length; i++) {
    node = node.childNodes[path[i]];
    if (!node) return null;
  }
  return node;
};

SelectionManager.prototype._maxOffset = function (node) {
  return node.nodeType === 3 ? node.nodeValue.length : node.childNodes.length;
};

window.SelectionManager = SelectionManager;

function HistoryManager(editor) {
  this.editor = editor;

  // Cada entrada guarda o HTML e a posição do cursor: { html, caret }
  this.undoStack = [];
  this.redoStack = [];

  this.maxStack = 50;
  this.timeout = null;
}

HistoryManager.prototype.init = function () {
  this.bind();
  this.save(); // estado inicial
};

HistoryManager.prototype.bind = function () {
  var self = this;

  this.editor.$content.on('input' + this.editor.ns, function () {
    clearTimeout(self.timeout);

    self.timeout = setTimeout(function () {
      self.save();
    }, 300);
  });
};

HistoryManager.prototype.current = function () {
  return this.undoStack.length ? this.undoStack[this.undoStack.length - 1] : null;
};

HistoryManager.prototype.save = function () {
  // Uma digitação pendente no debounce entra agora, antes de outra ação
  clearTimeout(this.timeout);

  // Sem estados visuais (imagem selecionada etc.)
  var html = WysiwygEditor.cleanOutput(this.editor.$content.html());
  var caret = this.editor.selection ? this.editor.selection.serialize() : null;
  var top = this.current();

  if (top && top.html === html) {
    // Mesmo conteúdo: só atualiza onde o cursor está
    if (caret) top.caret = caret;
    return;
  }

  this.undoStack.push({ html: html, caret: caret });

  if (this.undoStack.length > this.maxStack) {
    this.undoStack.shift();
  }

  this.redoStack = [];
};

HistoryManager.prototype.undo = function () {
  if (this.undoStack.length < 2) return;

  var current = this.undoStack.pop();
  this.redoStack.push(current);

  this.restore(this.current());
};

HistoryManager.prototype.redo = function () {
  if (!this.redoStack.length) return;

  var next = this.redoStack.pop();
  this.undoStack.push(next);

  this.restore(next);
};

HistoryManager.prototype.restore = function (entry) {
  if (typeof entry === 'string') entry = { html: entry, caret: null };
  if (!entry) return;

  // Não usar jQuery .html(): ele avalia <script> a cada desfazer/refazer.
  this.editor.setContent(entry.html);

  // Devolve o cursor para onde estava, em vez de jogá-lo para o início
  if (!entry.caret || !this.editor.selection.deserialize(entry.caret)) {
    var range = document.createRange();
    range.selectNodeContents(this.editor.$content[0]);
    range.collapse(false);
    this.editor.selection.setRange(range);
  }

  this.editor.trigger('change');
};

window.HistoryManager = HistoryManager;

/**
 * RangeFormatter - Motor robusto de formatação usando Selection/Range APIs
 * Substitui document.execCommand por controle preciso do DOM
 */
function RangeFormatter(editor) {
  this.editor = editor;
}

/**
 * Insere HTML no ponto de seleção atual
 * @param {string} htmlString - HTML a ser inserido
 * @param {boolean} preserveCaret - Se deve posicionar cursor após o conteúdo
 */
RangeFormatter.prototype.insertHTML = function (htmlString, preserveCaret) {
  preserveCaret = preserveCaret !== false; // true por padrão
  
  var sel = window.getSelection();
  
  if (!sel.rangeCount) return false;
  
  var range = sel.getRangeAt(0).cloneRange();

  // Nunca usar range.createContextualFragment: ele EXECUTA <script>.
  // O fragmento vem sanitizado de um documento inerte.
  var fragment = this._sanitizer().toFragment(htmlString);
  if (!fragment.firstChild) return false;

  var lastNode = fragment.lastChild;

  // Remove a seleção atual
  range.deleteContents();

  // Conteúdo de bloco (tabela, vídeo, listas) no meio de um parágrafo:
  // divide o parágrafo no cursor em vez de gerar <p><table>, que o
  // navegador quebraria ao recarregar o HTML.
  var host = this._hasBlock(fragment) ? this._textBlockAt(range.startContainer) : null;

  if (host) {
    this._insertSplittingBlock(range, host, fragment, preserveCaret);
    return true;
  }
  
  // Insere o novo conteúdo
  range.insertNode(fragment);
  
  if (preserveCaret) {
    // Move o cursor para após o conteúdo inserido
    if (lastNode && lastNode.parentNode) {
      range.setStartAfter(lastNode);
      range.collapse(true);
    } else {
      range.collapse(false);
    }
  }
  
  sel.removeAllRanges();
  sel.addRange(range);
  
  return true;
};

RangeFormatter.TEXT_BLOCK_SELECTOR = 'p, h1, h2, h3, h4, h5, h6, pre';

/** @private */
RangeFormatter.prototype._hasBlock = function (fragment) {
  for (var node = fragment.firstChild; node; node = node.nextSibling) {
    if (SelectionManager.isBlock(node)) return true;
  }
  return false;
};

/**
 * Parágrafo/título (dentro do editor) que contém o nó.
 * @private
 */
RangeFormatter.prototype._textBlockAt = function (node) {
  var root = this.editor && this.editor.$content ? this.editor.$content[0] : null;
  var el = node && node.nodeType !== 1 ? node.parentNode : node;

  while (el && el !== root && el.nodeType === 1) {
    if (SelectionManager.matches(el, RangeFormatter.TEXT_BLOCK_SELECTOR)) return el;
    if (SelectionManager.isBlock(el)) return null; // li, td, blockquote aceitam blocos
    el = el.parentNode;
  }
  return null;
};

RangeFormatter.isEmptyBlock = function (el) {
  return !/\S/.test(el.textContent) && !el.querySelector('img, iframe, video, audio, table, hr');
};

/** @private */
RangeFormatter.prototype._insertSplittingBlock = function (range, host, fragment, preserveCaret) {
  // Tudo do cursor até o fim do bloco vai para um novo bloco igual
  var tailRange = document.createRange();
  tailRange.setStart(range.startContainer, range.startOffset);
  tailRange.setEnd(host, host.childNodes.length);

  var tail = host.cloneNode(false);
  tail.appendChild(tailRange.extractContents());

  var parent = host.parentNode;
  var lastInserted = fragment.lastChild;

  parent.insertBefore(tail, host.nextSibling);
  parent.insertBefore(fragment, tail);

  if (RangeFormatter.isEmptyBlock(host)) parent.removeChild(host);

  // O conteúdo inserido já traz um <p> no fim (tabela, vídeo)? Então o
  // pedaço final vazio é descartado para não sobrar linha em branco.
  var tailIsEmpty = RangeFormatter.isEmptyBlock(tail);
  var insertedEndsWithParagraph = lastInserted && lastInserted.nodeType === 1 && lastInserted.tagName === 'P';
  if (tailIsEmpty && insertedEndsWithParagraph) {
    parent.removeChild(tail);
  } else if (!tailIsEmpty && insertedEndsWithParagraph && RangeFormatter.isEmptyBlock(lastInserted) && lastInserted.parentNode) {
    // Já existe texto depois: o <p> vazio que acompanha a tabela/vídeo sobra
    parent.removeChild(lastInserted);
    lastInserted = null;
  } else if (tailIsEmpty) {
    while (tail.firstChild) tail.removeChild(tail.firstChild);
    tail.appendChild(document.createElement('br'));
  }

  if (!preserveCaret) return;

  var caretHost = tail.parentNode ? tail : lastInserted;
  if (!caretHost) return;
  var caret = document.createRange();
  if (caretHost && caretHost.nodeType === 1) {
    caret.selectNodeContents(caretHost);
    caret.collapse(caretHost === tail);
  } else {
    caret.setStartAfter(lastInserted);
    caret.collapse(true);
  }

  var sel = window.getSelection();
  sel.removeAllRanges();
  sel.addRange(caret);
};

/**
 * Sanitizador do editor (ou um padrão, se o RangeFormatter for usado sozinho)
 * @private
 */
RangeFormatter.prototype._sanitizer = function () {
  if (this.editor && this.editor.sanitizer) return this.editor.sanitizer;
  if (!this._fallbackSanitizer) this._fallbackSanitizer = new HtmlSanitizer();
  return this._fallbackSanitizer;
};

/**
 * Insere um node DOM no ponto de seleção
 * @param {Node} node - Node a ser inserido
 * @param {boolean} selectNode - Se deve manter o node selecionado
 */
RangeFormatter.prototype.insertNode = function (node, selectNode) {
  var sel = window.getSelection();
  
  if (!sel.rangeCount) return false;
  
  var range = sel.getRangeAt(0);
  
  // Remove conteúdo selecionado (se houver)
  range.deleteContents();
  
  // Insere o node
  range.insertNode(node);
  
  if (selectNode) {
    // Seleciona o node inserido
    range.selectNode(node);
    sel.removeAllRanges();
    sel.addRange(range);
  } else {
    // Move cursor após o node
    range.setStartAfter(node);
    range.collapse(true);
    sel.removeAllRanges();
    sel.addRange(range);
  }
  
  return true;
};

/**
 * Remove a formatação de link de uma seleção ou link ativo
 * Substitui document.execCommand('unlink')
 */
RangeFormatter.prototype.unwrapLink = function () {
  var sel = window.getSelection();
  
  if (!sel.rangeCount) return false;
  
  var range = sel.getRangeAt(0);
  var container = range.commonAncestorContainer;
  
  // Se container é text node, pega o elemento pai
  var element = container.nodeType === 3 ? container.parentElement : container;
  
  // Procura por <a> na árvore
  var linkNode = element.closest ? element.closest('a') : this._closest(element, 'a');
  
  if (!linkNode) return false;
  
  // Preserva o conteúdo da tag
  while (linkNode.firstChild) {
    linkNode.parentNode.insertBefore(linkNode.firstChild, linkNode);
  }
  
  // Remove a tag <a>
  linkNode.parentNode.removeChild(linkNode);
  
  return true;
};

/**
 * Aplica formatação inline (bold, italic, etc.) em texto selecionado
 * @param {string} tagName - Nome da tag ('strong', 'em', 'u', etc.)
 * @param {object} attributes - Atributos opcionais para a tag
 */
RangeFormatter.prototype.applyInlineFormat = function (tagName, attributes) {
  var sel = window.getSelection();
  
  if (!sel.rangeCount || sel.isCollapsed) return false;
  
  var range = sel.getRangeAt(0);
  var contents = range.extractContents();
  
  var element = document.createElement(tagName);
  
  // Aplica atributos se fornecidos
  if (attributes) {
    for (var attr in attributes) {
      if (attributes.hasOwnProperty(attr)) {
        element.setAttribute(attr, attributes[attr]);
      }
    }
  }
  
  element.appendChild(contents);
  range.insertNode(element);
  
  // Seleciona o elemento formatado
  range.selectNode(element);
  sel.removeAllRanges();
  sel.addRange(range);
  
  return true;
};

/**
 * Remove formatação inline de texto selecionado
 * @param {string} tagName - Nome da tag a remover
 */
RangeFormatter.prototype.removeInlineFormat = function (tagName) {
  var sel = window.getSelection();
  
  if (!sel.rangeCount) return false;
  
  var range = sel.getRangeAt(0);
  var container = range.commonAncestorContainer;
  var element = container.nodeType === 3 ? container.parentElement : container;
  
  // Procura pela tag
  var targetNode = element.closest ? element.closest(tagName) : this._closest(element, tagName);
  
  if (!targetNode) return false;
  
  // Remove a tag mantendo o conteúdo
  while (targetNode.firstChild) {
    targetNode.parentNode.insertBefore(targetNode.firstChild, targetNode);
  }
  targetNode.parentNode.removeChild(targetNode);
  
  return true;
};

/**
 * Retorna o texto atualmente selecionado
 */
RangeFormatter.prototype.getSelectedText = function () {
  var sel = window.getSelection();
  return sel.toString();
};

/**
 * Retorna o elemento pai mais próximo de um tipo específico
 * Polyfill para browsers antigos sem Element.closest()
 * @private
 */
RangeFormatter.prototype._closest = function (element, selector) {
  var el = element;
  while (el && el !== document) {
    if (this._matches(el, selector)) {
      return el;
    }
    el = el.parentElement;
  }
  return null;
};

/**
 * Verifica se elemento faz match com selector
 * @private
 */
RangeFormatter.prototype._matches = function (element, selector) {
  var matches = element.matches || element.msMatchesSelector || element.webkitMatchesSelector;
  if (matches) {
    return matches.call(element, selector);
  }
  
  // Fallback para seletor simples por tag name
  return element.tagName.toLowerCase() === selector.toLowerCase();
};

/**
 * Preserva a seleção atual para restaurar depois
 * Útil quando focus é perdido temporariamente
 */
RangeFormatter.prototype.saveSelection = function () {
  var sel = window.getSelection();
  if (sel.rangeCount === 0) return null;
  
  // Cópia: o range vivo muda junto com o DOM
  return sel.getRangeAt(0).cloneRange();
};

/**
 * Restaura uma seleção anteriormente salva
 * @param {Range} savedRange - Range previamente salvo
 */
RangeFormatter.prototype.restoreSelection = function (savedRange) {
  if (!savedRange) return false;
  
  var sel = window.getSelection();
  sel.removeAllRanges();
  sel.addRange(savedRange);
  
  return true;
};

/**
 * Cria um wrapper em volta do conteúdo selecionado
 * @param {string} tagName - Tag do wrapper
 * @param {object} attributes - Atributos opcionais
 */
RangeFormatter.prototype.wrapSelection = function (tagName, attributes) {
  var sel = window.getSelection();
  
  if (!sel.rangeCount || sel.isCollapsed) return false;
  
  var range = sel.getRangeAt(0);
  var contents = range.extractContents();
  
  var wrapper = document.createElement(tagName);
  
  if (attributes) {
    for (var attr in attributes) {
      if (attributes.hasOwnProperty(attr)) {
        wrapper.setAttribute(attr, attributes[attr]);
      }
    }
  }
  
  wrapper.appendChild(contents);
  range.insertNode(wrapper);
  
  // Seleciona o wrapper
  range.selectNode(wrapper);
  sel.removeAllRanges();
  sel.addRange(range);
  
  return true;
};

/**
 * Remove a seleção sem deletar conteúdo
 */
RangeFormatter.prototype.deselect = function () {
  var sel = window.getSelection();
  sel.removeAllRanges();
  return true;
};

window.RangeFormatter = RangeFormatter;

(function ($) {

  function Editor(element, options) {
    this.$el = $(element);
    this.options = Editor.mergeOptions(Editor.defaults, options || {});
    this.id = ++Editor.instanceCount;
    this.ns = '.weaver' + this.id; // namespace dos eventos desta instância

    this.plugins = [];
    this.commands = {};
    this.state = {};

    this.init();
  }

  Editor.instanceCount = 0;

  /**
   * Opções que são listas ou mapas SUBSTITUEM o padrão em vez de serem fundidas.
   * Com $.extend(true), arrays eram mesclados por posição: pedir só
   * [['font', ['bold']]] gerava a toolbar padrão inteira com 'redo' no meio.
   */
  Editor.REPLACE_OPTIONS = ['toolbar', 'plugins', 'fontNames', 'previewCss', 'allowedTags', 'allowedAttributes', 'allowedStyles', 'allowedIframeSources'];

  Editor.mergeOptions = function (defaults, options) {
    var merged = $.extend(true, {}, defaults);

    for (var key in options) {
      if (!options.hasOwnProperty(key)) continue;
      var value = options[key];

      if (Editor.REPLACE_OPTIONS.indexOf(key) !== -1 || $.isArray(value) || !$.isPlainObject(value)) {
        merged[key] = $.isArray(value) ? value.slice() : value;
      } else {
        merged[key] = $.extend(true, {}, merged[key], value);
      }
    }

    merged.toolbar = Editor.normalizeToolbar(merged.toolbar);
    return merged;
  };

  /**
   * Aceita grupos sem lista de botões (['color']) usando o nome do grupo
   * como botão/alias, como no Summernote.
   */
  Editor.normalizeToolbar = function (toolbar) {
    var normalized = [];
    if (!$.isArray(toolbar)) return normalized;

    for (var i = 0; i < toolbar.length; i++) {
      var group = toolbar[i];
      if (typeof group === 'string') {
        normalized.push([group, [group]]);
      } else if ($.isArray(group) && group.length) {
        var buttons = $.isArray(group[1]) ? group[1].slice() : [group[0]];
        normalized.push([group[0], buttons]);
      }
    }
    return normalized;
  };

  Editor.prototype.init = function () {
    this.injectStyles();
    this.buildLayout();

    this.initCore();

    this.initPlugins();
    this.bindEvents();
  };

  Editor.prototype.buildLayout = function () {
    this.$container = $('<div class="wysiwyg-editor border border-gray-300 rounded-md shadow-sm flex flex-col bg-white font-sans text-gray-800 relative"/>');
    this.$toolbar = $('<div class="editor-toolbar flex flex-wrap gap-1 p-2 border-b border-gray-200 rounded-t-md bg-gray-50 items-center z-10" role="toolbar" aria-label="Ferramentas de formatação"/>');
    
    // Configurações herdadas na inicialização do plugin
    var minHeight = this.options.height ? this.options.height + 'px' : '300px';
    var placeholder = this.options.placeholder || this.$el.attr('placeholder') || 'Digite aqui...';

    this.$content = $('<div contenteditable="true" class="editor-content p-4 outline-none focus:ring-2 focus:ring-inset focus:ring-blue-500 overflow-y-auto prose max-w-none w-full rounded-b-md" role="textbox" aria-multiline="true" aria-label="Editor de conteúdo"/>')
      .css('min-height', minHeight)
      .attr('data-placeholder', placeholder);

    // Área de avisos (erros de upload, IA etc.), lida por leitores de tela
    this.$notice = $('<div class="editor-notice" role="status" aria-live="polite"/>').hide();

    this.$container.append(this.$toolbar, this.$notice, this.$content);
    
    this.isTextarea = this.$el.is('textarea');

    // Se a página tem <label for="..."> para o textarea, ele vira o nome
    // acessível da área de edição (em vez do genérico "Editor de conteúdo")
    var elId = this.$el.attr('id');
    var $label = elId ? $('label[for="' + elId + '"]') : $();
    if ($label.length) {
      if (!$label.attr('id')) $label.attr('id', elId + '-weaver-label');
      this.$content.removeAttr('aria-label').attr('aria-labelledby', $label.attr('id'));
      // Clicar no label foca o editor, já que o textarea fica escondido
      var content = this.$content[0];
      $label.on('click' + this.ns, function (e) {
        e.preventDefault();
        content.focus();
      });
    }

    if (this.isTextarea) {
      // Oculta o textarea nativo e injeta a interface do editor na frente dele
      this.$el.hide();
      this.$container.insertAfter(this.$el);
      
      // Guarda o valor inicial do textarea; ele é carregado (sanitizado) em initCore
      this.initialContent = this.$el.val();

      // Garante a sincronização absoluta no momento do envio do formulário
      var self = this;
      this.$el.closest('form').on('submit' + this.ns, function() {
        self.$el.val(self.getContent());
      });
    } else {
      this.$el.append(this.$container);
    }
  };

  // =========================
  // CORE INIT
  // =========================
  Editor.prototype.initCore = function () {
    this.sanitizer = new HtmlSanitizer(this.options);
    this.commandRegistry = new CommandRegistry(this);
    this.selection = new SelectionManager(this);

    // Conteúdo inicial vindo do textarea: nunca entra sem sanitização
    if (this.initialContent) {
      this.setContent(this.initialContent);
    }

    this.history = new HistoryManager(this);

    this.history.init();
  };

  // =========================
  // PLUGINS
  // =========================
  Editor.prototype.initPlugins = function () {
    var plugins = this.options.plugins;

    // Se nenhum plugin for passado na configuração, carrega os nativos dinamicamente
    if (!plugins || plugins.length === 0) {
      // Plugins essenciais que sempre devem rodar silenciosamente (núcleo do editor)
      var corePlugins = [
        window.ToolbarPlugin,
        window.BasicCommandsPlugin,
        window.SanitizerPlugin,
        window.NormalizerPlugin,
        window.HistoryPlugin
      ];

      // Mapeamento: "Se a toolbar tiver este botão, importe esta extensão"
      var pluginMap = {
        'link': window.LinkPlugin,
        'table': window.TablePlugin,
        'image': window.ImagePlugin,
        'picture': window.ImagePlugin, // Suporte ao apelido do summernote
        'video': window.VideoPlugin,
        'codeview': window.CodeViewPlugin,
        'preview': window.PreviewPlugin,
        'fullscreen': window.FullscreenPlugin,
        'ai': window.AiPlugin
      };

      var activeOptionalPlugins = [];
      var toolbarConfig = this.options.toolbar || [];

      // Verifica a configuração da Toolbar e "acorda" apenas os plugins necessários
      for (var t = 0; t < toolbarConfig.length; t++) {
        var groupButtons = toolbarConfig[t][1] || [];
        for (var b = 0; b < groupButtons.length; b++) {
          var btnName = groupButtons[b];
          var PluginClass = pluginMap[btnName];
          
          if (PluginClass && activeOptionalPlugins.indexOf(PluginClass) === -1) {
            activeOptionalPlugins.push(PluginClass);
          }
        }
      }

      plugins = corePlugins.concat(activeOptionalPlugins).filter(Boolean);
    }

    for (var i = 0; i < plugins.length; i++) {
      var plugin = new plugins[i](this);
      // Nome estável para getPlugin(), mesmo com o código minificado
      if (!plugin.name) plugin.name = Editor.pluginNameOf(plugins[i]);
      this.plugins.push(plugin);

      if (plugin.init) {
        plugin.init();
      }
    }
  };

  // =========================
  // ACESSIBILIDADE (teclado e leitores de tela)
  // =========================

  Editor.FOCUSABLE = 'button:not([disabled]), input:not([disabled]), textarea:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])';

  /**
   * Transforma um popover (link, vídeo, IA...) num diálogo acessível:
   * role="dialog" com nome, rótulos ligados aos campos, Esc fecha e devolve
   * o foco ao botão que abriu, e Tab circula só dentro do popover.
   * @param {jQuery} $popover
   * @param {{label: string, name: string, close: function}} opts
   */
  Editor.prototype.dialogize = function ($popover, opts) {
    var self = this;
    var prefix = 'weaver' + this.id + '-' + opts.name;

    $popover.attr({ role: 'dialog', 'aria-label': opts.label });

    // <label> sem for: liga ao campo do mesmo grupo
    $popover.find('label').each(function (i) {
      var label = this;
      if (label.htmlFor || label.querySelector('input, textarea, select')) return;
      var field = label.parentNode.querySelector('input, textarea, select');
      if (!field) return;
      if (!field.id) field.id = prefix + '-field-' + i;
      label.htmlFor = field.id;
    });

    // Mensagens de erro descrevem o campo ao lado
    $popover.find('[role="alert"]').each(function (i) {
      var msg = this;
      var field = msg.parentNode.querySelector('input, textarea');
      if (!field) return;
      if (!msg.id) msg.id = prefix + '-error-' + i;
      field.setAttribute('aria-describedby', msg.id);
    });

    $popover.on('keydown', function (e) {
      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        opts.close();
        self.focusToolbarButton(opts.name);
        return;
      }

      if (e.key !== 'Tab') return;

      var focusable = $popover.find(Editor.FOCUSABLE).filter(':visible');
      if (!focusable.length) return;
      var first = focusable[0];
      var last = focusable[focusable.length - 1];

      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    });
  };

  /** Devolve o foco ao botão da barra (ou ao conteúdo, se ele não existir). */
  Editor.prototype.focusToolbarButton = function (name) {
    var $btn = this.$toolbar.find('[data-name="' + name + '"]').first();
    if ($btn.length && $btn.is(':visible')) {
      $btn[0].focus();
    } else {
      this.$content[0].focus();
    }
  };

  /**
   * Navegação por teclado num menu (role="menu"): setas movem entre os itens,
   * Home/End vão às pontas, Enter/Espaço ativam e Esc fecha.
   * @param {jQuery} $menu
   * @param {{items: string, close: function}} opts
   */
  Editor.menuKeyboard = function ($menu, opts) {
    $menu.on('keydown', function (e) {
      var items = $menu.find(opts.items).filter(':visible');
      var index = items.index(document.activeElement);
      var next = null;

      switch (e.key) {
        case 'ArrowDown':
        case 'ArrowRight':
          next = items[(index + 1) % items.length];
          break;
        case 'ArrowUp':
        case 'ArrowLeft':
          next = items[(index - 1 + items.length) % items.length];
          break;
        case 'Home':
          next = items[0];
          break;
        case 'End':
          next = items[items.length - 1];
          break;
        case 'Enter':
        case ' ':
          if (index !== -1) {
            e.preventDefault();
            $(items[index]).trigger('click');
          }
          return;
        case 'Escape':
          e.preventDefault();
          e.stopPropagation();
          opts.close(true);
          return;
        case 'Tab':
          opts.close(false);
          return;
        default:
          return;
      }

      e.preventDefault();
      if (next) next.focus();
    });
  };

  Editor.PLUGIN_NAMES = [
    'ToolbarPlugin', 'BasicCommandsPlugin', 'SanitizerPlugin', 'NormalizerPlugin', 'HistoryPlugin',
    'LinkPlugin', 'TablePlugin', 'ImagePlugin', 'VideoPlugin', 'CodeViewPlugin', 'PreviewPlugin',
    'FullscreenPlugin', 'AiPlugin'
  ];

  Editor.pluginNameOf = function (PluginClass) {
    if (PluginClass.pluginName) return PluginClass.pluginName;
    for (var i = 0; i < Editor.PLUGIN_NAMES.length; i++) {
      if (window[Editor.PLUGIN_NAMES[i]] === PluginClass) return Editor.PLUGIN_NAMES[i];
    }
    return PluginClass.name || '';
  };

  Editor.prototype.registerCommand = function (name, fn) {
    this.commandRegistry.register(name, fn);
  };

  Editor.prototype.exec = function (name, value) {
    if (this.history) {
      this.history.save();
    }

    this.commandRegistry.exec(name, this, value); 

    if (this.history) {
      this.history.save();
    }
  };

  Editor.prototype.bindEvents = function () {
    var self = this;

    // Enter cria <p> em vez de <div> (Chrome/Edge); ajuda a manter o HTML limpo
    try {
      document.execCommand('defaultParagraphSeparator', false, 'p');
    } catch (e) { /* navegador sem suporte */ }

    this.$content.on('input' + this.ns, function (e) {
      // A primeira linha digitada no Chrome fica como texto solto na raiz;
      // envolve num <p> (fora de composição de IME, para não atrapalhar acentos)
      var oe = e.originalEvent;
      var root = self.$content[0];
      if (!(oe && oe.isComposing) && root.firstChild && root.firstChild.nodeType === 3 && /\S/.test(root.firstChild.nodeValue)) {
        self.selection.ensureBlock();
      }

      self.trigger('change');
    });

    this.$content.on('keyup' + this.ns + ' mouseup' + this.ns, function () {
      self.updateToolbar();
    });

    // Alt+F10 leva o foco para a barra de ferramentas (padrão de editores)
    this.$content.on('keydown' + this.ns, function (e) {
      if (e.altKey && e.key === 'F10') {
        e.preventDefault();
        var first = self.$toolbar.find('button:visible:not([disabled])').first();
        if (first.length) first[0].focus();
      }
    });

    // Barra de ferramentas: setas esquerda/direita andam entre os botões;
    // Esc volta para o texto
    this.$toolbar.on('keydown' + this.ns, function (e) {
      if ($(e.target).closest('[role="menu"]').length) return;

      var buttons = self.$toolbar.find('.editor-toolbar-group > button, .editor-toolbar-group > .editor-dropdown-wrapper > button').filter(':visible:not([disabled])');
      var index = buttons.index(e.target);
      if (index === -1) return;

      if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') {
        e.preventDefault();
        var step = e.key === 'ArrowRight' ? 1 : -1;
        buttons[(index + step + buttons.length) % buttons.length].focus();
      } else if (e.key === 'Escape') {
        e.preventDefault();
        self.$content[0].focus();
      }
    });
  };

  /**
   * Remove o editor da página: desfaz todos os eventos (inclusive os de
   * document), devolve o textarea com o conteúdo atual e libera a instância.
   */
  Editor.prototype.destroy = function () {
    for (var i = 0; i < this.plugins.length; i++) {
      if (this.plugins[i].destroy) this.plugins[i].destroy();
    }

    if (this.history) clearTimeout(this.history.timeout);

    var content = this.getContent();

    $(document).off(this.ns);
    $(window).off(this.ns);
    $('label').off(this.ns);
    this.$el.closest('form').off(this.ns);
    this.$content.off(this.ns);

    if (this.isTextarea) {
      this.$el.val(content).show();
    }

    this.$container.remove();
    this.$el.removeData('weaver');
    this.plugins = [];
  };

  Editor.prototype.trigger = function (event) {
    var content = this.getContent();
    
    // Se estamos mascarando um textarea, sincronizamos os dados de volta para ele para permitir submissões de formulário perfeitas
    if (this.isTextarea && event === 'change') {
      this.$el.val(content); 
    }
    
    this.$el.trigger(event, [content]);
  };

  Editor.prototype.getContent = function () {
    // O conteúdo já entrou sanitizado (setContent, insertHTML, colar, IA, code view).
    // Importante: sanitize também no servidor. Sanitização no navegador não é
    // uma barreira de segurança, pois o POST pode ser forjado.

    // Com o code view aberto, o conteúdo vigente é o que está no código
    // (antes, enviar o formulário nesse modo descartava as edições)
    if (this.codeView && this.codeView.active) {
      return this.sanitize(this.codeView.$textarea.val());
    }

    return Editor.cleanOutput(this.$content.html());
  };

  /**
   * Remove do HTML final os estados visuais do editor (imagem selecionada,
   * marcadores), que não devem ser salvos no conteúdo.
   */
  Editor.cleanOutput = function (html) {
    if (html.indexOf('weaver-') === -1) return html;

    var holder = document.createElement('div');
    holder.innerHTML = html;

    var states = holder.querySelectorAll('.weaver-selected');
    for (var i = 0; i < states.length; i++) {
      states[i].classList.remove('weaver-selected');
      if (!states[i].getAttribute('class')) states[i].removeAttribute('class');
    }

    var markers = holder.querySelectorAll('weaver-marker');
    for (var m = 0; m < markers.length; m++) {
      markers[m].parentNode.removeChild(markers[m]);
    }

    return holder.innerHTML;
  };

  /**
   * Mostra um aviso curto dentro do editor, no lugar de alert().
   * @param {string} message
   * @param {{type?: 'error'|'info', timeout?: number}} [opts] timeout 0 = fica até ser trocado
   */
  Editor.prototype.notify = function (message, opts) {
    opts = opts || {};
    var self = this;
    var type = opts.type || 'info';
    var timeout = opts.timeout === undefined ? 6000 : opts.timeout;

    clearTimeout(this._noticeTimer);

    if (!message) {
      this.$notice.hide().text('');
      return;
    }

    this.$notice
      .attr('role', type === 'error' ? 'alert' : 'status')
      .attr('data-type', type)
      .text(message)
      .show();

    if (timeout) {
      this._noticeTimer = setTimeout(function () {
        self.$notice.hide().text('');
      }, timeout);
    }
  };

  /**
   * Sanitiza um HTML com as regras deste editor.
   * @param {string} html
   * @returns {string}
   */
  Editor.prototype.sanitize = function (html) {
    return this.sanitizer.sanitize(html);
  };

  Editor.prototype.getPlugin = function (name) {
    for (var i = 0; i < this.plugins.length; i++) {
      // `name` é definido em initPlugins (constructor.name muda ao minificar)
      if (this.plugins[i].name === name) {
        return this.plugins[i];
      }
    }
    return null;
  };

  Editor.prototype.setContent = function (html) {
    // Sempre sanitiza e insere nós vindos de um documento inerte: nenhum
    // <script> ou handler (onerror, onload...) chega a executar.
    var content = this.$content[0];

    while (content.firstChild) {
      content.removeChild(content.firstChild);
    }

    content.appendChild(this.sanitizer.toFragment(html));
  };

  Editor.prototype.updateToolbar = function () {
    for (var i = 0; i < this.plugins.length; i++) {
      if (this.plugins[i].updateState) {
        this.plugins[i].updateState();
      }
    }
  };

  // =========================
  // STYLES
  // =========================

  // =========================
  // DEPENDÊNCIAS EXTERNAS (ícones e fontes)
  // =========================

  Editor.GOOGLE_FONTS_URL = 'https://fonts.googleapis.com/css2?family=Lato&family=Montserrat&family=Open+Sans&family=Oswald&family=Poppins&family=Roboto&display=swap';

  /** Estado do carregamento dos ícones na página: 'loading' | 'loaded' | 'failed' */
  Editor.iconsState = null;

  /**
   * Carrega o Lucide numa versão FIXA (nunca @latest): uma versão nova
   * publicada no CDN não muda nem quebra o editor sem aviso. Com
   * `iconsIntegrity`, o navegador recusa o arquivo se ele for adulterado.
   * `iconsUrl: false` não carrega nada (use quando a página já tem o Lucide
   * ou quando ele é servido pelo seu próprio domínio).
   */
  Editor.prototype.loadIcons = function () {
    if (window.lucide) {
      Editor.iconsState = 'loaded';
      return;
    }

    var url = this.options.iconsUrl;
    if (!url) return;
    if (document.getElementById('lucide-script')) return; // outro editor já pediu

    var script = document.createElement('script');
    script.id = 'lucide-script';
    script.src = url;
    script.crossOrigin = 'anonymous';
    script.referrerPolicy = 'no-referrer';
    if (this.options.iconsIntegrity) {
      script.integrity = this.options.iconsIntegrity;
    }

    Editor.iconsState = 'loading';

    script.onload = function () {
      Editor.iconsState = window.lucide ? 'loaded' : 'failed';
      $('.wysiwyg-editor').each(function () {
        Editor.renderIcons(this);
      });
    };

    // CDN fora do ar, bloqueado ou com integridade inválida: mostra o nome
    // dos botões em vez de deixar a barra cheia de botões em branco
    script.onerror = function () {
      Editor.iconsState = 'failed';
      if (window.console && console.warn) console.warn('Weaver: não foi possível carregar os ícones de ' + url);
      $('.wysiwyg-editor').each(function () {
        Editor.renderIcons(this);
      });
    };

    document.head.appendChild(script);
  };

  /**
   * Desenha os ícones dentro de um elemento do editor (barra, menus).
   * Limitado ao editor: antes, createIcons() sem root trocava qualquer
   * <i data-lucide> da página hospedeira.
   */
  Editor.renderIcons = function (root) {
    if (!root) return;

    if (window.lucide && window.lucide.createIcons) {
      window.lucide.createIcons({ root: root });
      return;
    }

    if (Editor.iconsState === 'failed') {
      $(root).find('i[data-lucide]').each(function () {
        var $icon = $(this);
        var $owner = $icon.closest('button, [title]');
        var label = $owner.attr('aria-label') || $owner.attr('title') || '';
        var $fallback = $('<span class="weaver-icon-fallback"/>').text(label.split(' ')[0]);
        $icon.replaceWith(label ? $fallback : '');
      });
    }
  };

  /**
   * Google Fonts é opcional (`googleFonts: false`): cada carregamento envia
   * o IP do visitante ao Google, o que pede atenção à LGPD/GDPR.
   */
  Editor.prototype.loadFonts = function () {
    if (!this.options.googleFonts || document.getElementById('weaver-google-fonts')) return;

    var fontLink = document.createElement('link');
    fontLink.id = 'weaver-google-fonts';
    fontLink.rel = 'stylesheet';
    fontLink.referrerPolicy = 'no-referrer';
    fontLink.href = Editor.GOOGLE_FONTS_URL;
    document.head.appendChild(fontLink);
  };

  Editor.prototype.injectStyles = function () {
    this.loadIcons();
    this.loadFonts();

    if (document.getElementById('wysiwyg-editor-styles')) return;

    // Convertido para concatenação de strings para garantir a compatibilidade com o ES5
    var css = 
      '.weaver-icon-fallback { font-size: 11px; line-height: 1; padding: 0 2px; white-space: nowrap; }\n' +
      '.wysiwyg-editor button:focus-visible, .wysiwyg-editor [role="menuitem"]:focus-visible, .wysiwyg-editor .editor-table-grid:focus-visible, .wysiwyg-editor input:focus-visible, .wysiwyg-editor textarea:focus-visible { outline: 2px solid #2563eb !important; outline-offset: 1px; }\n' +
      '.wysiwyg-editor .editor-notice { padding: 6px 12px; font-size: 13px; border-bottom: 1px solid #e5e7eb; background: #eff6ff; color: #1e40af; }\n' +
      '.wysiwyg-editor .editor-notice[data-type="error"] { background: #fef2f2; color: #b91c1c; }\n' +
      '.wysiwyg-editor .editor-image-resize { position: absolute; width: 12px; height: 12px; background: #2563eb; border: 2px solid #fff; border-radius: 2px; cursor: nwse-resize; z-index: 51; touch-action: none; box-shadow: 0 0 0 1px #2563eb; }\n' +
      '.wysiwyg-editor .editor-image-alt { display: flex; gap: 4px; align-items: center; }\n' +
      '.wysiwyg-editor .editor-image-alt input { height: 32px; width: 180px; padding: 0 8px; border: 1px solid #d1d5db; border-radius: 4px; font-size: 13px; }\n' +
      '.editor-fullscreen { position: fixed !important; top: 0; left: 0; width: 100vw !important; height: 100vh !important; z-index: 99999; display: flex; flex-direction: column; border: none !important; border-radius: 0 !important; }\n' +
      '.editor-fullscreen .editor-content { flex: 1; overflow-y: auto; }\n' +
      '.editor-show-blocks p, .editor-show-blocks div, .editor-show-blocks ul, .editor-show-blocks ol, .editor-show-blocks blockquote, .editor-show-blocks table {\n' +
      '  border: 1px dashed #adb5bd !important; padding: 2px;\n' +
      '}\n' +
      '.editor-content:empty:before {\n' +
      '  content: attr(data-placeholder);\n' +
      '  color:#999;\n' +
      '}\n' +
      '.editor-preview-frame {\n' +
      '  width:100%;\n' +
      '  height:400px;\n' +
      '  border:1px solid #ddd;\n' +
      '  background:#fff;\n' +
      '  transition: width 0.3s ease; \n' +
      '}\n' +
      '.editor-content.drag-over {\n' +
      '  background: #f0f8ff; \n' +
      '  border: 1px dashed #007bff; \n' +
      '}\n' +
      '.img-resize-wrapper {\n' +
      '  display: inline-block;\n' +
      '  position: relative;\n' +
      '  border: 1px solid #007bff;\n' +
      '}\n' +
      '.img-resize-wrapper img {\n' +
      '  display: block;\n' +
      '  max-width: 100%;\n' +
      '}\n' +
      '.img-resize-handle {\n' +
      '  width: 10px;\n' +
      '  height: 10px;\n' +
      '  background: #007bff;\n' +
      '  position: absolute;\n' +
      '  right: -5px;\n' +
      '  bottom: -5px;\n' +
      '  cursor: se-resize;\n' +
      '}\n' +
      '.editor-content img.weaver-selected {\n' +
      '  outline: 2px solid #007bff;\n' +
      '  outline-offset: 2px;\n' +
      '}\n' +
      '.editor-codeview-wrapper {\n' +
      '  display: none;\n' +
      '  width: 100%;\n' +
      '  height: 400px;\n' +
      '  background: #363636;\n' +
      '  position: relative;\n' +
      '  font-family: Menlo, Monaco, Consolas, "Courier New", monospace;\n' +
      '  font-size: 14px;\n' +
      '  line-height: 1.5;\n' +
      '  box-sizing: border-box;\n' +
      '  overflow: hidden;\n' +
      '}\n' +
      '.editor-codeview-lines {\n' +
      '  position: absolute;\n' +
      '  top: 0; left: 0; bottom: 0;\n' +
      '  width: 50px;\n' +
      '  padding: 15px 5px 15px 0;\n' +
      '  text-align: right;\n' +
      '  color: #888;\n' +
      '  background: #2c2c2c;\n' +
      '  border-right: 1px solid #555;\n' +
      '  box-sizing: border-box;\n' +
      '  overflow: hidden;\n' +
      '  user-select: none;\n' +
      '  white-space: pre;\n' +
      '  font-family: Menlo, Monaco, Consolas, "Courier New", monospace !important;\n' +
      '  font-size: 14px !important;\n' +
      '  line-height: 1.5 !important;\n' +
      '}\n' +
      '.editor-codeview-textarea, .editor-codeview-highlight {\n' +
      '  position: absolute;\n' +
      '  top: 0; left: 50px; right: 0; bottom: 0;\n' +
      '  width: calc(100% - 50px);\n' +
      '  height: 100%;\n' +
      '  padding: 15px;\n' +
      '  margin: 0;\n' +
      '  border: none;\n' +
      '  outline: none;\n' +
      '  font-family: Menlo, Monaco, Consolas, "Courier New", monospace !important;\n' +
      '  font-size: 14px !important;\n' +
      '  line-height: 1.5 !important;\n' +
      '  tab-size: 4 !important;\n' +
      '  white-space: pre;\n' +
      '  box-sizing: border-box;\n' +
      '}\n' +
      '.editor-codeview-textarea {\n' +
      '  color: transparent !important;\n' +
      '  background: transparent !important;\n' +
      '  caret-color: #fff;\n' +
      '  resize: none;\n' +
      '  z-index: 2;\n' +
      '  overflow: auto;\n' +
      '}\n' +
      '.editor-codeview-textarea::selection {\n' +
      '  color: transparent !important;\n' +
      '  background: rgba(100, 150, 255, 0.3) !important;\n' +
      '}\n' +
      '.editor-codeview-textarea::-moz-selection {\n' +
      '  color: transparent !important;\n' +
      '  background: rgba(100, 150, 255, 0.3) !important;\n' +
      '}\n' +
      '.editor-codeview-highlight {\n' +
      '  color: #e0e0e0;\n' +
      '  z-index: 1;\n' +
      '  pointer-events: none;\n' +
      '  overflow: auto;\n' +
      '}\n' +
      '.editor-codeview-highlight .html-tag {\n' +
      '  color: #f9eb26;\n' +
      '}\n';

    // Estilos base (equivalentes às classes Tailwind usadas): o editor
    // funciona mesmo em páginas sem Tailwind
    if (window.WeaverBaseStyles) {
      css = window.WeaverBaseStyles + '\n' + css;
    }

    var style = document.createElement('style');
    style.id = 'wysiwyg-editor-styles';
    style.textContent = css;

    document.head.appendChild(style);
  };

  // =========================
  // DEFAULTS
  // =========================
  Editor.defaults = {
    plugins: [],
    toolbar: [
      ['history', ['undo', 'redo']],
      ['style', ['formatBlock', 'fontName', 'fontSize']],
      ['font', ['bold', 'italic', 'underline', 'strikethrough', 'removeFormat']],
      ['color', ['foreColor', 'backColor']],
      ['para', ['ul', 'ol', 'paragraphGroup']],
      ['insert', ['link', 'table', 'image', 'video', 'hr', 'ai']],
      ['view', ['preview', 'fullscreen', 'showBlocks', 'codeview']]
    ],
    fontNames: null,
    placeholder: '',
    height: null,
    aiEndpoint: 'ai-api.php',
    onAiGenerate: null,
    // Ícones: versão fixa do Lucide. Para servir do seu domínio, aponte para
    // o arquivo local; para usar o Lucide que a página já carrega, use false.
    iconsUrl: 'https://unpkg.com/lucide@0.525.0/dist/umd/lucide.min.js',
    // Hash SRI opcional do arquivo de ícones (ex.: 'sha384-...'); veja o README
    iconsIntegrity: null,
    // Imagens: tamanho máximo do arquivo (bytes) e largura máxima ao
    // embutir em base64 (sem uploadImage), para não inchar o HTML salvo
    maxImageSize: 5 * 1024 * 1024,
    imageMaxWidth: 1600,
    // Carrega as fontes do Google usadas no menu de fontes (editor e preview)
    googleFonts: true
  };

  // =========================
  // JQUERY PLUGIN
  // =========================
  $.fn.weaver = function (options) {
    return this.each(function () {
      var existing = $(this).data('weaver');

      // $('#x').weaver('destroy') remove o editor
      if (options === 'destroy') {
        if (existing) existing.destroy();
        return;
      }

      // Inicializar duas vezes o mesmo elemento criava dois editores
      if (existing) return;

      var editor = new Editor(this, options);
      $(this).data('weaver', editor);
    });
  };

  $.fn.wysiwygEditor = $.fn.weaver;

  window.WysiwygEditor = Editor;

})(jQuery);
window.ToolbarPlugin = ToolbarPlugin;

function ToolbarPlugin(editor) {
  this.editor = editor;
  this.buttons = {};
}

ToolbarPlugin.prototype.init = function () {
  this.render();
};

ToolbarPlugin.prototype.render = function () {
  var editor = this.editor;

  var defaultFonts = editor.options.fontNames || ['Arial', 'Courier New', 'Georgia', 'Tahoma', 'Times New Roman', 'Verdana', 'Roboto', 'Open Sans', 'Lato', 'Montserrat', 'Poppins', 'Oswald'];
  var fontOptionsList = [];
  for (var f = 0; f < defaultFonts.length; f++) {
    var fName = defaultFonts[f];
    fontOptionsList.push({
      label: '<span style="font-family: \'' + fName + '\', sans-serif; font-size:14px;">' + fName + '</span>',
      value: fName
    });
  }

  var defaultButtonLibrary = {
    undo: { name: 'undo', label: '<i data-lucide="undo"></i>', title: 'Desfazer' },
    redo: { name: 'redo', label: '<i data-lucide="redo"></i>', title: 'Refazer' },
    removeFormat: { name: 'removeFormat', label: '<i data-lucide="eraser"></i>', title: 'Remover Formatação' },
    fontName: { name: 'fontName', type: 'dropdown', title: 'Fonte', text: 'Fonte', options: fontOptionsList },
    fontSize: { name: 'fontSize', type: 'dropdown', title: 'Tamanho', text: 'Tamanho', options: [
      { label: '8px', value: '8' },
      { label: '10px', value: '10' },
      { label: '12px', value: '12' },
      { label: '14px', value: '14' },
      { label: 'Padrão (16px)', value: '16' },
      { label: '18px', value: '18' },
      { label: '24px', value: '24' },
      { label: '36px', value: '36' },
      { label: '48px', value: '48' },
      { label: '72px', value: '72' }
    ]},
    formatBlock: { name: 'formatBlock', type: 'dropdown', title: 'Formatos', text: 'Formatos', options: [
      { label: '<p style="margin:0; font-size:14px;">Parágrafo</p>', value: 'P' },
      { label: '<h1 style="margin:0; font-size:24px; font-weight:bold;">Título 1</h1>', value: 'H1' },
      { label: '<h2 style="margin:0; font-size:20px; font-weight:bold;">Título 2</h2>', value: 'H2' },
      { label: '<h3 style="margin:0; font-size:18px; font-weight:bold;">Título 3</h3>', value: 'H3' },
      { label: '<h4 style="margin:0; font-size:16px; font-weight:bold;">Título 4</h4>', value: 'H4' },
      { label: '<h5 style="margin:0; font-size:14px; font-weight:bold;">Título 5</h5>', value: 'H5' },
      { label: '<h6 style="margin:0; font-size:12px; font-weight:bold;">Título 6</h6>', value: 'H6' },
      { label: '<blockquote style="margin:0; border-left:3px solid #ccc; padding-left:8px; font-style:italic; color:#666; font-size:14px;">Citação</blockquote>', value: 'BLOCKQUOTE' },
      { label: '<pre style="margin:0; background:#1f2937; color:#f3f4f6; padding:2px 8px; border-radius:4px; font-size:12px; font-family:monospace; line-height:1.2;">Bloco de Código</pre>', value: 'PRE' }
    ]},
    bold: { name: 'bold', label: '<i data-lucide="bold"></i>', title: 'Negrito' },
    italic: { name: 'italic', label: '<i data-lucide="italic"></i>', title: 'Itálico' },
    underline: { name: 'underline', label: '<i data-lucide="underline"></i>', title: 'Sublinhado' },
    strikethrough: { name: 'strikethrough', label: '<i data-lucide="strikethrough"></i>', title: 'Tachado' },
    subscript: { name: 'subscript', label: '<i data-lucide="subscript"></i>', title: 'Subscrito' },
    superscript: { name: 'superscript', label: '<i data-lucide="superscript"></i>', title: 'Sobrescrito' },
    foreColor: { name: 'foreColor', type: 'color', defaultColor: '#000000', label: '<i data-lucide="baseline"></i>', title: 'Cor da Fonte' },
    backColor: { name: 'backColor', type: 'color', defaultColor: '#ffff00', label: '<i data-lucide="highlighter"></i>', title: 'Cor de Destaque' },
    hr: { name: 'hr', label: '<i data-lucide="minus"></i>', title: 'Linha Horizontal' },
    ul: { name: 'ul', label: '<i data-lucide="list"></i>', title: 'Lista com Marcadores' },
    ol: { name: 'ol', label: '<i data-lucide="list-ordered"></i>', title: 'Lista Numerada' },
    paragraphGroup: { name: 'paragraphGroup', type: 'group', label: '<i data-lucide="align-left"></i>', title: 'Parágrafo', buttons: [
      [
        { name: 'alignLeft', label: '<i data-lucide="align-left"></i>', title: 'Alinhar à Esquerda' },
        { name: 'alignCenter', label: '<i data-lucide="align-center"></i>', title: 'Centralizar' },
        { name: 'alignRight', label: '<i data-lucide="align-right"></i>', title: 'Alinhar à Direita' },
        { name: 'justifyFull', label: '<i data-lucide="align-justify"></i>', title: 'Justificado' }
      ],
      [
        { name: 'outdent', label: '<i data-lucide="outdent"></i>', title: 'Diminuir Margem' },
        { name: 'indent', label: '<i data-lucide="indent"></i>', title: 'Aumentar Margem' }
      ]
    ]},
    link: { name: 'link', label: '<i data-lucide="link"></i>', title: 'Inserir Link' },
    table: { name: 'table', label: '<i data-lucide="table"></i>', title: 'Inserir Tabela' },
    image: { name: 'image', label: '<i data-lucide="image"></i>', title: 'Inserir Imagem' },
    video: { name: 'video', label: '<i data-lucide="video"></i>', title: 'Inserir Vídeo' },
    preview: { name: 'preview', label: '<i data-lucide="eye"></i>', title: 'Visualizar' },
    desktop: { name: 'desktop', label: '<i data-lucide="monitor"></i>', title: 'Modo Desktop', previewOnly: true },
    tablet: { name: 'tablet', label: '<i data-lucide="tablet"></i>', title: 'Modo Tablet', previewOnly: true },
    mobile: { name: 'mobile', label: '<i data-lucide="smartphone"></i>', title: 'Modo Mobile', previewOnly: true },
    closePreview: { name: 'closePreview', label: '<i data-lucide="x"></i> <span class="ml-1 font-semibold text-xs">Sair</span>', title: 'Sair do Preview', previewOnly: true },
    fullscreen: { name: 'fullscreen', label: '<i data-lucide="maximize"></i>', title: 'Tela Cheia' },
    closeFullscreen: { name: 'closeFullscreen', label: '<i data-lucide="x"></i> <span class="ml-1 font-semibold text-xs">Sair</span>', title: 'Sair da Tela Cheia', fullscreenOnly: true },
    showBlocks: { name: 'showBlocks', label: '<i data-lucide="layout-grid"></i>', title: 'Mostrar Blocos' },
    codeview: { name: 'codeview', label: '<i data-lucide="code"></i>', title: 'Código Fonte' },
    ai: { name: 'ai', label: '<i data-lucide="sparkles"></i>', title: 'Assistente IA' }
  };

  var self = this;

  function createButtonElement(btn) {
      var $element;
      var type = btn.type || 'button';

      if (type === 'dropdown') {
        var $wrapper = $('<div class="editor-dropdown-wrapper relative inline-block"/>');
        var $btn = $('<button type="button" class="editor-dropdown-btn flex items-center justify-between gap-1 h-8 px-2 border border-gray-300 bg-white rounded text-sm text-gray-700 hover:bg-gray-50 transition-colors focus:outline-none"/>')
          .attr('data-name', btn.name)
          .attr('title', btn.title || '')
          .attr('aria-label', btn.title || '')
          .attr('aria-haspopup', 'true')
          .attr('aria-expanded', 'false')
          .html('<span>' + (btn.text || btn.title) + '</span> <i data-lucide="chevron-down" class="w-4 h-4"></i>');
        
        var $menu = $('<div class="editor-dropdown-menu hidden absolute top-full left-0 mt-1 bg-white border border-gray-200 rounded shadow-lg z-50 min-w-[180px] max-h-60 overflow-y-auto text-left" role="menu"/>');

        for(var j = 0; j < btn.options.length; j++) {
          var $item = $('<div class="editor-dropdown-item px-3 py-2 text-sm text-gray-700 cursor-pointer hover:bg-gray-100 border-b border-gray-50 last:border-0 leading-tight"/>')
            .html(btn.options[j].label)
            .attr('role', 'menuitem')
            .attr('tabindex', '-1')
            .attr('data-value', btn.options[j].value);
          
          $item.on('mousedown', function(e) { e.preventDefault(); }); // Evita perder o foco
          $item.on('click', function(e) {
            var val = $(this).attr('data-value');
            var fromKeyboard = $menu[0].contains(document.activeElement);
            if (val) {
              editor.exec(btn.name, val);
            }
            $menu.hide();
            $btn.attr('aria-expanded', 'false');
            self.updateState();
            if (fromKeyboard) editor.$content[0].focus();
          });
          $menu.append($item);
        }

        $btn.on('mousedown', function(e) { e.preventDefault(); });
        $btn.on('click', function(e) {
          var isVisible = $menu.is(':visible');
          editor.$toolbar.find('.editor-dropdown-menu').hide(); // Esconde os outros painéis abertos
          editor.$toolbar.find('.editor-dropdown-btn').attr('aria-expanded', 'false');
          if (!isVisible) {
            $menu.removeClass('right-0').addClass('left-0').show();
            $btn.attr('aria-expanded', 'true');
            
            // Verifica se o menu vazou a tela pela direita
            if ($menu[0].getBoundingClientRect().right > editor.$container[0].getBoundingClientRect().right) {
              $menu.removeClass('left-0').addClass('right-0');
            }
          }
        });

        $(document).on('mousedown' + editor.ns, function(e) {
          if (!$wrapper.is(e.target) && $wrapper.has(e.target).length === 0) {
            $menu.hide();
            $btn.attr('aria-expanded', 'false');
          }
        });

        // Teclado: Enter/Espaço/seta para baixo abrem e focam o primeiro item;
        // setas navegam; Esc fecha e devolve o foco ao botão
        WysiwygEditor.menuKeyboard($menu, {
          items: '[role="menuitem"]',
          close: function (returnFocus) {
            $menu.hide();
            $btn.attr('aria-expanded', 'false');
            if (returnFocus) $btn[0].focus();
          }
        });
        $btn.on('click', function (e) {
          // e.detail === 0: ativado pelo teclado (Enter/Espaço)
          if (e.detail === 0 && $menu.is(':visible')) {
            $menu.find('[role="menuitem"]').first().focus();
          }
        });
        $btn.on('keydown', function (e) {
          if (e.key === 'ArrowDown') {
            e.preventDefault();
            if (!$menu.is(':visible')) $btn.trigger('click');
            $menu.find('[role="menuitem"]').first().focus();
          }
        });

        $wrapper.append($btn, $menu);
        $element = $wrapper;
      } else if (type === 'group') {
        var $wrapper = $('<div class="editor-dropdown-wrapper relative inline-block"/>');
        var $btn = $('<button type="button" class="editor-dropdown-btn flex items-center justify-center min-w-[32px] h-8 px-1 border border-gray-300 bg-white rounded text-gray-700 hover:bg-gray-50 transition-colors focus:outline-none [&>svg]:w-4 [&>svg]:h-4"/>')
          .attr('data-name', btn.name)
          .attr('title', btn.title || '')
          .attr('aria-label', btn.title || '')
          .attr('aria-haspopup', 'true')
          .attr('aria-expanded', 'false')
          .html(btn.label + '<i data-lucide="chevron-down" class="!w-3 !h-3 ml-0.5 opacity-60"></i>');
        
        var $menu = $('<div class="editor-dropdown-menu hidden absolute top-full left-0 mt-1 bg-white border border-gray-200 rounded shadow-lg z-50 p-2 flex flex-row flex-nowrap w-max gap-2" role="menu"/>');

        for(var g = 0; g < btn.buttons.length; g++) {
          var groupItems = btn.buttons[g];
          if (!Array.isArray(groupItems)) groupItems = [groupItems];

          var $groupContainer = $('<div class="flex shadow-sm rounded"/>');

          for(var j = 0; j < groupItems.length; j++) {
            var subBtn = groupItems[j];
            
            var roundedClass = groupItems.length === 1 ? 'rounded' : 
                               (j === 0 ? 'rounded-l' : 
                               (j === groupItems.length - 1 ? 'rounded-r' : 'rounded-none'));
            
            var marginClass = j === 0 ? '' : '-ml-px';

            var $subBtn = $('<button type="button" class="flex items-center justify-center w-8 h-8 border border-gray-300 bg-white text-gray-700 hover:bg-gray-50 hover:z-10 [&.active]:z-10 transition-colors focus:outline-none relative [&>svg]:w-4 [&>svg]:h-4 ' + marginClass + ' ' + roundedClass + '"/>')
              .attr('data-name', subBtn.name)
              .attr('title', subBtn.title || '')
              .attr('aria-label', subBtn.title || '')
              .attr('role', 'menuitem')
              .attr('tabindex', '-1')
              .html(subBtn.label)
              .on('mousedown', function(e) { e.preventDefault(); })
              .on('click', (function(cmdName) {
                return function(e) {
                  var fromKeyboard = $menu[0].contains(document.activeElement);
                  editor.exec(cmdName);
                  $menu.hide();
                  $btn.attr('aria-expanded', 'false');
                  self.updateState();
                  if (fromKeyboard) editor.$content[0].focus();
                };
              })(subBtn.name));

            self.buttons[subBtn.name] = $subBtn;
            $groupContainer.append($subBtn);
          }
          $menu.append($groupContainer);
        }

        $btn.on('mousedown', function(e) { e.preventDefault(); });
        $btn.on('click', function(e) {
          var isVisible = $menu.is(':visible');
          editor.$toolbar.find('.editor-dropdown-menu').hide(); 
          editor.$toolbar.find('.editor-dropdown-btn').attr('aria-expanded', 'false');
          if (!isVisible) {
            $menu.removeClass('right-0').addClass('left-0').css('display', 'flex');
            $btn.attr('aria-expanded', 'true');

            // Verifica se o menu vazou a tela pela direita
            if ($menu[0].getBoundingClientRect().right > editor.$container[0].getBoundingClientRect().right) {
              $menu.removeClass('left-0').addClass('right-0');
            }
          }
        });

        $(document).on('mousedown' + editor.ns, function(e) {
          if (!$wrapper.is(e.target) && $wrapper.has(e.target).length === 0) {
            $menu.hide();
            $btn.attr('aria-expanded', 'false');
          }
        });

        // Teclado: Enter/Espaço/seta para baixo abrem e focam o primeiro item;
        // setas navegam; Esc fecha e devolve o foco ao botão
        WysiwygEditor.menuKeyboard($menu, {
          items: '[role="menuitem"]',
          close: function (returnFocus) {
            $menu.hide();
            $btn.attr('aria-expanded', 'false');
            if (returnFocus) $btn[0].focus();
          }
        });
        $btn.on('click', function (e) {
          // e.detail === 0: ativado pelo teclado (Enter/Espaço)
          if (e.detail === 0 && $menu.is(':visible')) {
            $menu.find('[role="menuitem"]').first().focus();
          }
        });
        $btn.on('keydown', function (e) {
          if (e.key === 'ArrowDown') {
            e.preventDefault();
            if (!$menu.is(':visible')) $btn.trigger('click');
            $menu.find('[role="menuitem"]').first().focus();
          }
        });

        $wrapper.append($btn, $menu);
        $element = $wrapper;
      } else if (type === 'color') {
        var defaultColor = btn.defaultColor || '#000000';
        $element = $('<button type="button" class="relative overflow-hidden flex items-center justify-center w-8 h-8 border border-gray-300 bg-white rounded text-gray-700 hover:bg-gray-50 transition-colors focus:outline-none [&>svg]:w-4 [&>svg]:h-4"/>')
          .attr('data-name', btn.name)
          .attr('title', btn.title || '')
          .attr('aria-label', btn.title || '')
          .html(btn.label);

        var $input = $('<input type="color"/>').val(defaultColor).css({
          position: 'absolute',
          left: 0,
          top: 0,
          width: '100%',
          height: '100%',
          margin: 0,
          padding: 0,
          border: 'none',
          opacity: 0,
          cursor: 'pointer'
        })
        .attr('aria-label', 'Escolher cor');

        var savedRange = null;

        $element.on('mousedown', function (e) {
          if (editor.selection && editor.selection.isInsideEditor()) {
            savedRange = editor.selection.getRange();
          }
        });

        $input.on('input change', function () {
          if (savedRange) {
            var sel = window.getSelection();
            sel.removeAllRanges();
            sel.addRange(savedRange); 
          }

          var val = $(this).val();
          editor.exec(btn.name, val);

          if (editor.selection && editor.selection.isInsideEditor()) {
            savedRange = editor.selection.getRange();
          }
          self.updateState();
        });

        $element.append($input);
      } else {
        $element = $('<button type="button" class="flex items-center justify-center min-w-[32px] h-8 px-1 border border-gray-300 bg-white rounded text-gray-700 hover:bg-gray-50 transition-colors disabled:opacity-50 disabled:cursor-not-allowed focus:outline-none [&>svg]:w-4 [&>svg]:h-4"/>')
          .attr('data-name', btn.name)
          .attr('title', btn.title || '')
          .attr('aria-label', btn.title || '')
          .html(btn.label)
          .on('mousedown', function(e) { e.preventDefault(); })
          .on('click', function () {
          editor.exec(btn.name);

          self.updateState();
        });
      }

      // Define se o botão é padrão ou exclusivo do modo Preview
      if (btn.previewOnly) {
        $element.addClass('preview-only-btn hidden');
        // Joga o botão de "Sair" lá para a ponta direita (ml-auto) e deixa ele com tom de alerta vermelho
        if (btn.name === 'closePreview') {
          $element.removeClass('text-gray-700 hover:bg-gray-50 px-1').addClass('ml-auto text-red-600 hover:bg-red-50 border-red-200 px-3');
        }
    } else if (btn.fullscreenOnly) {
      $element.addClass('fullscreen-only-btn hidden');
      if (btn.name === 'closeFullscreen') {
        $element.removeClass('text-gray-700 hover:bg-gray-50 px-1').addClass('text-red-600 hover:bg-red-50 border-red-200 px-3');
      }
      } else {
        $element.addClass('standard-btn');
      }

      self.buttons[btn.name] = $element;

      return $element;
  }

  // Mapeamento Inteligente: caso o usuário use a sintaxe nativa do Summernote, o plugin vai entendê-lo
  var aliasMap = {
    'style': ['formatBlock'],
    'clear': ['removeFormat'],
    'picture': ['image'],
    'paragraph': ['paragraphGroup'],
    'color': ['foreColor', 'backColor']
  };

  var toolbarConfig = editor.options.toolbar;

  for (var i = 0; i < toolbarConfig.length; i++) {
    var groupButtonsRaw = toolbarConfig[i][1];
    var groupButtons = [];
    
    // Desenrola Aliases e Nomes
    for (var b = 0; b < groupButtonsRaw.length; b++) {
      var rawName = groupButtonsRaw[b];
      if (aliasMap[rawName]) groupButtons = groupButtons.concat(aliasMap[rawName]);
      else groupButtons.push(rawName);
    }

    // Cria a caixinha elegante que comportará o grupo e a margem divisória
    var $groupWrapper = $('<div class="editor-toolbar-group flex gap-1 items-center mr-2 pr-2 border-r border-gray-300 last:border-r-0 last:mr-0 last:pr-0"/>');

    for (var k = 0; k < groupButtons.length; k++) {
      var btnData = defaultButtonLibrary[groupButtons[k]];
      if (btnData) $groupWrapper.append(createButtonElement(btnData));
    }

    if (groupButtons.length > 0) editor.$toolbar.append($groupWrapper);
  }

  // Garante que os botões vitais de Preview sejam gerados silenciosamente no fundo para entrarem em ação
  var previewBtns = ['desktop', 'tablet', 'mobile', 'closePreview'];
  var $pGroup = $('<div class="editor-toolbar-group flex gap-1 items-center w-full hidden"/>');
  for (var p = 0; p < previewBtns.length; p++) {
    if (!self.buttons[previewBtns[p]]) $pGroup.append(createButtonElement(defaultButtonLibrary[previewBtns[p]]));
  }
  if ($pGroup.children().length > 0) editor.$toolbar.append($pGroup);

  // Garante que o botão de sair da tela cheia seja anexado no fim da barra, à direita (ml-auto)
  var $fsGroup = $('<div class="editor-toolbar-group flex gap-1 items-center ml-auto hidden"/>');
  var fullscreenBtns = ['closeFullscreen'];
  for (var f = 0; f < fullscreenBtns.length; f++) {
    if (!self.buttons[fullscreenBtns[f]]) $fsGroup.append(createButtonElement(defaultButtonLibrary[fullscreenBtns[f]]));
  }
  if ($fsGroup.children().length > 0) editor.$toolbar.append($fsGroup);

  WysiwygEditor.renderIcons(editor.$toolbar[0]);
};

ToolbarPlugin.prototype.updateState = function () {
  if (!this.editor.selection) return;

  var formats = this.editor.selection.getActiveFormats();

  for (var key in this.buttons) {
    this.buttons[key].removeClass('bg-gray-200 shadow-inner active').addClass('bg-white').removeAttr('aria-pressed');
  }

  // Estado lido do DOM (o editor não usa execCommand, então queryCommandState
  // não refletia <strong>, <del> etc.)
  var formatButtons = ['bold', 'italic', 'underline', 'strikethrough', 'subscript', 'superscript', 'link', 'ul', 'ol'];
  for (var f = 0; f < formatButtons.length; f++) {
    var name = formatButtons[f];
    if (formats[name] && this.buttons[name]) {
      this.buttons[name].removeClass('bg-white').addClass('bg-gray-200 shadow-inner active').attr('aria-pressed', 'true');
    }
  }

  // Alinhamento: lê o text-align calculado do bloco atual
  var range = this.editor.selection.getRange();
  var block = range ? this.editor.selection.closest(range.startContainer, 'p, div, h1, h2, h3, h4, h5, h6, blockquote, li, td, th, pre') : null;
  if (block) {
    var align = (window.getComputedStyle(block).textAlign || '').toLowerCase();
    var alignButtons = { left: 'alignLeft', start: 'alignLeft', center: 'alignCenter', right: 'alignRight', end: 'alignRight', justify: 'justifyFull' };
    var alignBtn = this.buttons[alignButtons[align]];
    if (alignBtn) alignBtn.removeClass('bg-white').addClass('bg-gray-200 shadow-inner active').attr('aria-pressed', 'true');
  }

  if (this.editor.$content.hasClass('editor-show-blocks') && this.buttons.showBlocks) {
    this.buttons.showBlocks.removeClass('bg-white').addClass('bg-gray-200 shadow-inner active');
  }
};
window.BasicCommandsPlugin = BasicCommandsPlugin;

function BasicCommandsPlugin(editor) {
  this.editor = editor;
}

BasicCommandsPlugin.prototype.init = function () {
  var editor = this.editor;

  // --- Funções Auxiliares baseadas em Selection e Range ---

  /**
   * Aplica um estilo (cor, fonte, tamanho) a cada trecho de texto selecionado.
   * Trabalha nó a nó, então nunca coloca parágrafos dentro de <span>, e
   * reaproveita o <span> quando ele envolve exatamente o trecho (evita
   * <span><span><span> ao trocar a cor várias vezes).
   */
  function applySpanStyle(styleProp, value) {
    // Força o foco no editor para recuperar a seleção após usar o color picker
    editor.$content.focus();

    var range = editor.selection.getRange();
    if (!range || range.collapsed || !editor.selection.isInsideEditor()) return;

    var texts = editor.selection._textNodesInRange(range);
    if (!texts.length) return;

    for (var i = 0; i < texts.length; i++) {
      var text = texts[i];
      var parent = text.parentNode;

      if (parent.tagName === 'SPAN' && parent.childNodes.length === 1) {
        parent.style[styleProp] = value;
        continue;
      }

      var span = document.createElement('span');
      span.style[styleProp] = value;
      parent.insertBefore(span, text);
      span.appendChild(text);
    }

    var first = texts[0];
    var last = texts[texts.length - 1];
    var newRange = document.createRange();
    newRange.setStart(first, 0);
    newRange.setEnd(last, last.nodeValue.length);
    editor.selection.setRange(newRange);

    editor.trigger('change');
    editor.updateToolbar();
  }

  // Blocos que recebem alinhamento, recuo e troca de formato.
  // A busca é limitada ao conteúdo do editor (SelectionManager.closest):
  // antes, .closest('div') encontrava a própria div do editor e a substituía.
  var ALIGNABLE_BLOCKS = 'p, div, h1, h2, h3, h4, h5, h6, blockquote, li, td, th, pre';
  var TEXT_BLOCKS = 'p, div, h1, h2, h3, h4, h5, h6, blockquote, pre';

  /**
   * Troca a tag de um elemento movendo os filhos (sem reinterpretar HTML)
   * e preservando alinhamento, classes e direção.
   */
  function replaceTag(el, newTag) {
    var replacement = document.createElement(newTag);
    var keep = ['style', 'class', 'dir', 'lang'];
    for (var i = 0; i < keep.length; i++) {
      if (el.hasAttribute(keep[i])) replacement.setAttribute(keep[i], el.getAttribute(keep[i]));
    }
    while (el.firstChild) replacement.appendChild(el.firstChild);
    el.parentNode.replaceChild(replacement, el);
    return replacement;
  }

  function selectAcross(first, last) {
    var range = document.createRange();
    range.selectNodeContents(first);
    var end = document.createRange();
    end.selectNodeContents(last);
    range.setEnd(end.endContainer, end.endOffset);
    editor.selection.setRange(range);
  }

  function emptyParagraph() {
    var p = document.createElement('p');
    p.appendChild(document.createElement('br'));
    return p;
  }

  /** Garante um bloco para formatar mesmo com o editor vazio. */
  function blocksOrNew(selector) {
    var blocks = editor.selection.getSelectedBlocks(selector);
    if (blocks.length) return blocks;

    var root = editor.$content[0];
    if (!root.firstChild || !/\S/.test(root.textContent) && !root.querySelector('img,iframe,video,table,hr')) {
      var p = emptyParagraph();
      root.innerHTML = '';
      root.appendChild(p);
      editor.selection.restoreSelection(p);
      return [p];
    }
    return [];
  }

  function applyAlignment(align) {
    if (!editor.selection || !editor.selection.isInsideEditor()) return;

    var blocks = blocksOrNew(ALIGNABLE_BLOCKS);
    for (var i = 0; i < blocks.length; i++) {
      blocks[i].style.textAlign = align === 'left' ? '' : align;
      if (!blocks[i].getAttribute('style')) blocks[i].removeAttribute('style');
    }

    editor.trigger('change');
    editor.updateToolbar();
  }

  function changeIndent(delta) {
    if (!editor.selection || !editor.selection.isInsideEditor()) return;

    var blocks = editor.selection.getSelectedBlocks(ALIGNABLE_BLOCKS);
    var changed = false;

    for (var i = 0; i < blocks.length; i++) {
      var current = parseInt(blocks[i].style.marginLeft, 10) || 0;
      var next = Math.max(0, current + delta);
      if (next === current) continue;
      blocks[i].style.marginLeft = next ? next + 'px' : '';
      if (!blocks[i].getAttribute('style')) blocks[i].removeAttribute('style');
      changed = true;
    }

    if (changed) editor.trigger('change');
  }

  function formatBlock(value) {
    if (!editor.selection || !editor.selection.isInsideEditor()) return;

    var tagName = String(value || '').toLowerCase();
    if (!/^(p|h[1-6]|blockquote|pre)$/.test(tagName)) return;

    var blocks = blocksOrNew(TEXT_BLOCKS);
    if (!blocks.length) return;

    var replaced = [];
    for (var i = 0; i < blocks.length; i++) {
      replaced.push(blocks[i].tagName.toLowerCase() === tagName ? blocks[i] : replaceTag(blocks[i], tagName));
    }

    selectAcross(replaced[0], replaced[replaced.length - 1]);
    editor.trigger('change');
    editor.updateToolbar();
  }

  function toggleList(listTag) {
    if (!editor.selection || !editor.selection.isInsideEditor()) return;

    editor.selection.ensureBlock();
    var range = editor.selection.getRange();
    if (!range) return;

    var currentList = editor.selection.closest(range.startContainer, 'ul, ol');

    if (currentList) {
      if (currentList.tagName.toLowerCase() !== listTag) {
        // Troca ul <-> ol mantendo itens e sublistas
        var swapped = replaceTag(currentList, listTag);
        selectAcross(swapped, swapped);
      } else {
        // Desfaz a lista: cada item DIRETO vira um parágrafo; sublistas
        // ficam logo depois do parágrafo do item (antes eram duplicadas)
        var fragment = document.createDocumentFragment();
        var items = Array.prototype.slice.call(currentList.children);
        var firstP = null;
        var lastP = null;

        for (var i = 0; i < items.length; i++) {
          var item = items[i];
          if (item.tagName !== 'LI') {
            fragment.appendChild(item);
            continue;
          }
          var p = document.createElement('p');
          var nested = [];
          while (item.firstChild) {
            var child = item.firstChild;
            if (child.nodeType === 1 && (child.tagName === 'UL' || child.tagName === 'OL')) {
              nested.push(child);
              item.removeChild(child);
            } else {
              p.appendChild(child);
            }
          }
          if (!p.firstChild) p.appendChild(document.createElement('br'));
          fragment.appendChild(p);
          for (var n = 0; n < nested.length; n++) fragment.appendChild(nested[n]);
          if (!firstP) firstP = p;
          lastP = p;
        }

        currentList.parentNode.replaceChild(fragment, currentList);
        if (firstP) selectAcross(firstP, lastP);
      }
    } else {
      var blocks = blocksOrNew(TEXT_BLOCKS);
      if (!blocks.length) return;

      var list = document.createElement(listTag);
      blocks[0].parentNode.insertBefore(list, blocks[0]);

      for (var b = 0; b < blocks.length; b++) {
        var li = document.createElement('li');
        while (blocks[b].firstChild) li.appendChild(blocks[b].firstChild);
        if (!li.firstChild) li.appendChild(document.createElement('br'));
        list.appendChild(li);
        blocks[b].parentNode.removeChild(blocks[b]);
      }

      selectAcross(list.firstChild, list.lastChild);
    }

    editor.trigger('change');
    editor.updateToolbar();
  }

  // --- Registro de Comandos Nativos Customizados ---

  editor.registerCommand('bold', function (editor) {
    if (!editor.selection || !editor.selection.isInsideEditor()) return;
    editor.selection.toggle('b');
    editor.trigger('change');
    editor.updateToolbar();
  });

  editor.registerCommand('italic', function (editor) {
    if (!editor.selection || !editor.selection.isInsideEditor()) return;
    editor.selection.toggle('i');
    editor.trigger('change');
    editor.updateToolbar();
  });

  editor.registerCommand('underline', function (editor) {
    if (!editor.selection || !editor.selection.isInsideEditor()) return;
    editor.selection.toggle('u');
    editor.trigger('change');
    editor.updateToolbar();
  });

  editor.registerCommand('strikethrough', function (editor) {
    if (!editor.selection || !editor.selection.isInsideEditor()) return;
    editor.selection.toggle('s');
    editor.trigger('change');
    editor.updateToolbar();
  });

  editor.registerCommand('subscript', function (editor) {
    if (!editor.selection || !editor.selection.isInsideEditor()) return;
    editor.selection.toggle('sub');
    editor.trigger('change');
    editor.updateToolbar();
  });

  editor.registerCommand('superscript', function (editor) {
    if (!editor.selection || !editor.selection.isInsideEditor()) return;
    editor.selection.toggle('sup');
    editor.trigger('change');
    editor.updateToolbar();
  });

  editor.registerCommand('hr', function (editor) {
    if (!editor.selection || !editor.selection.isInsideEditor()) return;

    // Inserção ciente de blocos: divide o parágrafo em vez de pôr <hr> dentro dele
    new RangeFormatter(editor).insertHTML('<hr><p><br></p>');

    editor.trigger('change');
    editor.updateToolbar();
  });

  editor.registerCommand('ul', function (editor) { toggleList('ul'); });
  editor.registerCommand('ol', function (editor) { toggleList('ol'); });

  editor.registerCommand('alignLeft', function (editor) { applyAlignment('left'); });
  editor.registerCommand('alignCenter', function (editor) { applyAlignment('center'); });
  editor.registerCommand('alignRight', function (editor) { applyAlignment('right'); });
  editor.registerCommand('justifyFull', function (editor) { applyAlignment('justify'); });

  editor.registerCommand('indent', function () { changeIndent(20); });
  editor.registerCommand('outdent', function () { changeIndent(-20); });

  editor.registerCommand('removeFormat', function (editor) {
    if (!editor.selection || !editor.selection.isInsideEditor()) return;
    var range = editor.selection.getRange();
    if (!range || range.collapsed) return;

    // Remove só do trecho selecionado, dividindo a formatação nas bordas.
    // Links são mantidos (remover formatação não deveria apagar links).
    var tags = ['b', 'i', 'u', 's', 'sub', 'sup', 'span', 'font', 'mark', 'code'];
    for (var i = 0; i < tags.length; i++) {
      editor.selection.unwrap(tags[i]);
    }

    editor.trigger('change');
    editor.updateToolbar();
  });

  editor.registerCommand('formatBlock', function (editor, value) { formatBlock(value); });

  editor.registerCommand('foreColor', function (editor, value) {
    applySpanStyle('color', value);
  });

  editor.registerCommand('backColor', function (editor, value) {
    applySpanStyle('backgroundColor', value);
  });

  editor.registerCommand('fontName', function (editor, value) {
    applySpanStyle('fontFamily', value);
  });

  editor.registerCommand('fontSize', function (editor, value) {
    var remValue = (parseInt(value, 10) / 16) + 'rem';
    applySpanStyle('fontSize', remValue);
  });

  editor.registerCommand('showBlocks', function (editor) {
    editor.$content.toggleClass('editor-show-blocks');
  });

  // --- Tab em listas e tabelas ---

  /** Executa fn preservando a seleção (mover nós no DOM reseta ranges). */
  function keepSelection(fn) {
    var range = editor.selection.getRange();
    var saved = range ? [range.startContainer, range.startOffset, range.endContainer, range.endOffset] : null;
    fn();
    if (!saved) return;
    try {
      var restored = document.createRange();
      restored.setStart(saved[0], saved[1]);
      restored.setEnd(saved[2], saved[3]);
      editor.selection.setRange(restored);
    } catch (e) { /* nós removidos */ }
  }

  /** Tab num item: vira subitem do item anterior. */
  function indentListItem(li) {
    var prev = li.previousElementSibling;
    if (!prev || prev.tagName !== 'LI') return false;

    keepSelection(function () {
      var listTag = li.parentNode.tagName.toLowerCase();
      var sub = prev.lastElementChild;
      if (!sub || (sub.tagName !== 'UL' && sub.tagName !== 'OL')) {
        sub = document.createElement(listTag);
        prev.appendChild(sub);
      }
      sub.appendChild(li);
    });
    return true;
  }

  /** Shift+Tab num item: sobe um nível (ou sai da lista no primeiro nível). */
  function outdentListItem(li) {
    var list = li.parentNode;
    var parentItem = list.parentNode;

    keepSelection(function () {
      // Itens depois deste viram subitens dele, como nos editores de texto
      var following = [];
      for (var next = li.nextElementSibling; next; next = next.nextElementSibling) following.push(next);

      if (parentItem && parentItem.tagName === 'LI') {
        if (following.length) {
          var sub = document.createElement(list.tagName.toLowerCase());
          for (var i = 0; i < following.length; i++) sub.appendChild(following[i]);
          li.appendChild(sub);
        }
        parentItem.parentNode.insertBefore(li, parentItem.nextSibling);
        if (!list.children.length) list.parentNode.removeChild(list);
      } else {
        // Primeiro nível: o item vira parágrafo, dividindo a lista
        var p = document.createElement('p');
        while (li.firstChild) p.appendChild(li.firstChild);
        if (!p.firstChild) p.appendChild(document.createElement('br'));
        list.parentNode.insertBefore(p, list.nextSibling);
        if (following.length) {
          var rest = document.createElement(list.tagName.toLowerCase());
          for (var j = 0; j < following.length; j++) rest.appendChild(following[j]);
          list.parentNode.insertBefore(rest, p.nextSibling);
        }
        list.removeChild(li);
        if (!list.children.length) list.parentNode.removeChild(list);
      }
    });
    return true;
  }

  /** Tab numa célula: vai para a próxima (cria linha nova no fim da tabela). */
  function moveCell(cell, backwards) {
    var table = editor.selection.closest(cell, 'table');
    if (!table) return false;

    var cells = Array.prototype.slice.call(table.querySelectorAll('td, th')).filter(function (c) {
      return editor.selection.closest(c, 'table') === table;
    });
    var index = cells.indexOf(cell);
    var target = cells[index + (backwards ? -1 : 1)];

    if (!target && !backwards) {
      var lastRow = cell.parentNode;
      var row = document.createElement('tr');
      for (var i = 0; i < lastRow.children.length; i++) {
        var newCell = document.createElement(lastRow.children[i].tagName === 'TH' ? 'td' : lastRow.children[i].tagName.toLowerCase());
        var style = lastRow.children[i].getAttribute('style');
        if (style) newCell.setAttribute('style', style);
        newCell.innerHTML = '&nbsp;';
        row.appendChild(newCell);
      }
      lastRow.parentNode.insertBefore(row, lastRow.nextSibling);
      target = row.firstChild;
    }

    if (!target) return true; // primeira célula com Shift+Tab: fica onde está

    // Seleciona o conteúdo da célula para digitar por cima
    var range = document.createRange();
    range.selectNodeContents(target);
    editor.selection.setRange(range);
    return true;
  }

  function handleTab(e) {
    var range = editor.selection.getRange();
    if (!range) return false;

    var li = editor.selection.closest(range.startContainer, 'li');
    var cell = editor.selection.closest(range.startContainer, 'td, th');

    // O elemento mais próximo do cursor decide (lista dentro de célula etc.)
    if (li && (!cell || cell.contains(li))) {
      editor.history.save();
      var changed = e.shiftKey ? outdentListItem(li) : indentListItem(li);
      if (changed) {
        editor.history.save();
        editor.trigger('change');
      }
      return true; // dentro de lista, Tab nunca sai do editor
    }

    if (cell) {
      editor.history.save();
      moveCell(cell, e.shiftKey);
      editor.history.save();
      editor.trigger('change');
      return true;
    }

    return false; // fora de listas e tabelas, Tab mantém o comportamento normal (foco)
  }

  // Atalhos de teclado
  editor.$content.on('keydown' + editor.ns, function (e) {
    if (e.key === 'Tab' && !e.ctrlKey && !e.metaKey && !e.altKey) {
      if (handleTab(e)) e.preventDefault();
      return;
    }

    // Atalhos que usam Ctrl (Windows/Linux) ou Cmd (Mac)
    if (e.ctrlKey || e.metaKey) {
      var key = (e.key || '').toLowerCase();
      var prevent = false;

      switch (key) {
        case 'b':
          editor.exec('bold');
          prevent = true;
          break;
        case 'i':
          editor.exec('italic');
          prevent = true;
          break;
        case 'u':
          editor.exec('underline');
          prevent = true;
          break;
        case 'k':
          // Ctrl+K: inserir/editar link (se o plugin de link estiver ativo)
          if (editor.commandRegistry.commands.link) {
            editor.exec('link');
            prevent = true;
          }
          break;
        case 'v':
          // Ctrl+Shift+V: colar sem formatação (o paste vem logo em seguida)
          if (e.shiftKey) {
            editor._plainPaste = true;
            setTimeout(function () { editor._plainPaste = false; }, 1000);
          }
          break;
        case 'z':
          e.shiftKey ? editor.exec('redo') : editor.exec('undo');
          prevent = true;
          break;
        case 'y':
          editor.exec('redo');
          prevent = true;
          break;
      }

      if (prevent) {
        e.preventDefault();
      }
    }
  });
};
/**
 * SanitizerPlugin - limpa o conteúdo colado (paste).
 *
 * A sanitização em si fica no núcleo (HtmlSanitizer, em editor.sanitizer),
 * para que TODA entrada passe pelas mesmas regras, não só o colar.
 * Este plugin mantém a API antiga (clean, isSafeUrl, allowedTags) por
 * compatibilidade.
 */
function SanitizerPlugin(editor) {
  this.editor = editor;
}

SanitizerPlugin.prototype.init = function () {
  var sanitizer = this.editor.sanitizer;

  // Mantidos para compatibilidade com código que lia estas propriedades
  this.allowedTags = sanitizer.allowedTags;
  this.allowedAttributes = sanitizer.allowedAttributes;

  this.rangeFormatter = new RangeFormatter(this.editor);

  this.bind();
};

SanitizerPlugin.prototype.bind = function () {
  var self = this;

  this.editor.$content.on('paste' + this.editor.ns, function (e) {
    var clipboard = (e.originalEvent || e).clipboardData;

    e.preventDefault();

    var html = '';
    var text = '';

    if (clipboard) {
      html = clipboard.getData('text/html');
      text = clipboard.getData('text/plain');
    } else if (window.clipboardData) {
      // IE11: só oferece texto puro
      text = window.clipboardData.getData('Text');
    }

    // Ctrl+Shift+V (marcado no keydown) cola sem formatação
    var plain = self.editor._plainPaste;
    self.editor._plainPaste = false;

    // Texto puro é escapado: "<b>" colado como texto continua sendo texto.
    var content = html && !plain
      ? SanitizerPlugin.cleanOfficeHtml(html)
      : self.editor.sanitizer.textToHtml(text || $('<div/>').html(self.editor.sanitizer.sanitize(html)).text());

    self.editor.history.save();
    self.rangeFormatter.insertHTML(content); // insertHTML sanitiza
    self.editor.history.save();
    self.editor.trigger('change');
  });
};

SanitizerPlugin.WORD_PATTERN = /urn:schemas-microsoft-com|class="?Mso|mso-[a-z-]+\s*:/i;
SanitizerPlugin.GDOCS_PATTERN = /docs-internal-guid/;

/** Estilos que Word e Google Docs repetem em todo trecho e só poluem o HTML. */
SanitizerPlugin.OFFICE_NOISE_STYLES = /^(font-family|font-size|line-height|margin(-\w+)?|text-indent|white-space|vertical-align|font-variant[\w-]*|background-color|color)$/i;

/**
 * Limpa HTML colado do Word e do Google Docs antes da sanitização:
 * - listas do Word (parágrafos com mso-list) viram <ul>/<ol> de verdade;
 * - o <b id="docs-internal-guid"> do Google Docs (que deixaria tudo em
 *   negrito) é removido;
 * - classes (MsoNormal...) e estilos repetidos de fonte e margem saem.
 * Conteúdo de outras fontes passa direto.
 * @param {string} html
 * @returns {string}
 */
SanitizerPlugin.cleanOfficeHtml = function (html) {
  var isWord = SanitizerPlugin.WORD_PATTERN.test(html);
  var isGDocs = SanitizerPlugin.GDOCS_PATTERN.test(html);
  if (!isWord && !isGDocs) return html;

  var doc = document.implementation.createHTMLDocument('');
  var body = doc.body;
  body.innerHTML = html;

  // Google Docs: wrapper <b style="font-weight:normal" id="docs-internal-guid-...">
  var wrappers = body.querySelectorAll('b[id^="docs-internal-guid"]');
  for (var w = 0; w < wrappers.length; w++) {
    SanitizerPlugin.unwrap(wrappers[w]);
  }

  if (isWord) SanitizerPlugin.convertWordLists(body);

  // Classes e estilos repetitivos
  var all = body.querySelectorAll('*');
  for (var i = 0; i < all.length; i++) {
    var el = all[i];
    el.removeAttribute('class');
    el.removeAttribute('lang');

    var style = el.getAttribute('style');
    if (style === null) continue;

    var kept = [];
    var decls = HtmlSanitizer.splitDeclarations(style);
    for (var d = 0; d < decls.length; d++) {
      var colon = decls[d].indexOf(':');
      if (colon === -1) continue;
      var prop = $.trim(decls[d].substring(0, colon)).toLowerCase();
      var value = $.trim(decls[d].substring(colon + 1));
      if (prop.indexOf('mso-') === 0 || SanitizerPlugin.OFFICE_NOISE_STYLES.test(prop)) continue;
      // Google Docs marca negrito/itálico por estilo: "normal" não acrescenta nada
      if ((prop === 'font-weight' && /^(normal|400)$/.test(value)) || (prop === 'font-style' && value === 'normal') || (prop === 'text-decoration' && /^none/.test(value))) continue;
      kept.push(prop + ': ' + value);
    }

    if (kept.length) {
      el.setAttribute('style', kept.join('; '));
    } else {
      el.removeAttribute('style');
    }
  }

  // Spans sem atributos não servem para nada depois da limpeza
  var spans = body.querySelectorAll('span');
  for (var sp = spans.length - 1; sp >= 0; sp--) {
    if (!spans[sp].attributes.length) SanitizerPlugin.unwrap(spans[sp]);
  }

  return body.innerHTML;
};

SanitizerPlugin.unwrap = function (el) {
  var parent = el.parentNode;
  if (!parent) return;
  while (el.firstChild) parent.insertBefore(el.firstChild, el);
  parent.removeChild(el);
};

/**
 * O Word cola listas como parágrafos com o marcador ("·", "1.") num span
 * mso-list:Ignore. Reconstrói as listas, inclusive aninhadas (levelN).
 */
SanitizerPlugin.convertWordLists = function (body) {
  var paragraphs = Array.prototype.slice.call(body.querySelectorAll('p'));
  var stack = []; // [{ list, level }]
  var lastItem = null;
  var lastParagraph = null;

  for (var i = 0; i < paragraphs.length; i++) {
    var p = paragraphs[i];
    var style = p.getAttribute('style') || '';
    var match = /mso-list:\s*\w+\s+level(\d+)/i.exec(style);

    if (!match) {
      stack = [];
      lastItem = null;
      lastParagraph = null;
      continue;
    }

    var level = parseInt(match[1], 10) || 1;

    // Parágrafos de lista separados por outro conteúdo começam outra lista
    if (lastParagraph && !SanitizerPlugin.isNextSibling(lastParagraph, p)) {
      stack = [];
      lastItem = null;
    }

    // Marcador do Word: decide entre lista numerada e com marcadores
    var marker = '';
    var ignored = p.querySelectorAll('[style*="mso-list"]');
    for (var m = 0; m < ignored.length; m++) {
      if (/mso-list:\s*ignore/i.test(ignored[m].getAttribute('style') || '')) {
        marker += ignored[m].textContent;
        ignored[m].parentNode.removeChild(ignored[m]);
      }
    }
    var ordered = /^\s*(\d+|[a-zA-Z]|[ivxlcdmIVXLCDM]+)[.)]/.test(marker);
    var tag = ordered ? 'ol' : 'ul';

    while (stack.length && stack[stack.length - 1].level > level) stack.pop();

    var top = stack[stack.length - 1];
    if (!top || top.level < level) {
      var list = body.ownerDocument.createElement(tag);
      if (top && lastItem) {
        lastItem.appendChild(list); // sublista dentro do item anterior
      } else {
        p.parentNode.insertBefore(list, p);
      }
      stack.push({ list: list, level: level });
      top = stack[stack.length - 1];
    }

    var li = body.ownerDocument.createElement('li');
    while (p.firstChild) li.appendChild(p.firstChild);
    // Remove o espaçamento que o Word põe depois do marcador
    if (li.firstChild && li.firstChild.nodeType === 3) {
      li.firstChild.nodeValue = li.firstChild.nodeValue.replace(/^\s+/, '');
    }
    top.list.appendChild(li);
    lastItem = li;

    var placeholder = body.ownerDocument.createComment('weaver-list');
    p.parentNode.replaceChild(placeholder, p);
    lastParagraph = placeholder;
  }

  // Remove os marcadores de posição usados para saber a ordem
  var walker = body.ownerDocument.createTreeWalker(body, NodeFilter.SHOW_COMMENT, null, false);
  var comments = [];
  var c;
  while ((c = walker.nextNode())) comments.push(c);
  for (var k = 0; k < comments.length; k++) {
    if (comments[k].nodeValue === 'weaver-list') comments[k].parentNode.removeChild(comments[k]);
  }
};

/** Indica se b vem logo depois de a (ignorando espaços e listas criadas). */
SanitizerPlugin.isNextSibling = function (a, b) {
  var node = a.nextSibling;
  while (node && ((node.nodeType === 3 && !/\S/.test(node.nodeValue)) || (node.nodeType === 1 && /^(UL|OL)$/.test(node.tagName)))) {
    node = node.nextSibling;
  }
  return node === b;
};

/**
 * Sanitiza um HTML com as regras do editor.
 * @param {string} html
 * @returns {string}
 */
SanitizerPlugin.prototype.clean = function (html) {
  return this.editor.sanitizer.sanitize(html);
};

SanitizerPlugin.prototype.isSafeUrl = function (url, tag, attr) {
  return this.editor.sanitizer.isSafeUrl(url, tag, attr);
};

window.SanitizerPlugin = SanitizerPlugin;

function PreviewPlugin(editor) {
  this.editor = editor;
  this.active = false;
}

PreviewPlugin.prototype.init = function () {
  this.build();
  this.bind();
};

PreviewPlugin.prototype.build = function () {
  // sandbox sem allow-scripts e sem allow-same-origin: o conteúdo é exibido,
  // mas nada nele executa nem acessa a página do editor (cookies, DOM, parent).
  this.$preview = $('<iframe class="editor-preview-frame" title="Pré-visualização"/>')
    .attr('sandbox', 'allow-popups allow-popups-to-escape-sandbox')
    .attr('referrerpolicy', 'no-referrer')
    .hide();

  this.editor.$container.append(this.$preview);
};

PreviewPlugin.prototype.bind = function () {
  var self = this;

  this.editor.registerCommand('preview', function () {
    self.toggle();
  });

  this.editor.registerCommand('desktop', function () {
    if (self.active) self.setViewport('desktop');
  });

  this.editor.registerCommand('tablet', function () {
    if (self.active) self.setViewport('tablet');
  });

  this.editor.registerCommand('mobile', function () {
    if (self.active) self.setViewport('mobile');
  });

  this.editor.registerCommand('closePreview', function () {
    if (self.active) self.disable();
  });
};

PreviewPlugin.prototype.toggle = function () {
  this.active ? this.disable() : this.enable();
};

PreviewPlugin.prototype.enable = function () {
  // Sanitiza de novo: o preview nunca deve confiar no DOM editável
  var html = this.editor.sanitize(this.editor.getContent());

  var cssLinks = this.buildCssLinks();
  var googleFonts = this.editor.options.googleFonts
    ? '<link rel="stylesheet" referrerpolicy="no-referrer" href="' + HtmlSanitizer.escapeHtml(WysiwygEditor.GOOGLE_FONTS_URL) + '">'
    : '';

  // Segunda camada além do sandbox: CSP que proíbe qualquer script
  var csp = '<meta http-equiv="Content-Security-Policy" content="script-src \'none\'; object-src \'none\'; base-uri \'none\'; form-action \'none\'">';

  // srcdoc em vez de document.write: com o sandbox sem allow-same-origin,
  // a página do editor não tem (nem precisa ter) acesso ao documento do iframe
  this.$preview.attr('srcdoc',
    '<!DOCTYPE html>' +
    '<html>' +
    '<head>' +
    '<meta charset="utf-8">' +
    csp +
    googleFonts +
    cssLinks +
    '<style>body{padding:20px;font-family:Arial}</style>' +
    '</head>' +
    '<body>' +
    html +
    '</body>' +
    '</html>'
  );

  this.editor.$content.hide();
  this.$preview.show();

  // Esconde todas as ferramentas normais e mostra apenas as de preview
  this.editor.$toolbar.find('.standard-btn').addClass('hidden');
  this.editor.$toolbar.find('.preview-only-btn').removeClass('hidden');

  // Oculta inteligentemente os grupos que ficaram vazios (para esconder as bordas divisórias)
  this.editor.$toolbar.find('.editor-toolbar-group').each(function() {
    var hasVisible = $(this).children().not('.hidden').length > 0;
    if (hasVisible) $(this).removeClass('hidden');
    else $(this).addClass('hidden');
  });

  this.setViewport('desktop');

  this.active = true;
};

PreviewPlugin.prototype.disable = function () {
  this.$preview.hide();
  this.editor.$content.show();

  // Devolve a barra de ferramentas ao normal
  this.editor.$toolbar.find('.standard-btn').removeClass('hidden');
  this.editor.$toolbar.find('.preview-only-btn').addClass('hidden');

  // Mostra novamente as bordas divisórias
  this.editor.$toolbar.find('.editor-toolbar-group').each(function() {
    var hasVisible = $(this).children().not('.hidden').length > 0;
    if (hasVisible) $(this).removeClass('hidden');
    else $(this).addClass('hidden');
  });

  this.active = false;
};

PreviewPlugin.prototype.buildCssLinks = function () {
  var css = this.editor.options.previewCss || [];
  var links = '';

  for (var i = 0; i < css.length; i++) {
    links += '<link rel="stylesheet" href="' + HtmlSanitizer.escapeHtml(css[i]) + '">';
  }

  return links;
};

PreviewPlugin.prototype.setViewport = function (size) {
  var widthMap = {
    desktop: '100%',
    tablet: '768px',
    mobile: '375px'
  };

  this.$preview.css({
    width: widthMap[size] || '100%',
    margin: '0 auto',
    display: 'block'
  });

  // Atualiza visualmente qual botão está ativo (cinza com sombra)
  var $toolbar = this.editor.$toolbar;
  $toolbar.find('[data-name="desktop"], [data-name="tablet"], [data-name="mobile"]')
    .removeClass('bg-gray-200 shadow-inner active')
    .addClass('bg-white');
  
  $toolbar.find('[data-name="' + size + '"]')
    .removeClass('bg-white')
    .addClass('bg-gray-200 shadow-inner active');
};

window.PreviewPlugin = PreviewPlugin;
function NormalizerPlugin(editor) {
  this.editor = editor;
}

/**
 * Elementos que existem vazios por natureza e NUNCA devem ser removidos.
 * Antes faltavam source, track, col e wbr: <video><source></video> perdia o
 * <source> sempre que o editor perdia o foco.
 */
NormalizerPlugin.KEEP_EMPTY = [
  'AREA', 'BASE', 'BR', 'COL', 'COLGROUP', 'EMBED', 'HR', 'IMG', 'INPUT', 'LINK', 'META', 'SOURCE', 'TRACK', 'WBR',
  'IFRAME', 'VIDEO', 'AUDIO', 'TD', 'TH', 'TR', 'TBODY', 'THEAD', 'TFOOT', 'TABLE', 'LI'
];

/** Pares de tags equivalentes aninhadas que podem ser achatadas. */
NormalizerPlugin.FLATTEN = ['b', 'strong', 'i', 'em', 'u', 's'];

NormalizerPlugin.prototype.init = function () {
  this.bind();
};

NormalizerPlugin.prototype.bind = function () {
  var self = this;

  this.editor.$content.on('blur' + this.editor.ns, function () {
    self.normalize();
  });
};

NormalizerPlugin.prototype.normalize = function () {
  var root = this.editor.$content[0];
  var before = root.innerHTML;

  for (var i = 0; i < NormalizerPlugin.FLATTEN.length; i++) {
    this.flatten(root, NormalizerPlugin.FLATTEN[i]);
  }
  this.flattenEquivalent(root, 'b', 'strong');
  this.flattenEquivalent(root, 'i', 'em');
  this.removeEmpty(root);

  // Mudanças do normalizador também entram no histórico e no textarea
  if (root.innerHTML !== before) {
    this.editor.history.save();
    this.editor.trigger('change');
  }
};

NormalizerPlugin.prototype.unwrap = function (el) {
  var parent = el.parentNode;
  while (el.firstChild) {
    parent.insertBefore(el.firstChild, el);
  }
  parent.removeChild(el);
};

NormalizerPlugin.prototype.flatten = function (root, tag) {
  var nodes = root.querySelectorAll(tag + ' ' + tag);

  for (var i = 0; i < nodes.length; i++) {
    if (nodes[i].parentNode && !nodes[i].attributes.length) this.unwrap(nodes[i]);
  }
};

/** <strong><b>x</b></strong> e variações viram uma única tag. */
NormalizerPlugin.prototype.flattenEquivalent = function (root, a, b) {
  var nodes = root.querySelectorAll(a + ' ' + b + ', ' + b + ' ' + a);

  for (var i = 0; i < nodes.length; i++) {
    if (nodes[i].parentNode && !nodes[i].attributes.length) this.unwrap(nodes[i]);
  }
};

NormalizerPlugin.prototype.removeEmpty = function (root) {
  var nodes = root.querySelectorAll('*');

  for (var i = nodes.length - 1; i >= 0; i--) {
    var el = nodes[i];

    if (
      el.parentNode &&
      el.childNodes.length === 0 &&
      NormalizerPlugin.KEEP_EMPTY.indexOf(el.tagName) === -1 &&
      !el.hasAttribute('id') // âncoras de link interno (<a id="...">)
    ) {
      el.parentNode.removeChild(el);
    }
  }
};

window.NormalizerPlugin = NormalizerPlugin;

function LinkPlugin(editor) {
  this.editor = editor;
  this.$popover = null;
  this.savedRange = null;
  this.activeLinkNode = null;
}

LinkPlugin.prototype.init = function () {
  var self = this;

  // Inicializa o RangeFormatter para operações robustas no DOM
  this.rangeFormatter = new RangeFormatter(this.editor);

  this.editor.registerCommand('link', function () {
    self.togglePopover();
  });

  this.buildPopover();
};

LinkPlugin.prototype.buildPopover = function () {
  var self = this;

  this.$popover = $('<div class="editor-link-popover absolute bg-white border border-gray-200 p-3 rounded-md z-50 shadow-lg w-72 text-sm hidden font-sans"></div>');
  
  var $form = $('<div class="flex flex-col gap-3"></div>');
  
  var $textGroup = $('<div class="flex flex-col gap-1"><label class="font-semibold text-gray-700 m-0">Texto de Exibição</label></div>');
  this.$textInput = $('<input type="text" placeholder="Texto do link" class="px-2 py-1.5 border border-gray-300 rounded text-sm outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 w-full">');
  $textGroup.append(this.$textInput);

  var $urlGroup = $('<div class="flex flex-col gap-1"><label class="font-semibold text-gray-700 m-0">URL</label></div>');
  this.$urlInput = $('<input type="text" placeholder="https://" class="px-2 py-1.5 border border-gray-300 rounded text-sm outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 w-full">');
  $urlGroup.append(this.$urlInput);

  this.$urlError = $('<div class="editor-link-error text-xs text-red-600 hidden" role="alert">URL inválida. Use http://, https://, mailto: ou tel:.</div>');
  $urlGroup.append(this.$urlError);

  var $targetGroup =$('<label class="flex items-center gap-2 cursor-pointer text-gray-700 m-0"><input type="checkbox" class="rounded text-blue-600 focus:ring-blue-500" checked> Abrir em nova aba</label>');
  this.$targetInput = $targetGroup.find('input');

  var $btnGroup = $('<div class="flex mt-1"></div>');
  
  this.$btnUnlink = $('<button type="button" class="px-3 py-1.5 border border-red-500 text-red-500 bg-white rounded cursor-pointer text-sm hover:bg-red-50 transition-colors">Remover</button>');
  
  var $rightBtns = $('<div class="flex gap-2 ml-auto"></div>');
  var $btnCancel = $('<button type="button" class="px-3 py-1.5 border border-gray-300 bg-white rounded cursor-pointer text-sm text-gray-700 hover:bg-gray-50 transition-colors">Cancelar</button>');
  var $btnSave = $('<button type="button" class="px-4 py-1.5 border-none bg-blue-600 text-white rounded cursor-pointer text-sm font-semibold hover:bg-blue-700 transition-colors">Salvar</button>');
  
  $rightBtns.append($btnCancel, $btnSave);
  $btnGroup.append(this.$btnUnlink, $rightBtns);

  $form.append($textGroup, $urlGroup, $targetGroup, $btnGroup);
  this.$popover.append($form);

  this.editor.$container.append(this.$popover);

  // Enter num campo de texto confirma
  this.$popover.on('keydown', 'input[type="text"]', function (e) {
    if (e.key === 'Enter') {
      e.preventDefault();
      $btnSave.trigger('click');
    }
  });

  // Diálogo acessível: rótulos ligados, Esc fecha e Tab fica no popover
  this.editor.dialogize(this.$popover, {
    name: 'link',
    label: 'Inserir link',
    close: function () { self.togglePopover(false); }
  });

  // Evita que clicar no popover faça o editor perder o foco
  this.$popover.on('mousedown', function (e) {
    if (e.target.tagName !== 'INPUT') {
      e.preventDefault();
    }
  });

  $btnCancel.on('click', function () {
    self.togglePopover(false);
  });

  this.$btnUnlink.on('click', function () {
    self.removeLink();
    self.togglePopover(false);
  });

  $btnSave.on('click', function () {
    // Mantém o popover aberto quando a URL é recusada, para o usuário corrigir
    if (self.insertLink() !== false) {
      self.togglePopover(false);
    }
  });

  this.$urlInput.on('input', function () {
    self.$urlError.addClass('hidden').hide();
  });

  // Esconde o popover se clicar fora
  $(document).on('mousedown' + this.editor.ns, function (e) {
    var $btn = self.editor.$toolbar.find('[data-name="link"]');
    if (!self.$popover.is(e.target) && self.$popover.has(e.target).length === 0 && !$btn.is(e.target) && $btn.has(e.target).length === 0) {
      self.togglePopover(false);
    }
  });
};

LinkPlugin.prototype.togglePopover = function (forceState) {
  var $btn = this.editor.$toolbar.find('[data-name="link"]');
  if ($btn.length === 0) return;

  var isVisible = forceState !== undefined ? forceState : !this.$popover.is(':visible');

  if (isVisible) {
    if (this.editor.selection && this.editor.selection.isInsideEditor()) {
      this.savedRange = this.editor.selection.getRange();
    } else {
      return;
    }

    var text = '';
    var url = 'https://';
    var isBlank = true;
    var isLinked = false;

    // Verificar se o cursor já está dentro de um link existente
    var node = this.savedRange.commonAncestorContainer;
    while (node && node !== this.editor.$content[0]) {
      if (node.nodeType === 1 && node.tagName.toLowerCase() === 'a') {
        isLinked = true;
        text = node.innerText;
        url = node.getAttribute('href') || 'https://';
        isBlank = node.getAttribute('target') === '_blank';
        this.activeLinkNode = node;
        break;
      }
      node = node.parentNode;
    }

    if (!isLinked) {
      this.activeLinkNode = null;
      text = this.savedRange.toString();
    }

    this.$textInput.val(text);
    this.$urlInput.val(url);
    this.$urlError.addClass('hidden').hide();
    this.$targetInput.prop('checked', isBlank);
    
    if (isLinked) {
      this.$btnUnlink.show();
    } else {
      this.$btnUnlink.hide();
    }

    var btnOffset = $btn.position();
    this.$popover.css({
      top: btnOffset.top + $btn.outerHeight() + 5,
      left: btnOffset.left
    });
    this.$popover.show();
    
    // Verifica se o painel vazou pela direita
    if (this.$popover[0].getBoundingClientRect().right > this.editor.$container[0].getBoundingClientRect().right) {
      this.$popover.css('left', btnOffset.left - this.$popover.outerWidth() + $btn.outerWidth());
    }

    // Foca no input correto automaticamente
    var self = this;
    setTimeout(function() {
      if (!text) {
        self.$textInput.focus();
      } else {
        self.$urlInput.focus();
      }
    }, 0);

  } else {
    this.$popover.hide();
  }
};

LinkPlugin.prototype.insertLink = function () {
  if (this.savedRange) {
    var sel = window.getSelection();
    sel.removeAllRanges();
    sel.addRange(this.savedRange);
  } else if (!this.editor.selection || !this.editor.selection.isInsideEditor()) {
    return;
  }

  var url = this.normalizeUrl(this.$urlInput.val());
  var text = this.$textInput.val().trim() || url;
  var isBlank = this.$targetInput.prop('checked');

  if (!url || url === 'https://') return false;

  // Bloqueia javascript:, data:, vbscript: e variações ofuscadas
  if (!this.editor.sanitizer.isSafeUrl(url, 'a', 'href')) {
    this.$urlError.removeClass('hidden').show();
    this.$urlInput.focus();
    return false;
  }

  this.editor.history.save();

  if (this.activeLinkNode) {
    this.activeLinkNode.setAttribute('href', url);
    // textContent nunca interpreta HTML; só troca o texto se ele mudou,
    // preservando negrito/itálico dentro do link
    if (this.activeLinkNode.textContent !== text) {
      this.activeLinkNode.textContent = text;
    }
    if (isBlank) {
      this.activeLinkNode.setAttribute('target', '_blank');
      this.activeLinkNode.setAttribute('rel', 'noopener noreferrer');
    } else {
      this.activeLinkNode.removeAttribute('target');
      this.activeLinkNode.removeAttribute('rel');
    }
  } else {
    // Monta o link via DOM: URL e texto nunca são interpretados como HTML
    var link = document.createElement('a');
    link.setAttribute('href', url);
    link.textContent = text;
    if (isBlank) {
      link.setAttribute('target', '_blank');
      link.setAttribute('rel', 'noopener noreferrer');
    }

    this.rangeFormatter.insertNode(link, false);
  }

  this.editor.history.save();
  this.editor.trigger('change');
  this.editor.updateToolbar();
  return true;
};

/**
 * Completa endereços digitados sem protocolo ("www.site.com" -> "https://www.site.com")
 * @param {string} raw
 * @returns {string}
 */
LinkPlugin.prototype.normalizeUrl = function (raw) {
  var url = $.trim(raw || '');
  if (/^www\./i.test(url)) {
    url = 'https://' + url;
  }
  return url;
};

LinkPlugin.prototype.removeLink = function () {
  if (this.savedRange) {
    var sel = window.getSelection();
    sel.removeAllRanges();
    sel.addRange(this.savedRange);
  }
  
  if (this.activeLinkNode) {
    // Move os filhos para fora do <a> sem reinterpretar o HTML como string
    var $node = $(this.activeLinkNode);
    if ($node.contents().length) {
      $node.contents().unwrap();
    } else {
      $node.remove();
    }
  } else {
    // Usa RangeFormatter para remover link de forma robusta
    if (this.rangeFormatter) {
      this.rangeFormatter.unwrapLink();
    } else {
      // Fallback para execCommand se RangeFormatter não estiver disponível
      document.execCommand('unlink', false, null);
    }
  }
  
  this.editor.trigger('change');
  this.editor.updateToolbar();
};

window.LinkPlugin = LinkPlugin;
function TablePlugin(editor) {
  this.editor = editor;
  this.$grid = null;
  this.$contextMenu = null;
  this.activeCell = null;
}

TablePlugin.prototype.init = function () {
  var self = this;

  // Inicializa o RangeFormatter para operações robustas no DOM
  this.rangeFormatter = new RangeFormatter(this.editor);

  this.editor.registerCommand('table', function () {
    self.toggleGrid();
  });

  this.buildGrid();
  this.buildContextMenu();
  this.bindEvents();
};

TablePlugin.prototype.buildGrid = function () {
  var self = this;

  this.$grid = $('<div class="editor-table-grid hidden absolute bg-white border border-gray-200 p-2 rounded z-50 shadow-md"></div>');
  var $gridInner = $('<div class="flex flex-wrap w-[150px]"></div>');

  // Gera uma grade 10x10
  for (var r = 1; r <= 10; r++) {
    for (var c = 1; c <= 10; c++) {
      var $cell = $('<div class="grid-cell w-[15px] h-[15px] border border-gray-100 box-border cursor-pointer hover:border-blue-500" data-row="' + r + '" data-col="' + c + '"></div>');
      $gridInner.append($cell);
    }
  }

  var $label = $('<div class="grid-label text-center text-xs mt-2 text-gray-500 font-sans" aria-live="polite">0 x 0</div>');

  // Grade operável pelo teclado: setas escolhem linhas/colunas, Enter insere
  this.$grid.attr({ tabindex: '0', role: 'dialog', 'aria-label': 'Inserir tabela: use as setas para escolher o tamanho e Enter para inserir' });

  var paint = function (row, col) {
    self.gridSel = { row: row, col: col };
    self.$grid.find('.grid-cell').each(function () {
      var $this = $(this);
      $this.css('background', $this.data('row') <= row && $this.data('col') <= col ? '#3b82f6' : 'transparent');
    });
    $label.text(col + ' x ' + row);
  };
  this.paintGrid = paint;

  this.$grid.append($gridInner).append($label);
  this.editor.$container.append(this.$grid);

  // Evita que clicar na grade faça o editor perder o foco
  this.$grid.on('mousedown', function (e) {
    e.preventDefault();
  });

  // Pinta de azul as células correspondentes ao passar o mouse
  this.$grid.on('mouseover', '.grid-cell', function () {
    paint($(this).data('row'), $(this).data('col'));
  });

  this.$grid.on('keydown', function (e) {
    var sel = self.gridSel || { row: 1, col: 1 };
    var row = sel.row;
    var col = sel.col;

    switch (e.key) {
      case 'ArrowRight': col = Math.min(10, col + 1); break;
      case 'ArrowLeft': col = Math.max(1, col - 1); break;
      case 'ArrowDown': row = Math.min(10, row + 1); break;
      case 'ArrowUp': row = Math.max(1, row - 1); break;
      case 'Enter':
      case ' ':
        e.preventDefault();
        self.toggleGrid(false);
        self.editor.$content[0].focus();
        self.insertTable(row, col);
        return;
      case 'Escape':
        e.preventDefault();
        self.toggleGrid(false);
        self.editor.focusToolbarButton('table');
        return;
      case 'Tab':
        self.toggleGrid(false);
        return;
      default:
        return;
    }

    e.preventDefault();
    paint(row, col);
  });

  // Dispara a criação da tabela quando clicado e oculta o grid
  this.$grid.on('click', '.grid-cell', function () {
    var row = $(this).data('row');
    var col = $(this).data('col');
    self.insertTable(row, col);
    self.toggleGrid(false);
  });

  // Esconde o menu de grade se clicar em outro lugar da tela
  $(document).on('click' + this.editor.ns, function (e) {
    var $btn = self.editor.$toolbar.find('[data-name="table"]');
    if (!self.$grid.is(e.target) && self.$grid.has(e.target).length === 0 && !$btn.is(e.target) && $btn.has(e.target).length === 0) {
      self.toggleGrid(false);
    }
  });
};

TablePlugin.prototype.toggleGrid = function (forceState) {
  var $btn = this.editor.$toolbar.find('[data-name="table"]');
  if ($btn.length === 0) return;

  var isVisible = forceState !== undefined ? forceState : !this.$grid.is(':visible');

  if (isVisible) {
    // Salva a posição exata do cursor para usarmos depois
    if (this.editor.selection && this.editor.selection.isInsideEditor()) {
      this.savedRange = this.editor.selection.getRange();
    }

    var btnOffset = $btn.position();
    this.$grid.css({
      top: btnOffset.top + $btn.outerHeight() + 5,
      left: btnOffset.left
    });
    var fromKeyboard = document.activeElement === $btn[0];
    this.$grid.show();
    this.gridSel = null;
    this.$grid.find('.grid-cell').css('background', 'transparent');
    this.$grid.find('.grid-label').text('0 x 0');

    // Aberta pelo teclado: o foco vai para a grade, já com 1 x 1
    if (fromKeyboard) {
      this.paintGrid(1, 1);
      this.$grid[0].focus();
    }

    // Verifica se o painel vazou pela direita
    if (this.$grid[0].getBoundingClientRect().right > this.editor.$container[0].getBoundingClientRect().right) {
      this.$grid.css('left', btnOffset.left - this.$grid.outerWidth() + $btn.outerWidth());
    }
  } else {
    this.$grid.hide();
  }
};

TablePlugin.prototype.insertTable = function (rows, cols) {
  // Restaura o cursor para o exato local antes do menu ser aberto
  if (this.savedRange) {
    var sel = window.getSelection();
    sel.removeAllRanges();
    sel.addRange(this.savedRange);
  } else if (!this.editor.selection || !this.editor.selection.isInsideEditor()) {
    return;
  }

  if (isNaN(rows) || isNaN(cols) || rows <= 0 || cols <= 0) {
    return;
  }

  var html = '<table style="width: 100%; border-collapse: collapse; margin-bottom: 15px; border: 1px solid #ccc;"><tbody>';
  for (var r = 0; r < rows; r++) {
    html += '<tr>';
    for (var c = 0; c < cols; c++) {
      html += '<td style="padding: 8px; border: 1px solid #ccc;">&nbsp;</td>';
    }
    html += '</tr>';
  }
  html += '</tbody></table><p><br></p>'; // Adiciona um parágrafo no final para poder continuar digitando

  // A grade insere fora do editor.exec(): grava histórico e sincroniza aqui
  this.editor.history.save();
  this.rangeFormatter.insertHTML(html);
  this.editor.history.save();
  this.editor.trigger('change');
};

TablePlugin.prototype.buildContextMenu = function () {
  var self = this;

  this.$contextMenu = $('<div class="editor-table-context-menu absolute bg-white border border-gray-200 rounded-md shadow-md z-[100] py-1 font-sans min-w-[180px] hidden flex-col" role="menu" aria-label="Opções da tabela"></div>');
  
  var menuItems = [
    { label: '<i data-lucide="arrow-up" class="w-4 h-4 mr-2 opacity-70"></i> Inserir Linha Acima', action: 'insertRowAbove' },
    { label: '<i data-lucide="arrow-down" class="w-4 h-4 mr-2 opacity-70"></i> Inserir Linha Abaixo', action: 'insertRowBelow' },
    { divider: true },
    { label: '<i data-lucide="arrow-left" class="w-4 h-4 mr-2 opacity-70"></i> Inserir Col. à Esq.', action: 'insertColLeft' },
    { label: '<i data-lucide="arrow-right" class="w-4 h-4 mr-2 opacity-70"></i> Inserir Col. à Dir.', action: 'insertColRight' },
    { divider: true },
    { label: '<i data-lucide="trash-2" class="w-4 h-4 mr-2 opacity-80"></i> <span class="font-medium">Excluir Linha</span>', action: 'deleteRow', isDestructive: true },
    { label: '<i data-lucide="trash-2" class="w-4 h-4 mr-2 opacity-80"></i> <span class="font-medium">Excluir Coluna</span>', action: 'deleteCol', isDestructive: true },
    { divider: true },
    { label: '<i data-lucide="trash" class="w-4 h-4 mr-2"></i> <span class="font-semibold">Excluir Tabela</span>', action: 'deleteTable', isDestructive: true }
  ];

  $.each(menuItems, function(i, item) {
    if (item.divider) {
      self.$contextMenu.append('<div class="h-px bg-gray-200 my-1 mx-1" role="separator"></div>');
    } else {
      var hoverClass = item.isDestructive ? 'hover:bg-red-50 text-red-600 hover:text-red-700' : 'hover:bg-gray-100 text-gray-700 hover:text-gray-900';
      var $btn = $('<button type="button" class="flex items-center mx-1 px-2 py-1.5 text-left text-sm rounded-sm focus:outline-none transition-colors select-none ' + hoverClass + '"></button>')
        .attr({ role: 'menuitem', tabindex: '-1' })
        .html(item.label)
        .on('click', function(e) {
          e.preventDefault();
          self[item.action]();
          self.hideContextMenu();
        });
      self.$contextMenu.append($btn);
    }
  });

  this.editor.$container.append(this.$contextMenu);

  // Teclado (também abre com a tecla de menu ou Shift+F10 na célula)
  WysiwygEditor.menuKeyboard(this.$contextMenu, {
    items: '[role="menuitem"]',
    close: function () {
      var cell = self.activeCell;
      self.hideContextMenu();
      if (cell) self.editor.$content[0].focus();
    }
  });

  // Fecha o menu ao clicar fora
  $(document).on('mousedown' + this.editor.ns, function (e) {
    if (!self.$contextMenu.is(e.target) && self.$contextMenu.has(e.target).length === 0) {
      self.hideContextMenu();
    }
  });

  // Esconde ao fazer scroll no editor
  this.editor.$content.on('scroll' + this.editor.ns, function () {
    self.hideContextMenu();
  });
};

TablePlugin.prototype.bindEvents = function () {
  var self = this;

  this.editor.$content.on('contextmenu' + this.editor.ns, 'td, th', function (e) {
    // Shift + clique direito abre o menu do navegador (correção ortográfica, colar...)
    if (e.shiftKey) return;
    e.preventDefault();
    self.activeCell = this;
    self.showContextMenu(e);
  });
};

TablePlugin.prototype.showContextMenu = function (e) {
  if (!this.activeCell) return;

  var containerOffset = this.editor.$container.offset();
  if (!containerOffset) return;

  var menuX = e.pageX - containerOffset.left;
  var menuY = e.pageY - containerOffset.top;

  // Aberto pelo teclado (tecla de menu, Shift+F10): sem posição do mouse
  if (!e.pageX && !e.pageY) {
    var cellOffset = $(this.activeCell).offset();
    menuX = cellOffset.left - containerOffset.left + 10;
    menuY = cellOffset.top - containerOffset.top + $(this.activeCell).outerHeight();
  }

  this.$contextMenu.css({
    display: 'flex',
    left: menuX,
    top: menuY
  });

  var menuWidth = this.$contextMenu.outerWidth();
  var menuHeight = this.$contextMenu.outerHeight();
  var containerWidth = this.editor.$container.outerWidth();
  var containerHeight = this.editor.$container.outerHeight();

  if (menuX + menuWidth > containerWidth) {
    this.$contextMenu.css('left', Math.max(0, containerWidth - menuWidth - 5));
  }
  
  if (menuY + menuHeight > containerHeight) {
    this.$contextMenu.css('top', Math.max(0, menuY - menuHeight - 5));
  }

  WysiwygEditor.renderIcons(this.$contextMenu[0]);

  // Foco no primeiro item: as setas já navegam e Esc fecha
  var first = this.$contextMenu.find('[role="menuitem"]')[0];
  if (first) first.focus();
};

TablePlugin.prototype.hideContextMenu = function () {
  this.$contextMenu.hide();
  this.activeCell = null;
};

TablePlugin.prototype.insertRowAbove = function () {
  if (!this.activeCell) return;
  this.editor.history.save();
  var $tr = $(this.activeCell).closest('tr');
  var cols = $tr.children('td, th').length;
  var newRow = '<tr>';
  for (var i = 0; i < cols; i++) {
    newRow += '<td style="padding: 8px; border: 1px solid #ccc;">&nbsp;</td>';
  }
  newRow += '</tr>';
  $tr.before(newRow);
  this.editor.trigger('change');
};

TablePlugin.prototype.insertRowBelow = function () {
  if (!this.activeCell) return;
  this.editor.history.save();
  var $tr = $(this.activeCell).closest('tr');
  var cols = $tr.children('td, th').length;
  var newRow = '<tr>';
  for (var i = 0; i < cols; i++) {
    newRow += '<td style="padding: 8px; border: 1px solid #ccc;">&nbsp;</td>';
  }
  newRow += '</tr>';
  $tr.after(newRow);
  this.editor.trigger('change');
};

TablePlugin.prototype.insertColLeft = function () {
  if (!this.activeCell) return;
  this.editor.history.save();
  var index = $(this.activeCell).index();
  var $table = $(this.activeCell).closest('table');
  $table.find('tr').each(function () {
    $(this).children().eq(index).before('<td style="padding: 8px; border: 1px solid #ccc;">&nbsp;</td>');
  });
  this.editor.trigger('change');
};

TablePlugin.prototype.insertColRight = function () {
  if (!this.activeCell) return;
  this.editor.history.save();
  var index = $(this.activeCell).index();
  var $table = $(this.activeCell).closest('table');
  $table.find('tr').each(function () {
    $(this).children().eq(index).after('<td style="padding: 8px; border: 1px solid #ccc;">&nbsp;</td>');
  });
  this.editor.trigger('change');
};

TablePlugin.prototype.deleteRow = function () {
  if (!this.activeCell) return;
  this.editor.history.save();
  var $tr = $(this.activeCell).closest('tr');
  var $table = $tr.closest('table');
  if ($table.find('tr').length <= 1) {
    this.deleteTable();
  } else {
    $tr.remove();
    this.editor.trigger('change');
  }
};

TablePlugin.prototype.deleteCol = function () {
  if (!this.activeCell) return;
  this.editor.history.save();
  var index = $(this.activeCell).index();
  var $table = $(this.activeCell).closest('table');
  if ($table.find('tr').first().children().length <= 1) {
    this.deleteTable();
  } else {
    $table.find('tr').each(function () {
      $(this).children().eq(index).remove();
    });
    this.editor.trigger('change');
  }
};

TablePlugin.prototype.deleteTable = function () {
  if (!this.activeCell) return;
  this.editor.history.save();
  $(this.activeCell).closest('table').remove();
  this.editor.trigger('change');
};

window.TablePlugin = TablePlugin;
function ImagePlugin(editor) {
  this.editor = editor;
  this.activeImage = null;
  this.$toolbar = null;
}

/** Formatos aceitos: só raster (SVG pode carregar script). */
ImagePlugin.ACCEPTED_TYPES = ['image/png', 'image/jpeg', 'image/gif', 'image/webp', 'image/avif'];

ImagePlugin.prototype.init = function () {
  var self = this;

  // Inicializa o RangeFormatter para operações robustas no DOM
  this.rangeFormatter = new RangeFormatter(this.editor);

  this.editor.registerCommand('image', function () {
    self.openFileDialog();
  });

  this.buildToolbar();
  this.buildResizeHandle();
  this.bindContentEvents();
  this.bindDragAndDrop();
};

ImagePlugin.prototype.buildToolbar = function () {
  var self = this;
  this.$toolbar = $('<div class="editor-image-toolbar absolute hidden bg-white border border-gray-200 p-1.5 rounded flex flex-row flex-nowrap w-max gap-1 z-50 shadow-lg" role="toolbar" aria-label="Ferramentas da imagem"></div>');

  var buttons = [
    { label: '100%', title: 'Largura 100%', action: function() { self.resizeImage('100%'); } },
    { label: '50%', title: 'Largura 50%', action: function() { self.resizeImage('50%'); } },
    { label: '25%', title: 'Largura 25%', action: function() { self.resizeImage('25%'); } },
    { label: 'Original', title: 'Tamanho Original', action: function() { self.setOriginalSize(); } },
    { label: '<i data-lucide="align-left"></i>', title: 'Flutuar à Esquerda', action: function() { self.setFloat('left'); } },
    { label: '<i data-lucide="align-center"></i>', title: 'Centralizar', action: function() { self.setFloat('center'); } },
    { label: '<i data-lucide="align-right"></i>', title: 'Flutuar à Direita', action: function() { self.setFloat('right'); } },
    { label: '<i data-lucide="align-justify"></i>', title: 'Remover Flutuação', action: function() { self.removeFloat(); } },
    { label: 'Alt', title: 'Texto alternativo', name: 'alt', action: function() { self.toggleAltEditor(); } },
    { label: '<i data-lucide="trash-2"></i>', title: 'Remover Imagem', action: function() { self.removeImage(); } }
  ];

  $.each(buttons, function(i, btnData) {
    var $btn = $('<button type="button" class="flex items-center justify-center min-w-[32px] h-8 px-2 border border-gray-300 bg-white rounded text-gray-700 hover:bg-gray-50 transition-colors focus:outline-none [&>svg]:w-4 [&>svg]:h-4 text-xs font-medium"></button>')
      .html(btnData.label)
      .attr('title', btnData.title)
      .attr('aria-label', btnData.title)
      .on('mousedown', function(e) { e.preventDefault(); }) // Evita perder o foco
      .on('click', btnData.action);
    if (btnData.name) $btn.attr('data-name', 'image-' + btnData.name);
    self.$toolbar.append($btn);
  });

  // Editor do texto alternativo (descrição para leitores de tela e SEO)
  this.$altBox = $('<div class="editor-image-alt"/>').hide();
  this.$altInput = $('<input type="text" placeholder="Descreva a imagem" aria-label="Texto alternativo da imagem">');
  var $altSave = $('<button type="button" class="flex items-center justify-center h-8 px-2 border border-gray-300 bg-white rounded text-gray-700 hover:bg-gray-50 text-xs font-medium">OK</button>');
  this.$altBox.append(this.$altInput, $altSave);
  this.$toolbar.append(this.$altBox);

  $altSave.on('click', function () { self.saveAlt(); });
  this.$altInput.on('keydown', function (e) {
    if (e.key === 'Enter') {
      e.preventDefault();
      self.saveAlt();
    } else if (e.key === 'Escape') {
      e.preventDefault();
      self.$altBox.hide();
    }
  });

  this.editor.$container.append(this.$toolbar);
};

ImagePlugin.prototype.toggleAltEditor = function () {
  if (!this.activeImage) return;
  if (this.$altBox.is(':visible')) {
    this.$altBox.hide();
    return;
  }
  this.$altInput.val(this.activeImage.getAttribute('alt') || '');
  this.$altBox.css('display', 'flex');
  this.positionToolbar();
  this.$altInput.focus();
};

ImagePlugin.prototype.saveAlt = function () {
  if (!this.activeImage) return;
  var alt = $.trim(this.$altInput.val());
  this.editor.history.save();
  this.activeImage.setAttribute('alt', alt);
  this.editor.history.save();
  this.editor.trigger('change');
  this.$altBox.hide();
  this.positionToolbar();
};

/**
 * Alça no canto da imagem para redimensionar arrastando (mouse, toque ou caneta).
 */
ImagePlugin.prototype.buildResizeHandle = function () {
  var self = this;
  this.$handle = $('<div class="editor-image-resize" title="Arraste para redimensionar" aria-hidden="true"/>').hide();
  this.editor.$container.append(this.$handle);

  var drag = null;

  this.$handle.on('pointerdown', function (e) {
    if (!self.activeImage) return;
    e.preventDefault();
    var oe = e.originalEvent;
    drag = {
      startX: oe.clientX,
      startWidth: self.activeImage.getBoundingClientRect().width,
      maxWidth: self.editor.$content[0].clientWidth
    };
    self.editor.history.save();
    if (this.setPointerCapture) this.setPointerCapture(oe.pointerId);
  });

  this.$handle.on('pointermove', function (e) {
    if (!drag || !self.activeImage) return;
    var width = Math.round(drag.startWidth + (e.originalEvent.clientX - drag.startX));
    width = Math.max(30, Math.min(width, drag.maxWidth));
    self.activeImage.style.width = width + 'px';
    self.activeImage.style.height = 'auto';
    self.positionToolbar();
  });

  this.$handle.on('pointerup pointercancel', function () {
    if (!drag) return;
    drag = null;
    self.editor.history.save();
    self.editor.trigger('change');
  });
};

ImagePlugin.prototype.bindContentEvents = function () {
  var self = this;

  // Mostra a barra de ferramentas ao clicar na imagem
  this.editor.$content.on('click' + this.editor.ns, 'img', function (e) {
    e.stopPropagation();
    self.showToolbar(this);
  });

  // Barra e alça não acompanham a rolagem; escondem ao rolar ou editar
  this.editor.$content.on('scroll' + this.editor.ns + ' input' + this.editor.ns, function () {
    if (self.activeImage) self.hideToolbar();
  });

  // Esconde a barra de ferramentas ao clicar fora
  $(document).on('click' + this.editor.ns, function (e) {
    if (self.activeImage && !$(e.target).is(self.activeImage) && !self.$toolbar.is(e.target) && self.$toolbar.has(e.target).length === 0 && !self.$handle.is(e.target)) {
      self.hideToolbar();
    }
  });
};

ImagePlugin.prototype.showToolbar = function (img) {
  if (this.activeImage && this.activeImage !== img) {
    $(this.activeImage).removeClass('weaver-selected');
    this.$altBox.hide();
  }

  this.activeImage = img;
  // Classe de estado: removida do HTML salvo por Editor.cleanOutput
  $(this.activeImage).addClass('weaver-selected');

  // Força o display flex (evita o display: block padrão do jQuery que quebra a linha)
  this.$toolbar.css('display', 'flex');
  this.positionToolbar();

  WysiwygEditor.renderIcons(this.$toolbar[0]);
};

ImagePlugin.prototype.positionToolbar = function () {
  var img = this.activeImage;
  if (!img || !img.parentNode) return;

  var containerRect = this.editor.$container[0].getBoundingClientRect();
  var imgRect = img.getBoundingClientRect();
  var top = imgRect.top - containerRect.top;
  var left = imgRect.left - containerRect.left;

  var topPos = top - this.$toolbar.outerHeight() - 5;
  if (topPos < 0) {
    topPos = top + imgRect.height + 5; // Joga pra baixo da imagem se vazar pelo topo
  }

  var leftPos = left + (imgRect.width / 2) - (this.$toolbar.outerWidth() / 2);
  if (leftPos < 0) leftPos = 5; // Impede vazar pela esquerda

  this.$toolbar.css({ top: topPos, left: leftPos });

  // Verifica se o painel vazou pela direita
  var overflow = this.$toolbar[0].getBoundingClientRect().right - containerRect.right;
  if (overflow > 0) {
    this.$toolbar.css('left', Math.max(5, leftPos - overflow - 5));
  }

  this.$handle.css({
    display: 'block',
    top: top + imgRect.height - 7,
    left: left + imgRect.width - 7
  });
};

ImagePlugin.prototype.hideToolbar = function () {
  if (this.activeImage) {
    $(this.activeImage).removeClass('weaver-selected');
    if (!this.activeImage.getAttribute('class')) this.activeImage.removeAttribute('class');
  }
  this.activeImage = null;
  this.$toolbar.hide();
  this.$handle.hide();
  this.$altBox.hide();
};

// Ações da Barra de Ferramentas
ImagePlugin.prototype.resizeImage = function (width) {
  if (!this.activeImage) return;
  this.editor.history.save();
  $(this.activeImage).css({ 'width': width, 'height': 'auto' });
  this.editor.history.save();
  this.editor.trigger('change');
  this.showToolbar(this.activeImage); // Reposiciona a barra
};

ImagePlugin.prototype.setOriginalSize = function () {
  if (!this.activeImage) return;
  this.editor.history.save();
  $(this.activeImage).css({ 'width': '', 'height': '' });
  this.editor.history.save();
  this.editor.trigger('change');
  this.showToolbar(this.activeImage);
};

ImagePlugin.prototype.setFloat = function (direction) {
  if (!this.activeImage) return;
  this.editor.history.save();
  if (direction === 'center') {
    $(this.activeImage).css({ 'float': 'none', 'display': 'block', 'margin': '15px auto' });
  } else {
    var margin = direction === 'left' ? '0 15px 15px 0' : '15px 0 15px 15px';
    $(this.activeImage).css({ 'float': direction, 'display': 'inline-block', 'margin': margin });
  }
  this.editor.history.save();
  this.editor.trigger('change');
  this.showToolbar(this.activeImage);
};

ImagePlugin.prototype.removeFloat = function () {
  if (!this.activeImage) return;
  this.editor.history.save();
  $(this.activeImage).css({ 'float': '', 'display': '', 'margin': '' });
  this.editor.history.save();
  this.editor.trigger('change');
  this.showToolbar(this.activeImage);
};

ImagePlugin.prototype.removeImage = function () {
  if (!this.activeImage) return;
  this.editor.history.save();
  var $img = $(this.activeImage);
  this.hideToolbar();
  $img.remove();
  this.editor.history.save();
  this.editor.trigger('change');
};

// Funções de inserção de imagem (arrastar e soltar / diálogo)
ImagePlugin.prototype.openFileDialog = function () {
  var self = this;
  
  // Salva a seleção exata do cursor antes da janela de arquivos roubar o foco
  if (this.editor.selection && this.editor.selection.isInsideEditor()) {
    this.savedRange = this.editor.selection.getRange();
  } else {
    this.savedRange = null;
  }

  var $input = $('<input type="file" style="display:none">').attr('accept', ImagePlugin.ACCEPTED_TYPES.join(','));

  $input.on('change', function () {
    var file = this.files[0];
    if (file) {
      self.insertImage(file);
    }
    $input.remove();
  });

  this.editor.$container.append($input);
  $input.click();
};

ImagePlugin.prototype.bindDragAndDrop = function () {
  var self = this;
  var $content = this.editor.$content;
  var ns = this.editor.ns;
  var internalDrag = false;
  var dragDepth = 0;

  function hasFiles(e) {
    var dt = e.originalEvent && e.originalEvent.dataTransfer;
    if (!dt || !dt.types) return false;
    for (var i = 0; i < dt.types.length; i++) {
      if (dt.types[i] === 'Files') return true;
    }
    return false;
  }

  function placeCaretAt(oe) {
    var range = null;
    if (document.caretRangeFromPoint) {
      range = document.caretRangeFromPoint(oe.clientX, oe.clientY);
    } else if (document.caretPositionFromPoint) {
      var pos = document.caretPositionFromPoint(oe.clientX, oe.clientY);
      if (pos) {
        range = document.createRange();
        range.setStart(pos.offsetNode, pos.offset);
      }
    } else if (oe.rangeParent) { // Firefox antigo
      range = document.createRange();
      range.setStart(oe.rangeParent, oe.rangeOffset);
    }
    if (range) {
      range.collapse(true);
      self.editor.selection.setRange(range);
    }
  }

  // Arrastar texto DENTRO do editor continua nativo (o conteúdo já é seguro)
  $content.on('dragstart' + ns, function () { internalDrag = true; });
  $content.on('dragend' + ns, function () { internalDrag = false; });

  $content.on('dragenter' + ns, function (e) {
    if (!hasFiles(e)) return;
    dragDepth++;
    $content.addClass('drag-over');
  });

  $content.on('dragover' + ns, function (e) {
    if (!hasFiles(e)) return;
    e.preventDefault();
  });

  // dragenter/dragleave disparam ao passar por cada filho; o contador evita
  // que o destaque fique piscando
  $content.on('dragleave' + ns, function (e) {
    if (!hasFiles(e)) return;
    dragDepth = Math.max(0, dragDepth - 1);
    if (!dragDepth) $content.removeClass('drag-over');
  });

  $content.on('drop' + ns, function (e) {
    var oe = e.originalEvent;
    dragDepth = 0;
    $content.removeClass('drag-over');

    if (internalDrag) {
      internalDrag = false;
      setTimeout(function () {
        self.editor.history.save();
        self.editor.trigger('change');
      }, 0);
      return; // movimentação nativa de texto
    }

    var dt = oe.dataTransfer;
    if (!dt) return;

    e.preventDefault();
    e.stopPropagation();

    self.editor.$content.focus();
    placeCaretAt(oe);

    if (hasFiles(e)) {
      self.savedRange = self.editor.selection.isInsideEditor() ? self.editor.selection.getRange() : null;
      var files = dt.files;
      if (files && files.length > 0) {
        self.insertImage(files[0]); // valida formato e tamanho
      }
      return;
    }

    // Texto ou HTML vindo de fora (outra aba, outro app): passa pelo sanitizador
    var html = dt.getData('text/html');
    var text = dt.getData('text/plain');
    if (!html && !text) return;

    self.editor.history.save();
    self.rangeFormatter.insertHTML(html || self.editor.sanitizer.textToHtml(text));
    self.editor.history.save();
    self.editor.trigger('change');
  });
};

/**
 * Valida, envia (ou embute) e insere uma imagem.
 * - Formatos: PNG, JPG, GIF, WebP, AVIF. Tamanho: options.maxImageSize.
 * - Com options.uploadImage(file, done): chame done(url) no sucesso ou
 *   done(null, 'mensagem') no erro; a mensagem aparece no editor.
 * - Sem uploadImage: a imagem é embutida em base64, reduzida para no máximo
 *   options.imageMaxWidth px de largura (GIF fica como está, por ser animado).
 */
ImagePlugin.prototype.insertImage = function (file) {
  var self = this;
  var editor = this.editor;
  var options = editor.options;
  var uploadFn = options.uploadImage;

  if (!file || ImagePlugin.ACCEPTED_TYPES.indexOf(file.type) === -1) {
    editor.notify('Formato de imagem não suportado. Use PNG, JPG, GIF, WebP ou AVIF.', { type: 'error' });
    return;
  }

  if (options.maxImageSize && file.size > options.maxImageSize) {
    editor.notify('A imagem tem ' + ImagePlugin.formatSize(file.size) + '. O máximo é ' + ImagePlugin.formatSize(options.maxImageSize) + '.', { type: 'error' });
    return;
  }

  var doInsert = function (url) {
    // A URL pode vir do callback de upload do integrador: valida o protocolo.
    // data: só para formatos raster (SVG pode carregar script).
    if (!editor.sanitizer.isSafeUrl(url, 'img', 'src')) {
      editor.notify('O endereço da imagem foi recusado por segurança.', { type: 'error' });
      return;
    }

    editor.$content.focus();
    if (self.savedRange) {
      editor.selection.setRange(self.savedRange);
    }
    
    // Cria o elemento img
    var img = document.createElement('img');
    img.src = url;
    img.setAttribute('alt', '');
    
    editor.history.save();
    self.rangeFormatter.insertNode(img, false);
    editor.history.save();
    
    editor.trigger('change');
  };

  if (uploadFn && typeof uploadFn === 'function') {
    editor.notify('Enviando imagem…', { timeout: 0 });
    var finished = false;
    uploadFn(file, function (url, error) {
      if (finished) return;
      finished = true;
      if (error || !url) {
        editor.notify(typeof error === 'string' ? error : 'Não foi possível enviar a imagem.', { type: 'error' });
        return;
      }
      editor.notify('');
      doInsert(url);
    }, editor);
    return;
  }

  var reader = new FileReader();
  reader.onerror = function () {
    editor.notify('Não foi possível ler a imagem.', { type: 'error' });
  };
  reader.onload = function (e) {
    ImagePlugin.downscale(e.target.result, file.type, options.imageMaxWidth, doInsert);
  };
  reader.readAsDataURL(file);
};

ImagePlugin.formatSize = function (bytes) {
  if (bytes >= 1024 * 1024) return (bytes / (1024 * 1024)).toFixed(1).replace('.0', '') + ' MB';
  return Math.round(bytes / 1024) + ' KB';
};

/**
 * Reduz a imagem para maxWidth px (mantendo a proporção) antes de embutir.
 * Fotos de celular com 4000 px viravam vários MB de base64 no HTML salvo.
 */
ImagePlugin.downscale = function (dataUrl, type, maxWidth, done) {
  if (!maxWidth || type === 'image/gif') {
    done(dataUrl);
    return;
  }

  var image = new Image();
  image.onload = function () {
    if (image.naturalWidth <= maxWidth) {
      done(dataUrl);
      return;
    }
    var ratio = maxWidth / image.naturalWidth;
    var canvas = document.createElement('canvas');
    canvas.width = maxWidth;
    canvas.height = Math.round(image.naturalHeight * ratio);
    canvas.getContext('2d').drawImage(image, 0, 0, canvas.width, canvas.height);
    var outType = type === 'image/png' ? 'image/png' : 'image/jpeg';
    try {
      done(canvas.toDataURL(outType, 0.85));
    } catch (e) {
      done(dataUrl);
    }
  };
  image.onerror = function () { done(dataUrl); };
  image.src = dataUrl;
};

window.ImagePlugin = ImagePlugin;
function VideoPlugin(editor) {
  this.editor = editor;
  this.$popover = null;
  this.savedRange = null;
}

VideoPlugin.prototype.init = function () {
  var self = this;

  // Inicializa o RangeFormatter para operações robustas no DOM
  this.rangeFormatter = new RangeFormatter(this.editor);

  this.editor.registerCommand('video', function () {
    self.togglePopover();
  });

  this.buildPopover();
};

VideoPlugin.prototype.buildPopover = function () {
  var self = this;

  this.$popover = $('<div class="editor-video-popover absolute bg-white border border-gray-200 p-3 rounded-md z-50 shadow-lg w-72 text-sm hidden font-sans"></div>');
  
  var $form = $('<div class="flex flex-col gap-3"></div>');
  
  var $urlGroup = $('<div class="flex flex-col gap-1"><label class="font-semibold text-gray-700 m-0">URL do Vídeo (YouTube/Vimeo)</label></div>');
  this.$urlInput = $('<input type="text" placeholder="https://" class="px-2 py-1.5 border border-gray-300 rounded text-sm outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 w-full">');
  $urlGroup.append(this.$urlInput);

  this.$urlError = $('<div class="editor-video-error text-xs text-red-600 hidden" role="alert">Use um link do YouTube ou do Vimeo.</div>');
  $urlGroup.append(this.$urlError);

  var $btnGroup = $('<div class="flex mt-1"></div>');
  
  var $rightBtns = $('<div class="flex gap-2 ml-auto"></div>');
  var $btnCancel = $('<button type="button" class="px-3 py-1.5 border border-gray-300 bg-white rounded cursor-pointer text-sm text-gray-700 hover:bg-gray-50 transition-colors">Cancelar</button>');
  var $btnSave = $('<button type="button" class="px-4 py-1.5 border-none bg-blue-600 text-white rounded cursor-pointer text-sm font-semibold hover:bg-blue-700 transition-colors">Inserir</button>');
  
  $rightBtns.append($btnCancel, $btnSave);
  $btnGroup.append($rightBtns);

  $form.append($urlGroup, $btnGroup);
  this.$popover.append($form);

  this.editor.$container.append(this.$popover);

  // Enter num campo de texto confirma
  this.$popover.on('keydown', 'input[type="text"]', function (e) {
    if (e.key === 'Enter') {
      e.preventDefault();
      $btnSave.trigger('click');
    }
  });

  // Diálogo acessível: rótulos ligados, Esc fecha e Tab fica no popover
  this.editor.dialogize(this.$popover, {
    name: 'video',
    label: 'Inserir vídeo',
    close: function () { self.togglePopover(false); }
  });

  // Evita que clicar no popover faça o editor perder o foco
  this.$popover.on('mousedown', function (e) {
    if (e.target.tagName !== 'INPUT') {
      e.preventDefault();
    }
  });

  $btnCancel.on('click', function () {
    self.togglePopover(false);
  });

  $btnSave.on('click', function () {
    // Mantém o popover aberto quando a URL é recusada
    if (self.insertVideo() !== false) {
      self.togglePopover(false);
    }
  });

  this.$urlInput.on('input', function () {
    self.$urlError.addClass('hidden').hide();
  });

  // Esconde o popover se clicar fora
  $(document).on('mousedown' + this.editor.ns, function (e) {
    var $btn = self.editor.$toolbar.find('[data-name="video"]');
    if (!self.$popover.is(e.target) && self.$popover.has(e.target).length === 0 && !$btn.is(e.target) && $btn.has(e.target).length === 0) {
      self.togglePopover(false);
    }
  });
};

VideoPlugin.prototype.togglePopover = function (forceState) {
  var $btn = this.editor.$toolbar.find('[data-name="video"]');
  if ($btn.length === 0) return;

  var isVisible = forceState !== undefined ? forceState : !this.$popover.is(':visible');

  if (isVisible) {
    if (this.editor.selection && this.editor.selection.isInsideEditor()) {
      this.savedRange = this.editor.selection.getRange();
    } else {
      return;
    }

    this.$urlInput.val('');
    this.$urlError.addClass('hidden').hide();

    var btnOffset = $btn.position();
    this.$popover.css({
      top: btnOffset.top + $btn.outerHeight() + 5,
      left: btnOffset.left
    });
    this.$popover.show();
    
    // Verifica se o painel vazou pela direita
    if (this.$popover[0].getBoundingClientRect().right > this.editor.$container[0].getBoundingClientRect().right) {
      this.$popover.css('left', btnOffset.left - this.$popover.outerWidth() + $btn.outerWidth());
    }

    var self = this;
    setTimeout(function() {
      self.$urlInput.focus();
    }, 0);

  } else {
    this.$popover.hide();
  }
};

VideoPlugin.prototype.insertVideo = function () {
  if (this.savedRange) {
    var sel = window.getSelection();
    sel.removeAllRanges();
    sel.addRange(this.savedRange);
  } else if (!this.editor.selection || !this.editor.selection.isInsideEditor()) {
    return;
  }

  var url = this.$urlInput.val().trim();
  if (!url || url === 'https://') return false;

  // Somente YouTube e Vimeo. Qualquer outra URL é recusada: antes ela virava
  // o src do iframe e permitia javascript: e injeção de atributos.
  var iframeUrl = VideoPlugin.toEmbedUrl(url);

  if (!iframeUrl) {
    this.$urlError.removeClass('hidden').show();
    this.$urlInput.focus();
    return false;
  }

  var html = '<iframe width="560" height="315" style="max-width: 100%;" src="' + iframeUrl + '" frameborder="0" ' +
    'allow="accelerometer; encrypted-media; gyroscope; picture-in-picture; fullscreen" allowfullscreen title="Vídeo incorporado"></iframe><p><br></p>';

  this.editor.history.save();
  // insertHTML sanitiza e confere o src contra a allowlist de players
  this.rangeFormatter.insertHTML(html);
  this.editor.history.save();

  this.editor.trigger('change');
  this.editor.updateToolbar();
  return true;
};

/**
 * Converte um link do YouTube ou Vimeo na URL do player.
 * Só aceita IDs nos formatos oficiais, então o resultado é sempre seguro.
 * @param {string} url
 * @returns {string|null}
 */
VideoPlugin.toEmbedUrl = function (url) {
  var ytMatch = /^(?:https?:)?\/\/(?:www\.|m\.)?(?:youtube\.com\/(?:watch\?(?:.*&)?v=|embed\/|shorts\/|v\/|live\/)|youtu\.be\/)([A-Za-z0-9_-]{11})(?:[?&#\/].*)?$/i.exec(url);
  if (ytMatch) {
    return 'https://www.youtube-nocookie.com/embed/' + ytMatch[1];
  }

  var vimeoMatch = /^(?:https?:)?\/\/(?:www\.|player\.)?vimeo\.com\/(?:video\/)?(\d+)(?:[?#\/].*)?$/i.exec(url);
  if (vimeoMatch) {
    return 'https://player.vimeo.com/video/' + vimeoMatch[1];
  }

  return null;
};

window.VideoPlugin = VideoPlugin;
function FullscreenPlugin(editor) {
  this.editor = editor;
  this.active = false;
}

FullscreenPlugin.prototype.init = function () {
  var self = this;
  this.editor.registerCommand('fullscreen', function () {
    self.toggle();
  });
  this.editor.registerCommand('closeFullscreen', function () {
    if (self.active) self.toggle();
  });

  $(document).on('keydown' + this.editor.ns, function(e) {
    if (e.key === 'Escape' && self.active) {
      self.toggle();
    }
  });
};

FullscreenPlugin.prototype.toggle = function () {
  this.active = !this.active;
  this.editor.$container.toggleClass('editor-fullscreen', this.active);

  var $btn = this.editor.$toolbar.find('[data-name="fullscreen"]');
  var $closeBtn = this.editor.$toolbar.find('[data-name="closeFullscreen"]');
  var $closeBtnGroup = $closeBtn.closest('.editor-toolbar-group');

  if (this.active) {
    $btn.hide();
    $closeBtn.removeClass('hidden');
    $closeBtnGroup.removeClass('hidden');
  } else {
    $btn.show();
    $closeBtn.addClass('hidden');
    $closeBtnGroup.addClass('hidden');
  }
};

window.FullscreenPlugin = FullscreenPlugin;
function HistoryPlugin(editor) {
  this.editor = editor;
}

HistoryPlugin.prototype.init = function () {
  var editor = this.editor;

  editor.registerCommand('undo', function () {
    editor.history.undo();
  });

  editor.registerCommand('redo', function () {
    editor.history.redo();
  });
};

window.HistoryPlugin = HistoryPlugin;
function CodeViewPlugin(editor) {
  this.editor = editor;
  this.active = false;
}

CodeViewPlugin.prototype.init = function () {
  var self = this;

  // Cria a estrutura para a visualização de código com syntax highlight e numeração
  this.$wrapper = $('<div class="editor-codeview-wrapper"></div>');
  this.$lines = $('<div class="editor-codeview-lines"></div>');
  this.$highlight = $('<div class="editor-codeview-highlight"></div>');
  this.$textarea = $('<textarea class="editor-codeview-textarea" spellcheck="false" wrap="off"></textarea>');

  this.$wrapper.append(this.$lines, this.$highlight, this.$textarea);
  this.editor.$container.append(this.$wrapper);

  this.editor.registerCommand('codeview', function () {
    self.toggle();
  });

  this.$textarea.on('input', function () {
    self.updateView();
  });

  // Tab indenta em vez de tirar o foco do código
  this.$textarea.on('keydown', function (e) {
    if (e.key !== 'Tab' || e.ctrlKey || e.metaKey || e.altKey) return;
    e.preventDefault();
    var el = this;
    var start = el.selectionStart;
    var end = el.selectionEnd;
    el.value = el.value.substring(0, start) + '  ' + el.value.substring(end);
    el.selectionStart = el.selectionEnd = start + 2;
    self.updateView();
  });

  // O editor lê daqui enquanto o code view estiver aberto (ex.: envio do formulário)
  this.editor.codeView = this;

  this.$textarea.on('scroll', function () {
    self.$highlight.scrollTop($(this).scrollTop());
    self.$highlight.scrollLeft($(this).scrollLeft());
    self.$lines.scrollTop($(this).scrollTop());
  });
};

CodeViewPlugin.prototype.formatHtml = function (html) {
  var escaped = html.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  // Regex que busca tudo que estiver entre &lt; e &gt; para pintar de amarelo
  return escaped.replace(/(&lt;(?:(?!&lt;)[\s\S])*?&gt;)/gi, '<span class="html-tag">$1</span>');
};

CodeViewPlugin.prototype.updateView = function () {
  var code = this.$textarea.val();
  
  // Atualiza o destaque de sintaxe
  var highlighted = this.formatHtml(code);
  // Corrige problema de renderização onde quebra de linha final em DIV não ocupa espaço
  if (code && code.charAt(code.length - 1) === '\n') {
    highlighted += ' ';
  }
  this.$highlight.html(highlighted);

  // Atualiza os números das linhas
  var linesCount = code.split('\n').length;
  var linesText = '';
  for (var i = 1; i <= linesCount; i++) {
    linesText += i + '\n';
  }
  this.$lines.text(linesText);
};

CodeViewPlugin.prototype.beautifyHtml = function (html) {
  var tab = '  '; // 2 espaços para a indentação
  var result = '';
  var indent = '';

  // Extrai os blocos <pre>, <style> e <script> para preservá-los intactos e substitui por um placeholder
  var preBlocks = [];
  html = html.replace(/(<(pre|style|script)[^>]*>[\s\S]*?<\/\2>)/gi, function(match) {
    preBlocks.push(match);
    return '<pre-placeholder id="' + (preBlocks.length - 1) + '"/>';
  });

  // Padroniza do zero: quebras de linha viram UM espaço. Antes elas eram
  // apagadas e "palavra\noutra" virava "palavraoutra".
  html = html.replace(/[ \t]*[\r\n]+[ \t]*/g, ' ');

  var tags = html.split(/(<[^>]+>)/g);
  var inlineTags = ['a', 'span', 'b', 'i', 'u', 'strong', 'em', 'strike', 's', 'sub', 'sup', 'code', 'font'];

  for (var i = 0; i < tags.length; i++) {
    var tag = tags[i];
    if (!tag) continue;

    // Se não for uma tag (for apenas um nó de texto solto)
    if (tag.charAt(0) !== '<') {
      // Logo após uma tag de bloco, o texto começa na linha indentada
      if (result.length && result.charAt(result.length - 1) === '\n') {
        tag = tag.replace(/^\s+/, '');
        if (!tag) continue;
        result += indent;
      }
      result += tag;
      continue;
    }

    var isClosingTag = tag.match(/^<\//);
    var isSelfClosingTag = tag.match(/.*\/>$/) || tag.match(/^<(br|hr|img|input|meta|link|area|base|col|embed|param|source|track|wbr)[^>]*>$/i);
    var isOpeningTag = tag.match(/^<\w/) && !isClosingTag && !isSelfClosingTag;
    
    // Descobre o nome da tag
    var tagNameMatch = tag.match(/^<\/?([a-zA-Z0-9]+)/);
    var tagName = tagNameMatch ? tagNameMatch[1].toLowerCase() : '';
    
    var isInline = inlineTags.indexOf(tagName) !== -1;

    if (isClosingTag && !isInline) {
      indent = indent.substring(tab.length);
      result = result.replace(/[ \t]+$/, '');
      if (result.length > 0 && result.charAt(result.length - 1) !== '\n') result += '\n';
      result += indent + tag + '\n';
    } else if (isOpeningTag && !isInline) {
      result = result.replace(/[ \t]+$/, '');
      if (result.length > 0 && result.charAt(result.length - 1) !== '\n') result += '\n';
      result += indent + tag + '\n';
      indent += tab;
    } else if (isSelfClosingTag && !isInline) {
      result = result.replace(/[ \t]+$/, '');
      if (result.length > 0 && result.charAt(result.length - 1) !== '\n') result += '\n';
      result += indent + tag + '\n';
    } else {
      // Tags inline e de formatação simples
      result += tag;
    }
  }

  result = result.trim();

  // Devolve os blocos <pre> para seus lugares originais preservando toda formatação e espaços nativos
  for (var j = 0; j < preBlocks.length; j++) {
    result = result.replace('<pre-placeholder id="' + j + '"/>', function() { 
      return preBlocks[j]; 
    });
  }

  return result;
};

CodeViewPlugin.prototype.toggle = function () {
  this.active = !this.active;
  var $codeViewBtn = this.editor.$toolbar.find('[data-name="codeview"]');

  if (this.active) {
    // Lê direto do conteúdo: getContent() já considera o code view ativo
    var html = this.editor.$content.html();
    
    // Aplica a formatação em cascata inteligente no HTML
    html = this.beautifyHtml(html);

    this.$textarea.val(html);
    this.updateView();

    this.editor.$content.hide();
    this.$wrapper.show();
    
    this.editor.$toolbar.find('button').not($codeViewBtn).prop('disabled', true);
    $codeViewBtn.addClass('active');
  } else {
    var val = this.$textarea.val();
    this.editor.history.save();
    this.editor.setContent(val); // setContent sanitiza
    this.editor.history.save();
    this.editor.trigger('change');
    this.$wrapper.hide();
    this.editor.$content.show();
    
    this.editor.$toolbar.find('button').prop('disabled', false);
    $codeViewBtn.removeClass('active');
  }
};

window.CodeViewPlugin = CodeViewPlugin;
function AiPlugin(editor) {
  this.editor = editor;
  this.$popover = null;
  this.savedRange = null;
}

AiPlugin.prototype.init = function () {
  var self = this;

  this.rangeFormatter = new RangeFormatter(this.editor);

  this.editor.registerCommand('ai', function () {
    self.togglePopover();
  });

  this.buildPopover();
};

AiPlugin.prototype.buildPopover = function () {
  var self = this;

  this.$popover = $('<div class="editor-ai-popover absolute bg-white border border-gray-200 p-3 rounded-md z-50 shadow-lg w-80 text-sm hidden font-sans"></div>');
  
  var $form = $('<div class="flex flex-col gap-3"></div>');
  
  var $promptGroup = $('<div class="flex flex-col gap-1"><label class="font-semibold text-gray-700 m-0 flex items-center"><i data-lucide="sparkles" class="w-4 h-4 mr-1 text-purple-600"></i> IA: Descrever Produto</label></div>');
  this.$promptInput = $('<textarea rows="3" placeholder="Ex: Crie uma descrição persuasiva para uma camiseta preta de algodão..." class="px-2 py-1.5 border border-gray-300 rounded text-sm outline-none focus:border-purple-500 focus:ring-1 focus:ring-purple-500 w-full resize-none"></textarea>');
  $promptGroup.append(this.$promptInput);

  // Erro mostrado no próprio popover (antes era um alert() que travava a página)
  this.$error = $('<div class="editor-ai-error text-xs text-red-600 hidden" role="alert"></div>');
  $promptGroup.append(this.$error);

  var $btnGroup = $('<div class="flex mt-1"></div>');
  
  var $rightBtns = $('<div class="flex gap-2 ml-auto"></div>');
  var $btnCancel = $('<button type="button" class="px-3 py-1.5 border border-gray-300 bg-white rounded cursor-pointer text-sm text-gray-700 hover:bg-gray-50 transition-colors">Cancelar</button>');
  this.$btnGenerate = $('<button type="button" class="px-4 py-1.5 border-none bg-purple-600 text-white rounded cursor-pointer text-sm font-semibold hover:bg-purple-700 transition-colors flex items-center justify-center min-w-[80px]">Gerar</button>');
  
  $rightBtns.append($btnCancel, this.$btnGenerate);
  $btnGroup.append($rightBtns);

  $form.append($promptGroup, $btnGroup);
  this.$popover.append($form);

  this.editor.$container.append(this.$popover);

  // Diálogo acessível: rótulos ligados, Esc fecha e Tab fica no popover
  this.editor.dialogize(this.$popover, {
    name: 'ai',
    label: 'Assistente de IA',
    close: function () { self.togglePopover(false); }
  });

  this.$popover.on('mousedown', function (e) {
    if (e.target.tagName !== 'INPUT' && e.target.tagName !== 'TEXTAREA') {
      e.preventDefault();
    }
  });

  $btnCancel.on('click', function () {
    self.togglePopover(false);
  });

  this.$btnGenerate.on('click', function () {
    self.generateDescription();
  });

  // Ctrl+Enter (Cmd+Enter no Mac) gera sem precisar sair do campo
  this.$promptInput.on('keydown', function (e) {
    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
      e.preventDefault();
      self.generateDescription();
    }
  });

  $(document).on('mousedown' + this.editor.ns, function (e) {
    var $btn = self.editor.$toolbar.find('[data-name="ai"]');
    if (!self.$popover.is(e.target) && self.$popover.has(e.target).length === 0 && !$btn.is(e.target) && $btn.has(e.target).length === 0) {
      self.togglePopover(false);
    }
  });
};

AiPlugin.prototype.togglePopover = function (forceState) {
  var $btn = this.editor.$toolbar.find('[data-name="ai"]');
  if ($btn.length === 0) return;

  var isVisible = forceState !== undefined ? forceState : !this.$popover.is(':visible');

  if (isVisible) {
    if (this.editor.selection && this.editor.selection.isInsideEditor()) {
      this.savedRange = this.editor.selection.getRange();
    } else {
      return;
    }

    this.$promptInput.val('');
    this.$error.text('').addClass('hidden').hide();
    this.$btnGenerate.html('Gerar').prop('disabled', false).removeAttr('aria-busy');

    var btnOffset = $btn.position();
    this.$popover.css({
      top: btnOffset.top + $btn.outerHeight() + 5,
      left: btnOffset.left
    });
    this.$popover.show();
    
    if (this.$popover[0].getBoundingClientRect().right > this.editor.$container[0].getBoundingClientRect().right) {
      this.$popover.css('left', btnOffset.left - this.$popover.outerWidth() + $btn.outerWidth());
    }

    var self = this;
    setTimeout(function() {
      self.$promptInput.focus();
    }, 0);

  } else {
    this.$popover.hide();
  }
};

AiPlugin.prototype.generateDescription = function () {
  var self = this;
  var prompt = this.$promptInput.val().trim();
  
  if (!prompt) {
    this.$promptInput.focus();
    return;
  }

  this.$error.text('').addClass('hidden').hide();
  this.$btnGenerate.html('<i data-lucide="loader-2" class="w-4 h-4 mr-2 animate-spin" aria-hidden="true"></i> Gerando...').prop('disabled', true).attr('aria-busy', 'true');
  
  WysiwygEditor.renderIcons(this.$btnGenerate[0]);

  function handleSuccess(html) {
    self.insertHtml(html);
    self.togglePopover(false);
  }

  function handleError(errorMsg) {
    self.$error.text('Não foi possível gerar o conteúdo: ' + (errorMsg || 'falha na comunicação com a API.')).removeClass('hidden').show();
    self.$btnGenerate.html('Gerar').prop('disabled', false).removeAttr('aria-busy');
    self.$promptInput.focus();
  }

  // 1. Caso o desenvolvedor tenha informado um callback customizado (ex: onAiGenerate)
  if (typeof this.editor.options.onAiGenerate === 'function') {
    this.editor.options.onAiGenerate(prompt, function(html, error) {
      if (error) {
        handleError(error);
      } else {
        handleSuccess(html);
      }
    }, this.editor);
    return;
  }

  // 2. Chamada AJAX padrão para o endpoint da API de IA (ex: ai-api.php)
  var endpoint = this.editor.options.aiEndpoint || 'ai-api.php';

  $.ajax({
    url: endpoint,
    type: 'POST',
    contentType: 'application/json',
    data: JSON.stringify({ prompt: prompt }),
    dataType: 'json',
    success: function(response) {
      if (response && response.success && response.html) {
        handleSuccess(response.html);
      } else if (response && response.error) {
        handleError(response.error);
      } else {
        handleError('Resposta inválida do servidor.');
      }
    },
    error: function(xhr, status, error) {
      // O backend devolve { error: "mensagem" } com o status HTTP adequado
      var message = xhr && xhr.responseJSON && xhr.responseJSON.error;
      handleError(message || error || 'Erro na requisição AJAX para ' + endpoint);
    }
  });
};

AiPlugin.prototype.insertHtml = function (html) {
  if (this.savedRange) {
    var sel = window.getSelection();
    sel.removeAllRanges();
    sel.addRange(this.savedRange);
  } else if (!this.editor.selection || !this.editor.selection.isInsideEditor()) {
    return;
  }

  // A resposta da IA é conteúdo não confiável (pode ser induzida via prompt
  // a devolver <script> ou onerror); insertHTML sempre sanitiza.
  this.editor.history.save();
  this.rangeFormatter.insertHTML(String(html || ''));
  this.editor.history.save();

  this.editor.trigger('change');
  this.editor.updateToolbar();
};

window.AiPlugin = AiPlugin;