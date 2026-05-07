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
    'iframe', 'video', 'audio', 'source'
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
    source: ['src', 'type']
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
  var div = document.createElement('div');
  div.innerHTML = html;

  this.walk(div);

  return this.normalize(div.innerHTML);
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
    var name = attrs[i].name;
    var value = attrs[i].value;

    // remove eventos (proteção contra XSS)
    if (name.indexOf('on') === 0) {
      el.removeAttribute(name);
      continue;
    }

    // remove atributos não permitidos
    if (allowedForTag.indexOf(name) === -1 && allowedGlobal.indexOf(name) === -1) {
      el.removeAttribute(name);
      continue;
    }

    // proteção genérica contra XSS em URLs (links, imagens, iframes, videos)
    if ((name === 'href' || name === 'src') && !this.isSafeUrl(value)) {
      el.removeAttribute(name);
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
  // Permite http/https, caminhos relativos/absolutos e imagens em base64 local
  return /^(https?:|\/|data:image\/)/i.test(url);
};

SanitizerPlugin.prototype.normalize = function (html) {
  return html;
};

window.SanitizerPlugin = SanitizerPlugin;