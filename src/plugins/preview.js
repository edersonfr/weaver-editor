function PreviewPlugin(editor) {
  this.editor = editor;
  this.active = false;
}

PreviewPlugin.prototype.init = function () {
  this.build();
  this.bind();
};

PreviewPlugin.prototype.build = function () {
  this.$preview = $('<iframe class="editor-preview-frame"/>').hide();

  this.editor.$container.append(this.$preview);
};

PreviewPlugin.prototype.bind = function () {
  var self = this;

  this.editor.registerCommand('preview', function () {
    self.toggle();
  });

  this.editor.registerCommand('desktop', function () {
    if (self.active) self.setViewport('desktop');
  });

  this.editor.registerCommand('tablet', function () {
    if (self.active) self.setViewport('tablet');
  });

  this.editor.registerCommand('mobile', function () {
    if (self.active) self.setViewport('mobile');
  });

  this.editor.registerCommand('closePreview', function () {
    if (self.active) self.disable();
  });
};

PreviewPlugin.prototype.toggle = function () {
  this.active ? this.disable() : this.enable();
};

PreviewPlugin.prototype.enable = function () {
  var html = this.editor.getContent();
  var doc = this.$preview[0].contentWindow.document;

  var cssLinks = this.buildCssLinks();
  var googleFonts = '<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Lato&family=Montserrat&family=Open+Sans&family=Oswald&family=Poppins&family=Roboto&display=swap">';

  doc.open();
  doc.write(
    '<!DOCTYPE html>' +
    '<html>' +
    '<head>' +
    googleFonts +
    cssLinks +
    '<style>body{padding:20px;font-family:Arial}</style>' +
    '</head>' +
    '<body>' +
    html +
    '</body>' +
    '</html>'
  );
  doc.close();

  this.editor.$content.hide();
  this.$preview.show();

  // Esconde todas as ferramentas normais e mostra apenas as de preview
  this.editor.$toolbar.find('.standard-btn').addClass('hidden');
  this.editor.$toolbar.find('.preview-only-btn').removeClass('hidden');

  this.setViewport('desktop');

  this.active = true;
};

PreviewPlugin.prototype.disable = function () {
  this.$preview.hide();
  this.editor.$content.show();

  // Devolve a barra de ferramentas ao normal
  this.editor.$toolbar.find('.standard-btn').removeClass('hidden');
  this.editor.$toolbar.find('.preview-only-btn').addClass('hidden');

  this.active = false;
};

PreviewPlugin.prototype.buildCssLinks = function () {
  var css = this.editor.options.previewCss || [];
  var links = '';

  for (var i = 0; i < css.length; i++) {
    links += '<link rel="stylesheet" href="' + css[i] + '">';
  }

  return links;
};

PreviewPlugin.prototype.setViewport = function (size) {
  var widthMap = {
    desktop: '100%',
    tablet: '768px',
    mobile: '375px'
  };

  this.$preview.css({
    width: widthMap[size] || '100%',
    margin: '0 auto',
    display: 'block'
  });

  // Atualiza visualmente qual botão está ativo (cinza com sombra)
  var $toolbar = this.editor.$toolbar;
  $toolbar.find('[data-name="desktop"], [data-name="tablet"], [data-name="mobile"]')
    .removeClass('bg-gray-200 shadow-inner active')
    .addClass('bg-white');
  
  $toolbar.find('[data-name="' + size + '"]')
    .removeClass('bg-white')
    .addClass('bg-gray-200 shadow-inner active');
};

window.PreviewPlugin = PreviewPlugin;