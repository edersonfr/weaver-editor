function SanitizerPlugin(editor) {
  this.editor = editor;
}

SanitizerPlugin.prototype.init = function () {
  this.allowedTags = this.editor.options.allowedTags || [
    'p', 'b', 'i', 'u', 'strong', 'em',
    'ul', 'ol', 'li',
    'a', 'img',
    'h1', 'h2', 'h3','h4', 'h5', 'h6',
    'div', 'span', 'br',
    'table', 'thead', 'tbody', 'tfoot', 'tr', 'th', 'td', 'caption', 'colgroup', 'col',
    'blockquote', 'pre', 'code', 's', 'strike', 'del', 'sub', 'sup', 'hr', 'mark',
    'iframe', 'video', 'audio', 'source',
    'style', 'script'
  ];

  this.allowedAttributes = this.editor.options.allowedAttributes || {
    '*': ['class', 'id', 'style', 'title', 'dir'],
    a: ['href', 'target', 'rel'],
    img: ['src', 'alt', 'width', 'height'],
    iframe: ['src', 'width', 'height', 'allow', 'allowfullscreen', 'frameborder', 'scrolling'],
    table: ['border', 'cellpadding', 'cellspacing', 'width'],
    td: ['colspan', 'rowspan', 'scope', 'width', 'height', 'valign'],
    th: ['colspan', 'rowspan', 'scope', 'width', 'height', 'valign'],
    ol: ['start', 'type', 'reversed'],
    video: ['src', 'controls', 'width', 'height', 'poster', 'autoplay', 'loop', 'muted'],
    audio: ['src', 'controls', 'autoplay', 'loop', 'muted'],
    source: ['src', 'type'],
    style: ['type', 'media'],
    script: ['src', 'type', 'async', 'defer', 'charset']
  };

  this.bind();
};

SanitizerPlugin.prototype.bind = function () {
  var self = this;

  this.editor.$content.on('paste', function (e) {
    e.preventDefault();

    var html = (e.originalEvent || e).clipboardData.getData('text/html');
    var text = (e.originalEvent || e).clipboardData.getData('text/plain');

    var content = html || text;

    var clean = self.clean(content);

    document.execCommand('insertHTML', false, clean);
  });
};

SanitizerPlugin.prototype.clean = function (html) {
  // Extrai e preserva os blocos <style> e <script> antes de processar
  var styleScriptBlocks = [];
  var preservedHtml = html.replace(/(<(style|script)[^>]*>[\s\S]*?<\/\2>)/gi, function(match) {
    styleScriptBlocks.push(match);
    // Usa uma div com id como placeholder (div é tag permitida, id é atributo permitido)
    return '<div id="weaver-temp-preserve-' + (styleScriptBlocks.length - 1) + '"></div>';
  });

  var div = document.createElement('div');
  div.innerHTML = preservedHtml;

  this.walk(div);

  var cleanedHtml = div.innerHTML;

  // Restaura os blocos <style> e <script> de forma exata
  for (var i = 0; i < styleScriptBlocks.length; i++) {
    cleanedHtml = cleanedHtml.replace(
      '<div id="weaver-temp-preserve-' + i + '"></div>',
      styleScriptBlocks[i]
    );
  }

  return this.normalize(cleanedHtml);
};

SanitizerPlugin.prototype.walk = function (node) {
  var children = node.children;

  for (var i = children.length - 1; i >= 0; i--) {
    var child = children[i];

    // Caminha para os filhos primeiro (bottom-up) para garantir que
    // os filhos não sejam perdidos caso o pai seja desempacotado
    this.walk(child);

    var tag = child.tagName.toLowerCase();

    if (this.allowedTags.indexOf(tag) === -1) {
      // Desempacota a tag (mantém o conteúdo interno) em vez de apagar tudo
      while (child.firstChild) {
        child.parentNode.insertBefore(child.firstChild, child);
      }
      child.parentNode.removeChild(child);
      continue;
    }

    this.cleanAttributes(child, tag);
  }
};

SanitizerPlugin.prototype.cleanAttributes = function (el, tag) {
  var allowedForTag = this.allowedAttributes[tag] || [];
  var allowedGlobal = this.allowedAttributes['*'] || [];
  var attrs = el.attributes;

  for (var i = attrs.length - 1; i >= 0; i--) {
    var originalName = attrs[i].name;
    var name = originalName.toLowerCase();
    var value = attrs[i].value;

    // remove eventos (proteção contra XSS)
    if (name.indexOf('on') === 0) {
      el.removeAttribute(originalName);
      continue;
    }

    // remove atributos não permitidos
    if (allowedForTag.indexOf(name) === -1 && allowedGlobal.indexOf(name) === -1) {
      el.removeAttribute(originalName);
      continue;
    }

    // proteção genérica contra XSS em URLs (links, imagens, iframes, videos)
    if ((name === 'href' || name === 'src') && !this.isSafeUrl(value)) {
      el.removeAttribute(originalName);
    }
  }

  // segurança adicional para links
  if (tag === 'a') {
    if (el.getAttribute('target') === '_blank') {
      el.setAttribute('rel', 'noopener noreferrer');
    } else {
      el.removeAttribute('rel');
    }
  }
};

SanitizerPlugin.prototype.isSafeUrl = function (url) {
  // Se a URL possui um protocolo explícito (ex: http:, javascript:, mailto:), valida-o
  if (/^([a-z0-9\+\-\.]+):/i.test(url)) {
    return /^(https?|data:image\/)/i.test(url);
  }
  // Caminhos relativos puros (como "uploads/img_xxx.jpg" ou "../imagem.png") são sempre seguros
  return true;
};

SanitizerPlugin.prototype.normalize = function (html) {
  return html;
};

window.SanitizerPlugin = SanitizerPlugin;