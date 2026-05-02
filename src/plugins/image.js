function ImagePlugin(editor) {
  this.editor = editor;
}

ImagePlugin.prototype.init = function () {
  this.registerCommand();
};

ImagePlugin.prototype.registerCommand = function () {
  var self = this;

  this.editor.registerCommand('image', function () {
    self.openDialog();
  });
};

ImagePlugin.prototype.openDialog = function () {
  var self = this;

  // cria input file invisível
  var input = document.createElement('input');
  input.type = 'file';
  input.accept = 'image/*';

  input.onchange = function () {
    var file = input.files[0];
    if (!file) return;

    self.handleUpload(file);
  };

  input.click();
};

ImagePlugin.prototype.handleUpload = function (file) {
  var self = this;

  var uploadFn = this.editor.options.uploadImage;

  // se existir função de upload personalizada, usa ela
  if (typeof uploadFn === 'function') {
    uploadFn(file, function (url) {
      self.insertImage(url);
    });

    return;
  }

  // fallback: base64 (mock/local)
  var reader = new FileReader();

  reader.onload = function (e) {
    self.insertImage(e.target.result);
  };

  reader.readAsDataURL(file);
};

ImagePlugin.prototype.insertImage = function (url) {
  if (!this.editor.selection || !this.editor.selection.isInsideEditor()) return;

  var img = document.createElement('img');
  img.src = url;
  img.alt = '';

  var range = this.editor.selection.getRange();
  if (!range) return;

  range.insertNode(img);

  // move cursor depois da imagem
  range.setStartAfter(img);
  range.setEndAfter(img);

  var sel = window.getSelection();
  sel.removeAllRanges();
  sel.addRange(range);
};

window.ImagePlugin = ImagePlugin;