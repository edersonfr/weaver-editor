function NormalizerPlugin(editor) {
  this.editor = editor;
}

NormalizerPlugin.prototype.init = function () {
  this.bind();
};

NormalizerPlugin.prototype.bind = function () {
  var self = this;

  this.editor.$content.on('blur', function () {
    self.normalize();
  });
};

NormalizerPlugin.prototype.normalize = function () {
  var root = this.editor.$content[0];

  this.flatten(root, 'b');
  this.flatten(root, 'i');
  this.removeEmpty(root);
};

NormalizerPlugin.prototype.flatten = function (root, tag) {
  var nodes = root.querySelectorAll(tag + ' ' + tag);

  for (var i = 0; i < nodes.length; i++) {
    var inner = nodes[i];
    var parent = inner.parentNode;

    while (inner.firstChild) {
      parent.insertBefore(inner.firstChild, inner);
    }

    parent.removeChild(inner);
  }
};

NormalizerPlugin.prototype.removeEmpty = function (root) {
  var nodes = root.querySelectorAll('*');
  var keepTags = ['BR', 'IMG', 'IFRAME', 'HR', 'VIDEO', 'AUDIO', 'TD', 'TH'];

  for (var i = nodes.length - 1; i >= 0; i--) {
    var el = nodes[i];

    if (
      el.childNodes.length === 0 &&
      keepTags.indexOf(el.tagName) === -1 &&
      el.textContent.trim() === ''
    ) {
      el.parentNode.removeChild(el);
    }
  }
};

window.NormalizerPlugin = NormalizerPlugin;