function ImagePlugin(editor) {
  this.editor = editor;
  this.activeImage = null;
  this.$toolbar = null;
}

/** Formatos aceitos: só raster (SVG pode carregar script). */
ImagePlugin.ACCEPTED_TYPES = ['image/png', 'image/jpeg', 'image/gif', 'image/webp', 'image/avif'];

ImagePlugin.prototype.init = function () {
  var self = this;

  // Inicializa o RangeFormatter para operações robustas no DOM
  this.rangeFormatter = new RangeFormatter(this.editor);

  this.editor.registerCommand('image', function () {
    self.openFileDialog();
  });

  this.buildToolbar();
  this.buildResizeHandle();
  this.bindContentEvents();
  this.bindDragAndDrop();
};

ImagePlugin.prototype.buildToolbar = function () {
  var self = this;
  this.$toolbar = $('<div class="editor-image-toolbar absolute hidden bg-white border border-gray-200 p-1.5 rounded flex flex-row flex-nowrap w-max gap-1 z-50 shadow-lg" role="toolbar" aria-label="Ferramentas da imagem"></div>');

  var buttons = [
    { label: '100%', title: 'Largura 100%', action: function() { self.resizeImage('100%'); } },
    { label: '50%', title: 'Largura 50%', action: function() { self.resizeImage('50%'); } },
    { label: '25%', title: 'Largura 25%', action: function() { self.resizeImage('25%'); } },
    { label: 'Original', title: 'Tamanho Original', action: function() { self.setOriginalSize(); } },
    { label: '<i data-lucide="align-left"></i>', title: 'Flutuar à Esquerda', action: function() { self.setFloat('left'); } },
    { label: '<i data-lucide="align-center"></i>', title: 'Centralizar', action: function() { self.setFloat('center'); } },
    { label: '<i data-lucide="align-right"></i>', title: 'Flutuar à Direita', action: function() { self.setFloat('right'); } },
    { label: '<i data-lucide="align-justify"></i>', title: 'Remover Flutuação', action: function() { self.removeFloat(); } },
    { label: 'Alt', title: 'Texto alternativo', name: 'alt', action: function() { self.toggleAltEditor(); } },
    { label: '<i data-lucide="trash-2"></i>', title: 'Remover Imagem', action: function() { self.removeImage(); } }
  ];

  $.each(buttons, function(i, btnData) {
    var $btn = $('<button type="button" class="flex items-center justify-center min-w-[32px] h-8 px-2 border border-gray-300 bg-white rounded text-gray-700 hover:bg-gray-50 transition-colors focus:outline-none [&>svg]:w-4 [&>svg]:h-4 text-xs font-medium"></button>')
      .html(btnData.label)
      .attr('title', btnData.title)
      .attr('aria-label', btnData.title)
      .on('mousedown', function(e) { e.preventDefault(); }) // Evita perder o foco
      .on('click', btnData.action);
    if (btnData.name) $btn.attr('data-name', 'image-' + btnData.name);
    self.$toolbar.append($btn);
  });

  // Editor do texto alternativo (descrição para leitores de tela e SEO)
  this.$altBox = $('<div class="editor-image-alt"/>').hide();
  this.$altInput = $('<input type="text" placeholder="Descreva a imagem" aria-label="Texto alternativo da imagem">');
  var $altSave = $('<button type="button" class="flex items-center justify-center h-8 px-2 border border-gray-300 bg-white rounded text-gray-700 hover:bg-gray-50 text-xs font-medium">OK</button>');
  this.$altBox.append(this.$altInput, $altSave);
  this.$toolbar.append(this.$altBox);

  $altSave.on('click', function () { self.saveAlt(); });
  this.$altInput.on('keydown', function (e) {
    if (e.key === 'Enter') {
      e.preventDefault();
      self.saveAlt();
    } else if (e.key === 'Escape') {
      e.preventDefault();
      self.$altBox.hide();
    }
  });

  this.editor.$container.append(this.$toolbar);
};

ImagePlugin.prototype.toggleAltEditor = function () {
  if (!this.activeImage) return;
  if (this.$altBox.is(':visible')) {
    this.$altBox.hide();
    return;
  }
  this.$altInput.val(this.activeImage.getAttribute('alt') || '');
  this.$altBox.css('display', 'flex');
  this.positionToolbar();
  this.$altInput.focus();
};

