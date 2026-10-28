/**
 * HtmlSanitizer - Sanitizador central do Weaver Editor (allowlist).
 *
 * Todo HTML que entra no editor (conteúdo inicial, setContent, colar, IA,
 * code view, desfazer/refazer e plugins) passa por aqui.
 *
 * Princípios:
 * - O HTML é interpretado num documento inerte (createHTMLDocument), onde
 *   scripts não rodam e imagens não carregam, então `onerror` nunca dispara.
 * - Somente tags e atributos da allowlist sobrevivem. Tags proibidas
 *   (forbiddenTags) são removidas junto com o conteúdo, mesmo que o
 *   integrador as libere em allowedTags.
 * - URLs são normalizadas como o navegador faz (removendo espaços e
 *   caracteres de controle) antes de validar o protocolo.
 * - CSS inline passa por uma allowlist de propriedades e não aceita url().
 * - iframes só são aceitos para players do YouTube e do Vimeo.
 *
 * Modo confiável (opções): forbiddenTags, allowedTags: '*', RegExp em
 * allowedAttributes, allowedStyles: '*', allowCssUrls, keepComments,
 * iframeAttributes: false, allowedIframeSources: '*', e por fim
 * sanitize: false ou sanitizer: function (html) {...}.
 *
 * Em qualquer modo, o que chega ao editor vivo passa por protect():
 * <script>, <style>, <form> e afins viram um marcador <weaver-raw> inerte,
 * e atributos que executam código (onclick, srcdoc...) são renomeados.
 * unprotect() devolve tudo ao original na saída (getContent).
 */
function HtmlSanitizer(options) {
  options = options || {};

  this.allowedTags = options.allowedTags || HtmlSanitizer.defaults.allowedTags;
  this.allowedAttributes = options.allowedAttributes || HtmlSanitizer.defaults.allowedAttributes;
  this.allowedStyles = options.allowedStyles || HtmlSanitizer.defaults.allowedStyles;
  this.allowedIframeSources = options.allowedIframeSources || HtmlSanitizer.defaults.allowedIframeSources;
  this.forbiddenTags = HtmlSanitizer.lowerList(Array.isArray(options.forbiddenTags) ? options.forbiddenTags : HtmlSanitizer.FORBIDDEN_TAGS);
  this.keepComments = !!options.keepComments;
  this.allowCssUrls = !!options.allowCssUrls;
  this.iframeAttributes = options.iframeAttributes !== false;

  // sanitize: false desliga a allowlist; sanitizer: fn a substitui
  this.customSanitizer = typeof options.sanitizer === 'function' ? options.sanitizer : null;
  this.enabled = options.sanitize !== false && !this.customSanitizer;
}

HtmlSanitizer.HTML_NS = 'http://www.w3.org/1999/xhtml';

/**
 * Tags removidas por padrão, com todo o conteúdo, mesmo se constarem em
 * allowedTags. Inclui as que executam código, carregam recursos ou causam
 * confusão de namespace no parser (svg/math), base de ataques de mXSS.
 * Pode ser trocada pela opção `forbiddenTags`.
 */
HtmlSanitizer.FORBIDDEN_TAGS = [
  'script', 'style', 'noscript', 'template', 'object', 'embed', 'applet',
  'frame', 'frameset', 'base', 'link', 'meta', 'title', 'head', 'svg', 'math',
  'xmp', 'plaintext', 'noembed', 'noframes', 'textarea', 'select', 'option',
  'button', 'input', 'form', 'portal'
];

/**
 * Tags que nunca entram vivas no editor, mesmo quando o sanitizador as
 * deixa passar: executam código, carregam CSS na página inteira, mudam a
 * URL base ou enviariam campos junto com o formulário da página.
 * Elas viram <weaver-raw> e voltam ao original no getContent().
 */
HtmlSanitizer.RAW_TAGS = [
  'script', 'style', 'link', 'meta', 'base', 'title', 'noscript', 'template',
  'object', 'embed', 'applet', 'frame', 'frameset', 'noembed', 'noframes',
  'xmp', 'plaintext', 'portal', 'form', 'input', 'button', 'select', 'textarea'
];

HtmlSanitizer.RAW_TAG = 'weaver-raw';
HtmlSanitizer.RAW_ATTR_PREFIX = 'data-weaver-attr-';

