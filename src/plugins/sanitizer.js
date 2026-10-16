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

    // Texto puro é escapado: "<b>" colado como texto continua sendo texto.
    var content = html ? html : self.editor.sanitizer.textToHtml(text);

    self.editor.history.save();
    self.rangeFormatter.insertHTML(content); // insertHTML sanitiza
    self.editor.history.save();
    self.editor.trigger('change');
  });
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
