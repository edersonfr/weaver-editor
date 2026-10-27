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

    // Print ou imagem copiada: vai pelo mesmo caminho do upload/arrastar.
    // Word e Excel mandam um PNG junto com o HTML; aí vale o HTML.
    var imagePlugin = self.editor.getPlugin('ImagePlugin');
    var files = imagePlugin && !plain ? ImagePlugin.imageFiles(clipboard) : [];
    if (files.length && ImagePlugin.isOnlyImage(html) && (html || !$.trim(text))) {
      imagePlugin.savedRange = self.editor.selection.isInsideEditor() ? self.editor.selection.getRange() : null;
      for (var f = 0; f < files.length; f++) imagePlugin.insertImage(files[f]);
      return;
    }

    // Texto puro é escapado: "<b>" colado como texto continua sendo texto.
    var content = html && !plain
      ? SanitizerPlugin.cleanOfficeHtml(html)
      : self.editor.sanitizer.textToHtml(text || $('<div/>').html(self.editor.sanitizer.sanitize(html)).text());

    self.editor.history.save();
    self.rangeFormatter.insertHTML(content); // insertHTML sanitiza
    self.editor.history.save();
    self.editor.trigger('change');

    if (imagePlugin && html && !plain) imagePlugin.uploadEmbeddedImages(content);
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
