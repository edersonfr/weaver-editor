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
