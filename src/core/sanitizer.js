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
