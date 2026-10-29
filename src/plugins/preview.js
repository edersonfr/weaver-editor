function PreviewPlugin(editor) {
  this.editor = editor;
  this.active = false;
}

PreviewPlugin.prototype.init = function () {
  this.build();
  this.bind();
};

PreviewPlugin.prototype.build = function () {
  this.$preview = this.createFrame();
  this.editor.$container.append(this.$preview);
};

PreviewPlugin.prototype.createFrame = function () {
  // sandbox sem allow-scripts e sem allow-same-origin: o conteúdo é exibido,
  // mas nada nele executa nem acessa a página do editor (cookies, DOM, parent).
  return $('<iframe class="editor-preview-frame" title="Pré-visualização"/>')
    .attr('sandbox', 'allow-popups allow-popups-to-escape-sandbox')
    .attr('referrerpolicy', 'no-referrer')
    .hide();
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
  // Sanitiza de novo: o preview nunca deve confiar no DOM editável
  var html = this.editor.sanitize(this.editor.getContent());

  var cssLinks = this.buildCssLinks();
  var googleFonts = '';
  if (this.editor.options.googleFonts) {
    // Fontes do menu + as usadas no conteúdo (ex.: 'Lobster' escolhida no menu)
    var fontUrls = [WysiwygEditor.GOOGLE_FONTS_URL];
    var used = this.editor.contentFonts();
    for (var i = 0; i < used.length; i++) {
      var url = WysiwygEditor.googleFontUrl(used[i]);
      if (url) fontUrls.push(url);
    }
    for (var u = 0; u < fontUrls.length; u++) {
      googleFonts += '<link rel="stylesheet" referrerpolicy="no-referrer" href="' + HtmlSanitizer.escapeHtml(fontUrls[u]) + '">';
    }
  }

  // Segunda camada além do sandbox: CSP que proíbe qualquer script
  var csp = '<meta http-equiv="Content-Security-Policy" content="script-src \'none\'; object-src \'none\'; base-uri \'none\'; form-action \'none\'">';

  // Um iframe novo a cada abertura. O iframe com sandbox roda isolado, em
  // outro processo; ao voltar de display:none com o mesmo srcdoc, o Chrome
  // não o pintava de novo e o preview reabria em branco.
  var $frame = this.createFrame();
  this.$preview.replaceWith($frame);
  this.$preview = $frame;

  // srcdoc em vez de document.write: com o sandbox sem allow-same-origin,
  // a página do editor não tem (nem precisa ter) acesso ao documento do iframe
  this.$preview.attr('srcdoc',
    '<!DOCTYPE html>' +
    '<html>' +
    '<head>' +
    '<meta charset="utf-8">' +
    csp +
    googleFonts +
    cssLinks +
    '<style>body{padding:20px;font-family:Arial}</style>' +
    '</head>' +
    '<body>' +
    html +
    '</body>' +
    '</html>'
  );

  this.editor.$content.hide();
  this.$preview.show();

  // Esconde todas as ferramentas normais e mostra apenas as de preview
  this.editor.$toolbar.find('.standard-btn').addClass('hidden');
  this.editor.$toolbar.find('.preview-only-btn').removeClass('hidden');

  // Oculta inteligentemente os grupos que ficaram vazios (para esconder as bordas divisórias)
  this.editor.$toolbar.find('.editor-toolbar-group').each(function() {
    var hasVisible = $(this).children().not('.hidden').length > 0;
    if (hasVisible) $(this).removeClass('hidden');
    else $(this).addClass('hidden');
  });

  this.setViewport('desktop');

  this.active = true;
};

PreviewPlugin.prototype.disable = function () {
  this.$preview.hide();
  this.editor.$content.show();

  // Devolve a barra de ferramentas ao normal
  this.editor.$toolbar.find('.standard-btn').removeClass('hidden');
  this.editor.$toolbar.find('.preview-only-btn').addClass('hidden');

  // Mostra novamente as bordas divisórias
  this.editor.$toolbar.find('.editor-toolbar-group').each(function() {
    var hasVisible = $(this).children().not('.hidden').length > 0;
    if (hasVisible) $(this).removeClass('hidden');
    else $(this).addClass('hidden');
  });

  this.active = false;
};

PreviewPlugin.prototype.buildCssLinks = function () {
  var css = this.editor.options.previewCss || [];
  var links = '';

  for (var i = 0; i < css.length; i++) {
    links += '<link rel="stylesheet" href="' + HtmlSanitizer.escapeHtml(css[i]) + '">';
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