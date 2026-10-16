function ImagePlugin(editor) {
  this.editor = editor;
  this.activeImage = null;
  this.$toolbar = null;
}

ImagePlugin.prototype.init = function () {
  var self = this;

  // Inicializa o RangeFormatter para operações robustas no DOM
  this.rangeFormatter = new RangeFormatter(this.editor);

  this.editor.registerCommand('image', function () {
    self.openFileDialog();
  });

  this.buildToolbar();
  this.bindContentEvents();
  this.bindDragAndDrop();
};

ImagePlugin.prototype.buildToolbar = function () {
  var self = this;
  this.$toolbar = $('<div class="editor-image-toolbar absolute hidden bg-white border border-gray-200 p-1.5 rounded flex flex-row flex-nowrap w-max gap-1 z-50 shadow-lg"></div>');

  var buttons = [
    { label: '100%', title: 'Largura 100%', action: function() { self.resizeImage('100%'); } },
    { label: '50%', title: 'Largura 50%', action: function() { self.resizeImage('50%'); } },
    { label: '25%', title: 'Largura 25%', action: function() { self.resizeImage('25%'); } },
    { label: 'Original', title: 'Tamanho Original', action: function() { self.setOriginalSize(); } },
    { label: '<i data-lucide="align-left"></i>', title: 'Flutuar à Esquerda', action: function() { self.setFloat('left'); } },
    { label: '<i data-lucide="align-center"></i>', title: 'Centralizar', action: function() { self.setFloat('center'); } },
    { label: '<i data-lucide="align-right"></i>', title: 'Flutuar à Direita', action: function() { self.setFloat('right'); } },
    { label: '<i data-lucide="align-justify"></i>', title: 'Remover Flutuação', action: function() { self.removeFloat(); } },
    { label: '<i data-lucide="trash-2"></i>', title: 'Remover Imagem', action: function() { self.removeImage(); } }
  ];

  $.each(buttons, function(i, btnData) {
    var $btn = $('<button type="button" class="flex items-center justify-center min-w-[32px] h-8 px-2 border border-gray-300 bg-white rounded text-gray-700 hover:bg-gray-50 transition-colors focus:outline-none [&>svg]:w-4 [&>svg]:h-4 text-xs font-medium"></button>')
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
  this.editor.$content.on('click' + this.editor.ns, 'img', function (e) {
    e.stopPropagation();
    self.showToolbar(this);
  });

  // Esconde a barra de ferramentas ao clicar fora
  $(document).on('click' + this.editor.ns, function (e) {
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

  // Força o display flex (evita o display: block padrão do jQuery que quebra a linha)
  this.$toolbar.css('display', 'flex'); 

  var topPos = imgPos.top - this.$toolbar.outerHeight() - 5;
  if (topPos < 0) {
    topPos = imgPos.top + $img.outerHeight() + 5; // Joga pra baixo da imagem se vazar pelo topo da tela
  }

  var leftPos = imgPos.left + ($img.width() / 2) - (this.$toolbar.outerWidth() / 2);
  if (leftPos < 0) leftPos = 5; // Impede vazar pela esquerda

  this.$toolbar.css({
    top: topPos,
    left: leftPos
  });

  // Verifica se o painel vazou pela direita
  if (this.$toolbar[0].getBoundingClientRect().right > this.editor.$container[0].getBoundingClientRect().right) {
    var diff = this.$toolbar[0].getBoundingClientRect().right - this.editor.$container[0].getBoundingClientRect().right;
    this.$toolbar.css('left', leftPos - diff - 5);
  }

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
  if (direction === 'center') {
    $(this.activeImage).css({ 'float': 'none', 'display': 'block', 'margin': '15px auto' });
  } else {
    var margin = direction === 'left' ? '0 15px 15px 0' : '15px 0 15px 15px';
    $(this.activeImage).css({ 'float': direction, 'display': 'inline-block', 'margin': margin });
  }
  this.editor.history.save();
  this.editor.trigger('change');
  this.showToolbar(this.activeImage);
};

ImagePlugin.prototype.removeFloat = function () {
  if (!this.activeImage) return;
  this.editor.history.save();
  $(this.activeImage).css({ 'float': '', 'display': '', 'margin': '' });
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
  
  // Salva a seleção exata do cursor antes da janela de arquivos roubar o foco
  if (this.editor.selection && this.editor.selection.isInsideEditor()) {
    this.savedRange = this.editor.selection.getRange();
  } else {
    this.savedRange = null;
  }

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
  var ns = this.editor.ns;
  var internalDrag = false;
  var dragDepth = 0;

  function hasFiles(e) {
    var dt = e.originalEvent && e.originalEvent.dataTransfer;
    if (!dt || !dt.types) return false;
    for (var i = 0; i < dt.types.length; i++) {
      if (dt.types[i] === 'Files') return true;
    }
    return false;
  }

  function placeCaretAt(oe) {
    var range = null;
    if (document.caretRangeFromPoint) {
      range = document.caretRangeFromPoint(oe.clientX, oe.clientY);
    } else if (document.caretPositionFromPoint) {
      var pos = document.caretPositionFromPoint(oe.clientX, oe.clientY);
      if (pos) {
        range = document.createRange();
        range.setStart(pos.offsetNode, pos.offset);
      }
    } else if (oe.rangeParent) { // Firefox antigo
      range = document.createRange();
      range.setStart(oe.rangeParent, oe.rangeOffset);
    }
    if (range) {
      range.collapse(true);
      self.editor.selection.setRange(range);
    }
  }

  // Arrastar texto DENTRO do editor continua nativo (o conteúdo já é seguro)
  $content.on('dragstart' + ns, function () { internalDrag = true; });
  $content.on('dragend' + ns, function () { internalDrag = false; });

  $content.on('dragenter' + ns, function (e) {
    if (!hasFiles(e)) return;
    dragDepth++;
    $content.addClass('drag-over');
  });

  $content.on('dragover' + ns, function (e) {
    if (!hasFiles(e)) return;
    e.preventDefault();
  });

  // dragenter/dragleave disparam ao passar por cada filho; o contador evita
  // que o destaque fique piscando
  $content.on('dragleave' + ns, function (e) {
    if (!hasFiles(e)) return;
    dragDepth = Math.max(0, dragDepth - 1);
    if (!dragDepth) $content.removeClass('drag-over');
  });

  $content.on('drop' + ns, function (e) {
    var oe = e.originalEvent;
    dragDepth = 0;
    $content.removeClass('drag-over');

    if (internalDrag) {
      internalDrag = false;
      setTimeout(function () {
        self.editor.history.save();
        self.editor.trigger('change');
      }, 0);
      return; // movimentação nativa de texto
    }

    var dt = oe.dataTransfer;
    if (!dt) return;

    e.preventDefault();
    e.stopPropagation();

    self.editor.$content.focus();
    placeCaretAt(oe);

    if (hasFiles(e)) {
      self.savedRange = self.editor.selection.isInsideEditor() ? self.editor.selection.getRange() : null;
      var files = dt.files;
      if (files && files.length > 0 && /^image\//.test(files[0].type)) {
        self.insertImage(files[0]);
      }
      return;
    }

    // Texto ou HTML vindo de fora (outra aba, outro app): passa pelo sanitizador
    var html = dt.getData('text/html');
    var text = dt.getData('text/plain');
    if (!html && !text) return;

    self.editor.history.save();
    self.rangeFormatter.insertHTML(html || self.editor.sanitizer.textToHtml(text));
    self.editor.history.save();
    self.editor.trigger('change');
  });
};

ImagePlugin.prototype.insertImage = function (file) {
  var self = this;
  var uploadFn = this.editor.options.uploadImage;

  var doInsert = function (url) {
    // A URL pode vir do callback de upload do integrador: valida o protocolo.
    // data: só para formatos raster (SVG pode carregar script).
    if (!self.editor.sanitizer.isSafeUrl(url, 'img', 'src')) {
      if (window.console && console.warn) console.warn('Weaver: URL de imagem recusada', url);
      return;
    }

    self.editor.$content.focus();
    if (self.savedRange) {
      var sel = window.getSelection();
      sel.removeAllRanges();
      sel.addRange(self.savedRange);
    }
    
    // Cria o elemento img
    var img = document.createElement('img');
    img.src = url;
    
    self.editor.history.save();
    self.rangeFormatter.insertNode(img, false);
    self.editor.history.save();
    
    self.editor.trigger('change');
  };

  if (uploadFn && typeof uploadFn === 'function') {
    uploadFn(file, function (url) {
      doInsert(url);
    });
  } else {
    var reader = new FileReader();
    reader.onload = function (e) {
      doInsert(e.target.result);
    };
    reader.readAsDataURL(file);
  }
};

window.ImagePlugin = ImagePlugin;