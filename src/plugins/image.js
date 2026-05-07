function ImagePlugin(editor) {
  this.editor = editor;
  this.activeImage = null;
  this.$toolbar = null;
}

ImagePlugin.prototype.init = function () {
  var self = this;

  this.editor.registerCommand('image', function () {
    self.openFileDialog();
  });

  this.buildToolbar();
  this.bindContentEvents();
  this.bindDragAndDrop();
};

ImagePlugin.prototype.buildToolbar = function () {
  var self = this;
  this.$toolbar = $('<div class="editor-image-toolbar"></div>');

  var buttons = [
    { label: '100%', title: 'Largura 100%', action: function() { self.resizeImage('100%'); } },
    { label: '50%', title: 'Largura 50%', action: function() { self.resizeImage('50%'); } },
    { label: '25%', title: 'Largura 25%', action: function() { self.resizeImage('25%'); } },
    { label: 'Original', title: 'Tamanho Original', action: function() { self.setOriginalSize(); } },
    { label: '<i data-lucide="align-left"></i>', title: 'Flutuar à Esquerda', action: function() { self.setFloat('left'); } },
    { label: '<i data-lucide="align-right"></i>', title: 'Flutuar à Direita', action: function() { self.setFloat('right'); } },
    { label: '<i data-lucide="align-justify"></i>', title: 'Remover Flutuação', action: function() { self.removeFloat(); } },
    { label: '<i data-lucide="trash-2"></i>', title: 'Remover Imagem', action: function() { self.removeImage(); } }
  ];

  $.each(buttons, function(i, btnData) {
    var $btn = $('<button type="button"></button>')
      .html(btnData.label)
      .attr('title', btnData.title)
      .on('mousedown', function(e) { e.preventDefault(); }) // Evita perder o foco
      .on('click', btnData.action);
    self.$toolbar.append($btn);
  });

  this.editor.$container.append(this.$toolbar);
};

ImagePlugin.prototype.bindContentEvents = function () {
  var self = this;

  // Mostra a barra de ferramentas ao clicar na imagem
  this.editor.$content.on('click', 'img', function (e) {
    e.stopPropagation();
    self.showToolbar(this);
  });

  // Esconde a barra de ferramentas ao clicar fora
  $(document).on('click', function (e) {
    if (self.activeImage && !$(e.target).is(self.activeImage) && !self.$toolbar.is(e.target) && self.$toolbar.has(e.target).length === 0) {
      self.hideToolbar();
    }
  });
};

ImagePlugin.prototype.showToolbar = function (img) {
  if (this.activeImage) {
    $(this.activeImage).removeClass('active');
  }

  this.activeImage = img;
  $(this.activeImage).addClass('active');

  var $img = $(img);
  var imgPos = $img.position(); // Posição relativa ao editor

  this.$toolbar.css({
    top: imgPos.top - this.$toolbar.outerHeight() - 5,
    left: imgPos.left + ($img.width() / 2) - (this.$toolbar.outerWidth() / 2)
  }).show();

  // Garante que os ícones sejam renderizados
  if (window.lucide) {
    window.lucide.createIcons({ root: this.$toolbar[0] });
  }
};

ImagePlugin.prototype.hideToolbar = function () {
  if (this.activeImage) {
    $(this.activeImage).removeClass('active');
  }
  this.activeImage = null;
  this.$toolbar.hide();
};

// Ações da Barra de Ferramentas
ImagePlugin.prototype.resizeImage = function (width) {
  if (!this.activeImage) return;
  this.editor.history.save();
  $(this.activeImage).css({ 'width': width, 'height': 'auto' });
  this.editor.history.save();
  this.editor.trigger('change');
  this.showToolbar(this.activeImage); // Reposiciona a barra
};

ImagePlugin.prototype.setOriginalSize = function () {
  if (!this.activeImage) return;
  this.editor.history.save();
  $(this.activeImage).css({ 'width': '', 'height': '' });
  this.editor.history.save();
  this.editor.trigger('change');
  this.showToolbar(this.activeImage);
};

ImagePlugin.prototype.setFloat = function (direction) {
  if (!this.activeImage) return;
  this.editor.history.save();
  var margin = direction === 'left' ? '0 15px 15px 0' : '15px 0 15px 15px';
  $(this.activeImage).css({ 'float': direction, 'margin': margin });
  this.editor.history.save();
  this.editor.trigger('change');
  this.showToolbar(this.activeImage);
};

ImagePlugin.prototype.removeFloat = function () {
  if (!this.activeImage) return;
  this.editor.history.save();
  $(this.activeImage).css({ 'float': '', 'margin': '' });
  this.editor.history.save();
  this.editor.trigger('change');
  this.showToolbar(this.activeImage);
};

ImagePlugin.prototype.removeImage = function () {
  if (!this.activeImage) return;
  this.editor.history.save();
  var $img = $(this.activeImage);
  this.hideToolbar();
  $img.remove();
  this.editor.history.save();
  this.editor.trigger('change');
};

// Funções de inserção de imagem (arrastar e soltar / diálogo)
ImagePlugin.prototype.openFileDialog = function () {
  var self = this;
  var $input = $('<input type="file" accept="image/*" style="display:none">');

  $input.on('change', function () {
    var file = this.files[0];
    if (file) {
      self.insertImage(file);
    }
    $input.remove();
  });

  this.editor.$container.append($input);
  $input.click();
};

ImagePlugin.prototype.bindDragAndDrop = function () {
  var self = this;
  var $content = this.editor.$content;

  $content.on('dragover', function (e) { e.preventDefault(); e.stopPropagation(); $content.addClass('drag-over'); });
  $content.on('dragleave', function (e) { e.preventDefault(); e.stopPropagation(); $content.removeClass('drag-over'); });

  $content.on('drop', function (e) {
    e.preventDefault();
    e.stopPropagation();
    $content.removeClass('drag-over');

    var files = e.originalEvent.dataTransfer.files;
    if (files.length > 0 && files[0].type.match('image.*')) {
      self.insertImage(files[0]);
    }
  });
};

ImagePlugin.prototype.insertImage = function (file) {
  var self = this;
  var uploadFn = this.editor.options.uploadImage;

  if (uploadFn && typeof uploadFn === 'function') {
    uploadFn(file, function (url) {
      document.execCommand('insertImage', false, url);
      self.editor.trigger('change');
    });
  } else {
    var reader = new FileReader();
    reader.onload = function (e) {
      document.execCommand('insertImage', false, e.target.result);
      self.editor.trigger('change');
    };
    reader.readAsDataURL(file);
  }
};

window.ImagePlugin = ImagePlugin;