/** Atributos que contêm URLs e precisam de validação de protocolo. */
HtmlSanitizer.URL_ATTRIBUTES = ['href', 'src', 'poster', 'cite'];

/** Padrões CSS que podem carregar recursos ou executar código (modo padrão). */
HtmlSanitizer.UNSAFE_CSS_VALUE = /url\s*\(|expression\s*\(|javascript\s*:|vbscript\s*:|@import|behavior\s*:|-moz-binding|[<>\\]/i;

/** Padrões que executam código; bloqueados em qualquer modo. */
HtmlSanitizer.CSS_EXEC = /expression\s*\(|javascript\s*:|vbscript\s*:|@import|behavior\s*:|-moz-binding/i;

/** Funções CSS que carregam recursos externos. */
HtmlSanitizer.CSS_RESOURCE = /url\s*\(|image-set\s*\(|\bimage\s*\(|cross-fade\s*\(/i;

/** Propriedades que executam código em navegadores antigos. */
HtmlSanitizer.FORBIDDEN_STYLES = ['behavior', '-moz-binding'];

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
 * Valores de `display` aceitos com a allowlist de estilos padrão. Bloqueia,
 * por exemplo, `contents`, usado para sobrepor a interface.
 * Com allowedStyles: '*', qualquer valor passa.
 */
HtmlSanitizer.ALLOWED_DISPLAY = ['block', 'inline', 'inline-block', 'none', 'table', 'table-cell', 'table-row', 'list-item', 'flex', 'inline-flex', 'grid', 'inline-grid'];

/**
 * Sanitiza e devolve uma string HTML.
 * @param {string} html
 * @returns {string}
 */
HtmlSanitizer.prototype.sanitize = function (html) {
  if (this.customSanitizer) return String(this.customSanitizer(HtmlSanitizer.toStr(html)));
  return this._parse(html).innerHTML;
};

/**
 * Sanitiza e devolve um DocumentFragment pronto para inserir no documento.
 * Os nós são importados de um documento inerte e protegidos (protect), então
 * nada executa, mesmo com a sanitização desligada.
 * @param {string} html
 * @returns {DocumentFragment}
 */
HtmlSanitizer.prototype.toFragment = function (html) {
  var body = this.customSanitizer
    ? HtmlSanitizer.parseInert(this.customSanitizer(HtmlSanitizer.toStr(html)))
    : this._parse(html);
  var fragment = document.createDocumentFragment();

  HtmlSanitizer.protect(body);

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

  var normalized = HtmlSanitizer.normalizeUrl(url);
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
 * Com allowedIframeSources: '*', aceita qualquer endereço http(s).
 * @param {string} src
 * @returns {boolean}
 */
HtmlSanitizer.prototype.isAllowedIframeSource = function (src) {
  if (!src) return false;
  if (this.allowedIframeSources === '*') {
    return /^(?:https?:)?\/\//i.test(HtmlSanitizer.normalizeUrl(src));
  }
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
  return this._filterStyle(cssText).css;
};

// =========================
// INTERNOS
// =========================

/**
 * @returns {{css: string, changed: boolean}} changed indica se alguma
 *   declaração foi descartada (sem descarte, o texto original é mantido).
 */
HtmlSanitizer.prototype._filterStyle = function (cssText) {
  cssText = cssText || '';
  var declarations = HtmlSanitizer.splitDeclarations(cssText);
  var kept = [];
  // Comentários CSS poderiam esconder declarações da contagem: reescreve
  var changed = cssText.indexOf('/*') !== -1;

  for (var i = 0; i < declarations.length; i++) {
    var decl = declarations[i];
    var colon = decl.indexOf(':');
    if (colon === -1) {
      if (decl.trim()) changed = true;
      continue;
    }

    var prop = decl.substring(0, colon).trim().toLowerCase();
    var value = decl.substring(colon + 1).trim();

    if (!prop || !value || !this._isAllowedStyle(prop) || !this._isSafeCssValue(prop, value)) {
      changed = true;
      continue;
    }

    kept.push(prop + ': ' + value);
  }

  return { css: kept.join('; '), changed: changed };
};

HtmlSanitizer.prototype._isAllowedStyle = function (prop) {
  if (this.allowedStyles === '*') {
    return HtmlSanitizer.FORBIDDEN_STYLES.indexOf(prop) === -1 && /^-?[a-z][a-z0-9-]*$/.test(prop);
  }
  return this.allowedStyles.indexOf(prop) !== -1;
};

HtmlSanitizer.prototype._isSafeCssValue = function (prop, value) {
  var permissive = this.allowedStyles === '*';
  // Conteúdo entre aspas não vira função CSS; fora delas, um escape
  // ("\75 rl(") poderia esconder url() da verificação
  var bare = value.replace(/"(?:[^"\\]|\\[\s\S])*"|'(?:[^'\\]|\\[\s\S])*'/g, '""');

  if (permissive) {
    if (/\\/.test(bare) || HtmlSanitizer.CSS_EXEC.test(bare)) return false;
  } else {
    if (/[<>\\]/.test(value) || HtmlSanitizer.CSS_EXEC.test(value)) return false;
  }

  if (HtmlSanitizer.CSS_RESOURCE.test(bare) || (!permissive && HtmlSanitizer.CSS_RESOURCE.test(value))) {
    if (!this.allowCssUrls || !this._cssUrlsAreSafe(value)) return false;
  }

  if (prop === 'display' && !permissive) {
    var displayValue = value.replace(/\s*!important\s*$/i, '').toLowerCase();
    if (HtmlSanitizer.ALLOWED_DISPLAY.indexOf(displayValue) === -1) return false;
  }

  return true;
};

/** Valida cada endereço de url(), image-set() etc. como src de imagem. */
HtmlSanitizer.prototype._cssUrlsAreSafe = function (value) {
  var urls = [];
  var re = /url\s*\(\s*(?:"((?:[^"\\]|\\[\s\S])*)"|'((?:[^'\\]|\\[\s\S])*)'|([^)]*?))\s*\)/gi;
  var m;
  while ((m = re.exec(value))) {
    urls.push(m[1] !== undefined ? m[1] : (m[2] !== undefined ? m[2] : m[3]));
  }

  // image-set("a.png" 1x) aceita endereços entre aspas, sem url()
  if (/image-set\s*\(|\bimage\s*\(|cross-fade\s*\(/i.test(value)) {
    var strings = value.match(/"(?:[^"\\]|\\[\s\S])*"|'(?:[^'\\]|\\[\s\S])*'/g) || [];
    for (var s = 0; s < strings.length; s++) urls.push(strings[s].slice(1, -1));
  }

  for (var i = 0; i < urls.length; i++) {
    // Escapes CSS ("java\73 cript:") burlariam a validação do protocolo
    if (/\\/.test(urls[i]) || !this.isSafeUrl(urls[i], 'img', 'src')) return false;
  }
  return true;
};

HtmlSanitizer.prototype._parse = function (html) {
  var body = HtmlSanitizer.parseInert(html);

  // Marcadores do próprio editor (ex.: conteúdo copiado dele e colado de
  // volta) voltam ao original e passam pelas mesmas regras
  HtmlSanitizer.unprotect(body);

  if (this.enabled) this._walk(body);

  return body;
};

HtmlSanitizer.prototype._isAllowedTag = function (tag) {
  return this.allowedTags === '*' || this.allowedTags.indexOf(tag) !== -1;
};

/** svg/math só passam se listados explicitamente em allowedTags (não com '*'). */
HtmlSanitizer.prototype._isAllowedForeignTag = function (tag) {
  return Array.isArray(this.allowedTags) && this.allowedTags.indexOf(tag) !== -1;
};

HtmlSanitizer.prototype._walk = function (parent) {
  var children = Array.prototype.slice.call(parent.childNodes);

  for (var i = 0; i < children.length; i++) {
    var node = children[i];

    if (node.nodeType === 8 && this.keepComments) continue;

    // Comentários e instruções de processamento são descartados.
    if (node.nodeType === 8 || node.nodeType === 7) {
      parent.removeChild(node);
      continue;
    }

    if (node.nodeType !== 1) continue;

    var tag = (node.localName || node.nodeName).toLowerCase();

    // Elementos fora do namespace HTML (svg, math e filhos) são removidos
    // inteiros, salvo se liberados um a um em allowedTags.
    if (node.namespaceURI && node.namespaceURI !== HtmlSanitizer.HTML_NS && !this._isAllowedForeignTag(tag)) {
      parent.removeChild(node);
      continue;
    }

    if (this.forbiddenTags.indexOf(tag) !== -1) {
      parent.removeChild(node);
      continue;
    }

    // Limpa os filhos antes de decidir sobre o pai (bottom-up).
    this._walk(node);
    // O conteúdo de <template> fica fora de childNodes
    if (node.content && node.content.nodeType === 11) this._walk(node.content);

    if (!this._isAllowedTag(tag)) {
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
 * @param {Array|string} list - lista de nomes e RegExp, ou '*'
 */
HtmlSanitizer.matchesAttribute = function (list, name) {
  if (!list) return false;
  if (list === '*') return true;
  for (var i = 0; i < list.length; i++) {
    var rule = list[i];
    if (rule === '*') return true;
    if (rule instanceof RegExp ? rule.test(name) : rule === name) return true;
  }
  return false;
};

HtmlSanitizer.prototype._isAllowedAttribute = function (tag, name) {
  return HtmlSanitizer.matchesAttribute(this.allowedAttributes[tag], name) ||
    HtmlSanitizer.matchesAttribute(this.allowedAttributes['*'], name);
};

/**
 * @returns {boolean} false quando o elemento inteiro deve ser removido.
 */
HtmlSanitizer.prototype._cleanAttributes = function (el, tag) {
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

    if (!this._isAllowedAttribute(tag, name)) {
      el.removeAttribute(originalName);
      continue;
    }

    if (HtmlSanitizer.URL_ATTRIBUTES.indexOf(name) !== -1 && !this.isSafeUrl(value, tag, name)) {
      el.removeAttribute(originalName);
      continue;
    }

    if (name === 'style') {
      var style = this._filterStyle(value);
      if (!style.css) {
        el.removeAttribute(originalName);
      } else if (style.changed) {
        el.setAttribute('style', style.css);
      }
      // Sem descarte, o texto original fica como está
      continue;
    }

    if (name === 'target' && ['_blank', '_self', '_parent', '_top'].indexOf(value) === -1) {
      el.removeAttribute(originalName);
    }
  }

  // target="_blank" exige noopener/noreferrer; os demais valores de rel
  // (nofollow, sponsored...) são mantidos
  if (tag === 'a' && el.getAttribute('target') === '_blank') {
    var rel = (el.getAttribute('rel') || '').split(/\s+/).filter(Boolean);
    var lower = rel.map(function (r) { return r.toLowerCase(); });
    if (lower.indexOf('noopener') === -1) rel.push('noopener');
    if (lower.indexOf('noreferrer') === -1) rel.push('noreferrer');
    el.setAttribute('rel', rel.join(' '));
  }

  if (tag === 'iframe') {
    if (!this.isAllowedIframeSource(el.getAttribute('src'))) {
      return false;
    }
    if (this.iframeAttributes) {
      el.setAttribute('sandbox', 'allow-scripts allow-same-origin allow-presentation allow-popups');
      el.setAttribute('referrerpolicy', 'strict-origin-when-cross-origin');
      el.setAttribute('loading', 'lazy');
    }
  }

  return true;
};

// =========================
// PROTEÇÃO DO EDITOR VIVO
// =========================

/** Atributos com URL que podem executar código (javascript:) no editor. */
HtmlSanitizer.EXEC_URL_ATTRIBUTES = ['href', 'src', 'action', 'data', 'formaction', 'xlink:href'];

/**
 * Prepara nós (de um documento inerte) para entrar no editor vivo sem
 * executar nada: tags de RAW_TAGS viram <weaver-raw> com o HTML original
 * em data-raw, e atributos que executam código ganham o prefixo
 * data-weaver-attr-. Com a sanitização padrão, nada disso chega aqui.
 * @param {Element|DocumentFragment} root
 */
HtmlSanitizer.protect = function (root) {
  var doc = root.ownerDocument || root;
  var selector = HtmlSanitizer.RAW_TAGS.join(',');
  var el;

  // querySelector devolve o mais externo primeiro; ele leva os filhos junto
  while ((el = root.querySelector(selector))) {
    var raw = doc.createElement(HtmlSanitizer.RAW_TAG);
    raw.setAttribute('contenteditable', 'false');
    raw.setAttribute('data-raw', el.outerHTML);
    raw.setAttribute('title', 'Código <' + el.localName + '> preservado (edite pelo código-fonte)');
    raw.textContent = '<' + el.localName + '>';
    el.parentNode.replaceChild(raw, el);
  }

  var all = root.querySelectorAll('*');
  for (var i = 0; i < all.length; i++) {
    var attrs = Array.prototype.slice.call(all[i].attributes);
    for (var a = 0; a < attrs.length; a++) {
      var name = attrs[a].name.toLowerCase();
      if (!HtmlSanitizer.isExecutableAttribute(all[i].localName, name, attrs[a].value)) continue;
      all[i].removeAttribute(attrs[a].name);
      all[i].setAttribute(HtmlSanitizer.RAW_ATTR_PREFIX + name.replace(/:/g, '--'), attrs[a].value);
    }
  }
};

/**
 * Indica se o atributo executaria código no editor vivo: handlers (on*),
 * srcdoc e URLs javascript:/vbscript: (ou data: em quem navega, como iframe).
 */
HtmlSanitizer.isExecutableAttribute = function (tag, name, value) {
  if (name.indexOf('on') === 0 || name === 'srcdoc') return true;
  if (HtmlSanitizer.EXEC_URL_ATTRIBUTES.indexOf(name) === -1) return false;

  var url = HtmlSanitizer.normalizeUrl(value);
  if (/^(?:javascript|vbscript):/i.test(url)) return true;
  return /^data:/i.test(url) && ['img', 'source', 'video', 'audio', 'image'].indexOf(tag) === -1;
};

/**
 * Desfaz protect(): devolve as tags e os atributos originais.
 * @param {Element} root - de preferência num documento inerte
 */
HtmlSanitizer.unprotect = function (root) {
  var doc = root.ownerDocument;
  var raws = root.querySelectorAll(HtmlSanitizer.RAW_TAG);

  for (var r = 0; r < raws.length; r++) {
    var holder = doc.createElement('template');
    holder.innerHTML = raws[r].getAttribute('data-raw') || '';
    var nodes = holder.content;
    raws[r].parentNode.replaceChild(doc.importNode(nodes, true), raws[r]);
  }

  var prefix = HtmlSanitizer.RAW_ATTR_PREFIX;
  if ((root.innerHTML || '').indexOf(prefix) === -1) return;

  var all = root.querySelectorAll('*');
  for (var i = 0; i < all.length; i++) {
    var attrs = Array.prototype.slice.call(all[i].attributes);
    for (var a = 0; a < attrs.length; a++) {
      if (attrs[a].name.indexOf(prefix) !== 0) continue;
      all[i].removeAttribute(attrs[a].name);
      try {
        all[i].setAttribute(attrs[a].name.substring(prefix.length).replace(/--/g, ':'), attrs[a].value);
      } catch (e) { /* nome inválido: descarta */ }
    }
  }
};

/**
 * Interpreta HTML num documento inerte (scripts não rodam, imagens não carregam).
 * @param {string} html
 * @returns {HTMLElement} body do documento inerte
 */
HtmlSanitizer.parseInert = function (html) {
  var doc = document.implementation.createHTMLDocument('');
  doc.body.innerHTML = HtmlSanitizer.toStr(html);
  return doc.body;
};

/**
 * HTML como o navegador o serializa depois de interpretar (sem sanitizar).
 * Serve para comparar se a sanitização mudou alguma coisa.
 * @param {string} html
 * @returns {string}
 */
HtmlSanitizer.serialize = function (html) {
  return HtmlSanitizer.parseInert(html).innerHTML;
};

HtmlSanitizer.toStr = function (html) {
  return html === null || html === undefined ? '' : String(html);
};

/**
 * O navegador ignora espaços e caracteres de controle antes de interpretar
 * o protocolo (" javascript:" e "java\tscript:" executam). Normalizamos igual.
 */
HtmlSanitizer.normalizeUrl = function (url) {
  return String(url).replace(/[\u0000-\u0020\u007F-\u00A0\u1680\u180E\u2000-\u200F\u2028\u2029\u202F\u205F\u3000\uFEFF]/g, '');
};

HtmlSanitizer.lowerList = function (list) {
  var out = [];
  for (var i = 0; i < list.length; i++) out.push(String(list[i]).toLowerCase());
  return out;
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
