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
    { label: '100%', title: 'Largura 100%', name: 'w100', action: function() { self.resizeImage('100%'); } },
    { label: '50%', title: 'Largura 50%', name: 'w50', action: function() { self.resizeImage('50%'); } },
    { label: '25%', title: 'Largura 25%', name: 'w25', action: function() { self.resizeImage('25%'); } },
    { label: 'Original', title: 'Tamanho Original', name: 'original', action: function() { self.setOriginalSize(); } },
    { label: '<i data-lucide="align-left"></i>', title: 'Flutuar à Esquerda', name: 'floatLeft', action: function() { self.setFloat('left'); } },
    { label: '<i data-lucide="align-center"></i>', title: 'Centralizar', name: 'center', action: function() { self.setFloat('center'); } },
    { label: '<i data-lucide="align-right"></i>', title: 'Flutuar à Direita', name: 'floatRight', action: function() { self.setFloat('right'); } },
    { label: '<i data-lucide="align-justify"></i>', title: 'Remover Flutuação', name: 'noFloat', action: function() { self.removeFloat(); } },
    { label: 'Alt', title: 'Texto alternativo', name: 'alt', action: function() { self.toggleAltEditor(); } },
    { label: '<i data-lucide="trash-2"></i>', title: 'Remover Imagem', name: 'remove', action: function() { self.removeImage(); } }
  ];

  // imageToolbar: lista de botões extras, ou { add: [...], remove: ['w25'] }
  var custom = this.editor.options.imageToolbar || {};
  if ($.isArray(custom)) custom = { add: custom };
  var removed = custom.remove || [];
  buttons = $.grep(buttons, function (b) { return removed.indexOf(b.name) === -1; });

  $.each(custom.add || [], function (i, def) {
    var normalized = ToolbarPlugin.normalizeButton(def.name || 'custom' + i, def);
    buttons.push({
      label: normalized.label,
      title: normalized.title,
      name: normalized.name,
      action: function () {
        if (self.activeImage) def.action(self.editor, self.activeImage);
      }
    });
  });

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
      var files = ImagePlugin.imageFiles(dt);
      if (!files.length && dt.files && dt.files.length) files = [dt.files[0]]; // insertImage avisa do formato
      for (var f = 0; f < files.length; f++) {
        self.insertImage(files[f]); // valida formato e tamanho
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
    if (html) self.uploadEmbeddedImages(html);
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

  this.processFile(file, function (url, extra) {
    // A URL pode vir do callback de upload do integrador: valida o protocolo.
    // data: só para formatos raster (SVG pode carregar script).
    var img = editor._buildImage(url, $.extend({ alt: '' }, extra));
    if (!img) {
      editor.notify('O endereço da imagem foi recusado por segurança.', { type: 'error' });
      return;
    }

    editor.$content.focus();
    if (self.savedRange) {
      editor.selection.setRange(self.savedRange);
    }

    editor.history.save();
    self.rangeFormatter.insertNode(document.importNode(img, true), false);
    editor.history.save();

    // Várias imagens (colar/soltar) entram uma depois da outra
    self.savedRange = editor.selection.isInsideEditor() ? editor.selection.getRange() : null;

    editor.trigger('change');
  });
};

/**
 * Valida o arquivo e devolve a URL final: a do uploadImage ou, sem ele,
 * um data: reduzido para imageMaxWidth.
 * @param {File} file
 * @param {function(string, Object)} done - recebe a URL e os atributos que o
 *   integrador passou em done(url, { alt, width }) (ou null)
 * @param {function(string)} [fail]
 */