ImagePlugin.prototype.saveAlt = function () {
  if (!this.activeImage) return;
  var alt = $.trim(this.$altInput.val());
  this.editor.history.save();
  this.activeImage.setAttribute('alt', alt);
  this.editor.history.save();
  this.editor.trigger('change');
  this.$altBox.hide();
  this.positionToolbar();
};

/**
 * Alça no canto da imagem para redimensionar arrastando (mouse, toque ou caneta).
 */
ImagePlugin.prototype.buildResizeHandle = function () {
  var self = this;
  this.$handle = $('<div class="editor-image-resize" title="Arraste para redimensionar" aria-hidden="true"/>').hide();
  this.editor.$container.append(this.$handle);

  var drag = null;

  this.$handle.on('pointerdown', function (e) {
    if (!self.activeImage) return;
    e.preventDefault();
    var oe = e.originalEvent;
    drag = {
      startX: oe.clientX,
      startWidth: self.activeImage.getBoundingClientRect().width,
      maxWidth: self.editor.$content[0].clientWidth
    };
    self.editor.history.save();
    if (this.setPointerCapture) this.setPointerCapture(oe.pointerId);
  });

  this.$handle.on('pointermove', function (e) {
    if (!drag || !self.activeImage) return;
    var width = Math.round(drag.startWidth + (e.originalEvent.clientX - drag.startX));
    width = Math.max(30, Math.min(width, drag.maxWidth));
    self.activeImage.style.width = width + 'px';
    self.activeImage.style.height = 'auto';
    self.positionToolbar();
  });

  this.$handle.on('pointerup pointercancel', function () {
    if (!drag) return;
    drag = null;
    self.editor.history.save();
    self.editor.trigger('change');
  });
};

ImagePlugin.prototype.bindContentEvents = function () {
  var self = this;

  // Mostra a barra de ferramentas ao clicar na imagem
  this.editor.$content.on('click' + this.editor.ns, 'img', function (e) {
    e.stopPropagation();
    self.showToolbar(this);
  });

  // Barra e alça não acompanham a rolagem; escondem ao rolar ou editar
  this.editor.$content.on('scroll' + this.editor.ns + ' input' + this.editor.ns, function () {
    if (self.activeImage) self.hideToolbar();
  });

  // Esconde a barra de ferramentas ao clicar fora
  $(document).on('click' + this.editor.ns, function (e) {
    if (self.activeImage && !$(e.target).is(self.activeImage) && !self.$toolbar.is(e.target) && self.$toolbar.has(e.target).length === 0 && !self.$handle.is(e.target)) {
      self.hideToolbar();
    }
  });
};

ImagePlugin.prototype.showToolbar = function (img) {
  if (this.activeImage && this.activeImage !== img) {
    $(this.activeImage).removeClass('weaver-selected');
    this.$altBox.hide();
  }

  this.activeImage = img;
  // Classe de estado: removida do HTML salvo por Editor.cleanOutput
  $(this.activeImage).addClass('weaver-selected');

  // Força o display flex (evita o display: block padrão do jQuery que quebra a linha)
  this.$toolbar.css('display', 'flex');
  this.positionToolbar();

  WysiwygEditor.renderIcons(this.$toolbar[0]);
};

ImagePlugin.prototype.positionToolbar = function () {
  var img = this.activeImage;
  if (!img || !img.parentNode) return;

  var containerRect = this.editor.$container[0].getBoundingClientRect();
  var imgRect = img.getBoundingClientRect();
  var top = imgRect.top - containerRect.top;
  var left = imgRect.left - containerRect.left;

  var topPos = top - this.$toolbar.outerHeight() - 5;
  if (topPos < 0) {
    topPos = top + imgRect.height + 5; // Joga pra baixo da imagem se vazar pelo topo
  }

  var leftPos = left + (imgRect.width / 2) - (this.$toolbar.outerWidth() / 2);
  if (leftPos < 0) leftPos = 5; // Impede vazar pela esquerda

  this.$toolbar.css({ top: topPos, left: leftPos });

  // Verifica se o painel vazou pela direita
  var overflow = this.$toolbar[0].getBoundingClientRect().right - containerRect.right;
  if (overflow > 0) {
    this.$toolbar.css('left', Math.max(5, leftPos - overflow - 5));
  }

  this.$handle.css({
    display: 'block',
    top: top + imgRect.height - 7,
    left: left + imgRect.width - 7
  });
};

