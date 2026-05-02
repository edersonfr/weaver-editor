function ImagePlugin(editor) {
  this.editor = editor;
}

ImagePlugin.prototype.init = function () {
  this.registerCommand();
  this.bindDrop();
  this.bindPasteImage();
  this.bindImageClick();
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

ImagePlugin.prototype.bindImageClick = function () {
  var self = this;

  this.editor.$content.on('click', 'img', function (e) {
    e.stopPropagation();
    self.activateResize($(this));
  });

  // clicar fora remove seleção
  this.editor.$content.on('click', function () {
    self.deactivateResize();
  });
};

ImagePlugin.prototype.activateResize = function ($img) {
  this.deactivateResize();

  var wrapper = $('<span class="img-resize-wrapper"/>');
  var handle = $('<span class="img-resize-handle"/>');

  $img.wrap(wrapper);
  $img.after(handle);

  this.$activeWrapper = $img.parent();

  this.bindResizeEvents($img, handle);
};

ImagePlugin.prototype.deactivateResize = function () {
  if (!this.$activeWrapper) return;

  var $img = this.$activeWrapper.find('img');

  this.$activeWrapper.replaceWith($img);

  this.$activeWrapper = null;
};

ImagePlugin.prototype.bindResizeEvents = function ($img, $handle) {
  var startX, startWidth;

  $handle.on('mousedown', function (e) {
    e.preventDefault();

    startX = e.clientX;
    startWidth = $img.width();

    function onMouseMove(e) {
      var dx = e.clientX - startX;
      var newWidth = startWidth + dx;

      if (newWidth > 50) {
        $img.css('width', newWidth + 'px');
      }
    }

    function onMouseUp() {
      $(document).off('mousemove', onMouseMove);
      $(document).off('mouseup', onMouseUp);
    }

    $(document).on('mousemove', onMouseMove);
    $(document).on('mouseup', onMouseUp);
  });
};

window.ImagePlugin = ImagePlugin;