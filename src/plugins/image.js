function ImagePlugin(editor) {
  this.editor = editor;
}

ImagePlugin.prototype.init = function () {
  this.registerCommand();
  this.bindDrop();
  this.bindPasteImage();
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

ImagePlugin.prototype.bindDrop = function () {
  var self = this;

  this.editor.$content.on('dragover', function (e) {
    e.preventDefault();
    $(this).addClass('drag-over');
  });

  this.editor.$content.on('dragleave', function () {
    $(this).removeClass('drag-over');
  });

  this.editor.$content.on('drop', function (e) {
    e.preventDefault();

    $(this).removeClass('drag-over');

    var evt = e.originalEvent || e;

    var files = evt.dataTransfer.files;
    if (!files || !files.length) return;

    var range;

    if (document.caretRangeFromPoint) {
      range = document.caretRangeFromPoint(evt.clientX, evt.clientY);
    } else if (document.caretPositionFromPoint) {
      var pos = document.caretPositionFromPoint(evt.clientX, evt.clientY);
      range = document.createRange();
      range.setStart(pos.offsetNode, pos.offset);
      range.collapse(true);
    }

    if (range) {
      var sel = window.getSelection();
      sel.removeAllRanges();
      sel.addRange(range);
    }

    // 👇 agora sim faz upload
    for (var i = 0; i < files.length; i++) {
      var file = files[i];

      if (file.type.startsWith('image/')) {
        self.handleUpload(file);
      }
    }
  });
};

ImagePlugin.prototype.bindPasteImage = function () {
  var self = this;

  this.editor.$content.on('paste', function (e) {
    var items = (e.originalEvent || e).clipboardData.items;

    if (!items) return;

    for (var i = 0; i < items.length; i++) {
      var item = items[i];

      if (item.type.indexOf('image') !== -1) {
        var file = item.getAsFile();
        self.handleUpload(file);
      }
    }
  });
};

window.ImagePlugin = ImagePlugin;