ImagePlugin.prototype.processFile = function (file, done, fail) {
  var editor = this.editor;
  var options = editor.options;
  var uploadFn = options.uploadImage;

  function error(message) {
    editor.notify(message, { type: 'error' });
    if (fail) fail(message);
  }

  if (!file || ImagePlugin.ACCEPTED_TYPES.indexOf(file.type) === -1) {
    error('Formato de imagem não suportado. Use PNG, JPG, GIF, WebP ou AVIF.');
    return;
  }

  if (options.maxImageSize && file.size > options.maxImageSize) {
    error('A imagem tem ' + ImagePlugin.formatSize(file.size) + '. O máximo é ' + ImagePlugin.formatSize(options.maxImageSize) + '.');
    return;
  }

  if (uploadFn && typeof uploadFn === 'function') {
    editor.notify('Enviando imagem…', { timeout: 0 });
    var finished = false;
    uploadFn(file, function (url, extra) {
      if (finished) return;
      finished = true;
      // done(null, 'mensagem') no erro; done(url) ou done(url, { alt, width }) no sucesso
      if (!url) {
        error(typeof extra === 'string' ? extra : 'Não foi possível enviar a imagem.');
        return;
      }
      editor.notify('');
      done(url, $.isPlainObject(extra) ? extra : null);
    }, editor);
    return;
  }

  var reader = new FileReader();
  reader.onerror = function () {
    error('Não foi possível ler a imagem.');
  };
  reader.onload = function (e) {
    ImagePlugin.downscale(e.target.result, file.type, options.imageMaxWidth, function (url) { done(url, null); });
  };
  reader.readAsDataURL(file);
};

/**
 * Envia pelo uploadImage as imagens em data: de um HTML que acabou de ser
 * colado ou solto e troca o src delas pela URL devolvida.
 * Só age com uploadPastedImages: true e uploadImage configurado.
 * @param {string} html - o HTML inserido
 */
ImagePlugin.prototype.uploadEmbeddedImages = function (html) {
  var self = this;
  var editor = this.editor;
  if (!editor.options.uploadPastedImages || typeof editor.options.uploadImage !== 'function') return;

  var sources = [];
  var imgs = HtmlSanitizer.parseInert(html).querySelectorAll('img[src^="data:image/"]');
  for (var i = 0; i < imgs.length; i++) {
    var src = imgs[i].getAttribute('src');
    if (sources.indexOf(src) === -1) sources.push(src);
  }

  $.each(sources, function (n, src) {
    var file = ImagePlugin.dataUrlToFile(src, 'imagem-colada-' + (n + 1));
    if (!file) return;
    self.processFile(file, function (url, extra) {
      if (!editor.sanitizer.isSafeUrl(url, 'img', 'src')) return;
      var live = editor.$content.find('img').filter(function () { return this.getAttribute('src') === src; });
      if (!live.length) return;
      editor.history.save();
      live.each(function () {
        this.setAttribute('src', url);
        for (var name in extra || {}) {
          if (extra.hasOwnProperty(name) && name !== 'src' && extra[name] !== null && extra[name] !== undefined) this.setAttribute(name, extra[name]);
        }
      });
      editor.history.save();
      editor.trigger('change');
    });
  });
};

/** Converte data:image/...;base64 em File (null se não for possível). */
ImagePlugin.dataUrlToFile = function (dataUrl, name) {
  var match = /^data:(image\/[a-z0-9.+-]+);base64,(.*)$/i.exec(dataUrl);
  if (!match) return null;
  try {
    var binary = atob(match[2].replace(/\s/g, ''));
    var bytes = new Uint8Array(binary.length);
    for (var i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    var type = match[1].toLowerCase();
    var ext = type.split('/')[1].replace('jpeg', 'jpg').replace(/\+.*/, '');
    return new File([bytes], name + '.' + ext, { type: type });
  } catch (e) {
    return null;
  }
};

/**
 * Arquivos de imagem de uma área de transferência ou de um drop.
 * @param {DataTransfer} dt
 * @returns {File[]}
 */
ImagePlugin.imageFiles = function (dt) {
  var files = [];
  if (!dt) return files;
  var i;
  if (dt.files && dt.files.length) {
    for (i = 0; i < dt.files.length; i++) {
      if (/^image\//.test(dt.files[i].type)) files.push(dt.files[i]);
    }
  } else if (dt.items) {
    for (i = 0; i < dt.items.length; i++) {
      if (dt.items[i].kind === 'file' && /^image\//.test(dt.items[i].type)) {
        var f = dt.items[i].getAsFile();
        if (f) files.push(f);
      }
    }
  }
  return files;
};

/**
 * Indica se o HTML colado é só uma imagem (ex.: "copiar imagem" no
 * navegador). Word e Excel também mandam um PNG junto com o HTML, e nesse
 * caso o HTML é que vale.
 */
ImagePlugin.isOnlyImage = function (html) {
  if (!html) return true;
  var body = HtmlSanitizer.parseInert(html);
  return body.querySelectorAll('img').length <= 1 && !body.querySelector('table') && !$.trim(body.textContent);
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