ImagePlugin.prototype.hideToolbar = function () {
  if (this.activeImage) {
    $(this.activeImage).removeClass('weaver-selected');
    if (!this.activeImage.getAttribute('class')) this.activeImage.removeAttribute('class');
  }
  this.activeImage = null;
  this.$toolbar.hide();
  this.$handle.hide();
  this.$altBox.hide();
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

  var $input = $('<input type="file" style="display:none">').attr('accept', ImagePlugin.ACCEPTED_TYPES.join(','));

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
      if (files && files.length > 0) {
        self.insertImage(files[0]); // valida formato e tamanho
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

/**
 * Valida, envia (ou embute) e insere uma imagem.
 * - Formatos: PNG, JPG, GIF, WebP, AVIF. Tamanho: options.maxImageSize.
 * - Com options.uploadImage(file, done): chame done(url) no sucesso ou
 *   done(null, 'mensagem') no erro; a mensagem aparece no editor.
 * - Sem uploadImage: a imagem é embutida em base64, reduzida para no máximo
 *   options.imageMaxWidth px de largura (GIF fica como está, por ser animado).
 */
ImagePlugin.prototype.insertImage = function (file) {
  var self = this;
  var editor = this.editor;
  var options = editor.options;
  var uploadFn = options.uploadImage;

  if (!file || ImagePlugin.ACCEPTED_TYPES.indexOf(file.type) === -1) {
    editor.notify('Formato de imagem não suportado. Use PNG, JPG, GIF, WebP ou AVIF.', { type: 'error' });
    return;
  }

  if (options.maxImageSize && file.size > options.maxImageSize) {
    editor.notify('A imagem tem ' + ImagePlugin.formatSize(file.size) + '. O máximo é ' + ImagePlugin.formatSize(options.maxImageSize) + '.', { type: 'error' });
    return;
  }

  var doInsert = function (url) {
    // A URL pode vir do callback de upload do integrador: valida o protocolo.
    // data: só para formatos raster (SVG pode carregar script).
    if (!editor.sanitizer.isSafeUrl(url, 'img', 'src')) {
      editor.notify('O endereço da imagem foi recusado por segurança.', { type: 'error' });
      return;
    }

    editor.$content.focus();
    if (self.savedRange) {
      editor.selection.setRange(self.savedRange);
    }
    
    // Cria o elemento img
    var img = document.createElement('img');
    img.src = url;
    img.setAttribute('alt', '');
    
    editor.history.save();
    self.rangeFormatter.insertNode(img, false);
    editor.history.save();
    
    editor.trigger('change');
  };

  if (uploadFn && typeof uploadFn === 'function') {
    editor.notify('Enviando imagem…', { timeout: 0 });
    var finished = false;
    uploadFn(file, function (url, error) {
      if (finished) return;
      finished = true;
      if (error || !url) {
        editor.notify(typeof error === 'string' ? error : 'Não foi possível enviar a imagem.', { type: 'error' });
        return;
      }
      editor.notify('');
      doInsert(url);
    }, editor);
    return;
  }

  var reader = new FileReader();
  reader.onerror = function () {
    editor.notify('Não foi possível ler a imagem.', { type: 'error' });
  };
  reader.onload = function (e) {
    ImagePlugin.downscale(e.target.result, file.type, options.imageMaxWidth, doInsert);
  };
  reader.readAsDataURL(file);
};

ImagePlugin.formatSize = function (bytes) {
  if (bytes >= 1024 * 1024) return (bytes / (1024 * 1024)).toFixed(1).replace('.0', '') + ' MB';
  return Math.round(bytes / 1024) + ' KB';
};

/**
 * Reduz a imagem para maxWidth px (mantendo a proporção) antes de embutir.
 * Fotos de celular com 4000 px viravam vários MB de base64 no HTML salvo.
 */
ImagePlugin.downscale = function (dataUrl, type, maxWidth, done) {
  if (!maxWidth || type === 'image/gif') {
    done(dataUrl);
    return;
  }

  var image = new Image();
  image.onload = function () {
    if (image.naturalWidth <= maxWidth) {
      done(dataUrl);
      return;
    }
    var ratio = maxWidth / image.naturalWidth;
    var canvas = document.createElement('canvas');
    canvas.width = maxWidth;
    canvas.height = Math.round(image.naturalHeight * ratio);
    canvas.getContext('2d').drawImage(image, 0, 0, canvas.width, canvas.height);
    var outType = type === 'image/png' ? 'image/png' : 'image/jpeg';
    try {
      done(canvas.toDataURL(outType, 0.85));
    } catch (e) {
      done(dataUrl);
    }
  };
  image.onerror = function () { done(dataUrl); };
  image.src = dataUrl;
};

window.ImagePlugin = ImagePlugin;