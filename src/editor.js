(function ($) {

  function Editor(element, options) {
    this.$el = $(element);
    this.options = $.extend(true, {}, Editor.defaults, options);

    this.plugins = [];
    this.commands = {};
    this.state = {};

    this.init();
  }

  Editor.prototype.init = function () {
    this.injectStyles();
    this.buildLayout();

    this.initCore();

    this.initPlugins();
    this.bindEvents();
  };

  Editor.prototype.buildLayout = function () {
    this.$container = $('<div class="wysiwyg-editor border border-gray-300 rounded-md shadow-sm overflow-hidden flex flex-col bg-white font-sans text-gray-800 relative"/>');
    this.$toolbar = $('<div class="editor-toolbar flex flex-wrap gap-1 p-2 border-b border-gray-200 bg-gray-50 items-center" role="toolbar" aria-label="Ferramentas de formatação"/>');
    this.$content = $('<div contenteditable="true" class="editor-content p-4 min-h-[300px] outline-none focus:ring-2 focus:ring-inset focus:ring-blue-500 overflow-y-auto prose max-w-none w-full" role="textbox" aria-multiline="true" aria-label="Editor de conteúdo"/>').attr('data-placeholder', 'Digite aqui...');

    this.$container.append(this.$toolbar, this.$content);
    this.$el.append(this.$container);
  };

  // =========================
  // CORE INIT
  // =========================
  Editor.prototype.initCore = function () {
    this.commandRegistry = new CommandRegistry(this);
    this.selection = new SelectionManager(this);
    this.history = new HistoryManager(this);

    this.history.init();
  };

  // =========================
  // PLUGINS
  // =========================
  Editor.prototype.initPlugins = function () {
    var plugins = this.options.plugins;

    for (var i = 0; i < plugins.length; i++) {
      var plugin = new plugins[i](this);
      this.plugins.push(plugin);

      if (plugin.init) {
        plugin.init();
      }
    }
  };

  Editor.prototype.registerCommand = function (name, fn) {
    this.commandRegistry.register(name, fn);
  };

  Editor.prototype.exec = function (name, value) {
    if (this.history) {
      this.history.save();
    }

    this.commandRegistry.exec(name, this, value); 

    if (this.history) {
      this.history.save();
    }
  };

  Editor.prototype.bindEvents = function () {
    var self = this;

    this.$content.on('input', function () {
      self.trigger('change');
    });

    this.$content.on('keyup mouseup', function () {
      self.updateToolbar();
    });
  };

  Editor.prototype.trigger = function (event) {
    this.$el.trigger(event, [this.getContent()]);
  };

  Editor.prototype.getContent = function () {
    var html = this.$content.html();

    var sanitizer = this.getPlugin('SanitizerPlugin');
    if (sanitizer) {
      return sanitizer.clean(html);
    }

    return html;
  };

  Editor.prototype.getPlugin = function (name) {
    for (var i = 0; i < this.plugins.length; i++) {
      // Evita falhas caso o código seja minificado, buscando a propriedade `name`
      if (this.plugins[i].name === name || this.plugins[i].constructor.name === name) {
        return this.plugins[i];
      }
    }
    return null;
  };

  Editor.prototype.setContent = function (html) {
    // Usa innerHTML nativo no lugar de jQuery .html() para impedir que os scripts sejam executados no modo edição
    this.$content[0].innerHTML = html;
  };

  Editor.prototype.updateToolbar = function () {
    for (var i = 0; i < this.plugins.length; i++) {
      if (this.plugins[i].updateState) {
        this.plugins[i].updateState();
      }
    }
  };

  // =========================
  // STYLES
  // =========================

  Editor.prototype.injectStyles = function () {
    if (document.getElementById('wysiwyg-editor-styles')) return;

    // Injeta a biblioteca do Lucide para os ícones da barra de ferramentas
    if (!document.getElementById('lucide-script')) {
      var lucideScript = document.createElement('script');
      lucideScript.id = 'lucide-script';
      lucideScript.src = 'https://unpkg.com/lucide@latest';
      lucideScript.onload = function () {
        if (window.lucide) window.lucide.createIcons();
      };
      document.head.appendChild(lucideScript);
    }

    // Injeta a chamada do Google Fonts no cabeçalho da página
    var fontLink = document.createElement('link');
    fontLink.rel = 'stylesheet';
    fontLink.href = 'https://fonts.googleapis.com/css2?family=Lato&family=Montserrat&family=Open+Sans&family=Oswald&family=Poppins&family=Roboto&display=swap';
    document.head.appendChild(fontLink);

    // Convertido para concatenação de strings para garantir a compatibilidade com o ES5
    var css = 
      '.editor-fullscreen { position: fixed !important; top: 0; left: 0; width: 100vw !important; height: 100vh !important; z-index: 99999; display: flex; flex-direction: column; border: none !important; border-radius: 0 !important; }\n' +
      '.editor-fullscreen .editor-content { flex: 1; overflow-y: auto; }\n' +
      '.editor-show-blocks p, .editor-show-blocks div, .editor-show-blocks ul, .editor-show-blocks ol, .editor-show-blocks blockquote, .editor-show-blocks table {\n' +
      '  border: 1px dashed #adb5bd !important; padding: 2px;\n' +
      '}\n' +
      '.editor-content:empty:before {\n' +
      '  content: attr(data-placeholder);\n' +
      '  color:#999;\n' +
      '}\n' +
      '.editor-preview-frame {\n' +
      '  width:100%;\n' +
      '  height:400px;\n' +
      '  border:1px solid #ddd;\n' +
      '  background:#fff;\n' +
      '  transition: width 0.3s ease; \n' +
      '}\n' +
      '.editor-content.drag-over {\n' +
      '  background: #f0f8ff; \n' +
      '  border: 1px dashed #007bff; \n' +
      '}\n' +
      '.img-resize-wrapper {\n' +
      '  display: inline-block;\n' +
      '  position: relative;\n' +
      '  border: 1px solid #007bff;\n' +
      '}\n' +
      '.img-resize-wrapper img {\n' +
      '  display: block;\n' +
      '  max-width: 100%;\n' +
      '}\n' +
      '.img-resize-handle {\n' +
      '  width: 10px;\n' +
      '  height: 10px;\n' +
      '  background: #007bff;\n' +
      '  position: absolute;\n' +
      '  right: -5px;\n' +
      '  bottom: -5px;\n' +
      '  cursor: se-resize;\n' +
      '}\n' +
      '.editor-content img.active {\n' +
      '  outline: 2px solid #007bff;\n' +
      '  outline-offset: 2px;\n' +
      '}\n' +
      '.editor-codeview-wrapper {\n' +
      '  display: none;\n' +
      '  width: 100%;\n' +
      '  height: 400px;\n' +
      '  background: #363636;\n' +
      '  position: relative;\n' +
      '  font-family: Menlo, Monaco, Consolas, "Courier New", monospace;\n' +
      '  font-size: 14px;\n' +
      '  line-height: 1.5;\n' +
      '  box-sizing: border-box;\n' +
      '  overflow: hidden;\n' +
      '}\n' +
      '.editor-codeview-lines {\n' +
      '  position: absolute;\n' +
      '  top: 0; left: 0; bottom: 0;\n' +
      '  width: 50px;\n' +
      '  padding: 15px 5px 15px 0;\n' +
      '  text-align: right;\n' +
      '  color: #888;\n' +
      '  background: #2c2c2c;\n' +
      '  border-right: 1px solid #555;\n' +
      '  box-sizing: border-box;\n' +
      '  overflow: hidden;\n' +
      '  user-select: none;\n' +
      '  white-space: pre;\n' +
      '}\n' +
      '.editor-codeview-textarea, .editor-codeview-highlight {\n' +
      '  position: absolute;\n' +
      '  top: 0; left: 50px; right: 0; bottom: 0;\n' +
      '  width: calc(100% - 50px);\n' +
      '  height: 100%;\n' +
      '  padding: 15px;\n' +
      '  margin: 0;\n' +
      '  border: none;\n' +
      '  outline: none;\n' +
      '  font-family: inherit;\n' +
      '  font-size: inherit;\n' +
      '  line-height: inherit;\n' +
      '  white-space: pre;\n' +
      '  box-sizing: border-box;\n' +
      '}\n' +
      '.editor-codeview-textarea {\n' +
      '  color: transparent !important;\n' +
      '  background: transparent !important;\n' +
      '  caret-color: #fff;\n' +
      '  resize: none;\n' +
      '  z-index: 2;\n' +
      '  overflow: auto;\n' +
      '}\n' +
      '.editor-codeview-highlight {\n' +
      '  color: #e0e0e0;\n' +
      '  z-index: 1;\n' +
      '  pointer-events: none;\n' +
      '  overflow: hidden;\n' +
      '}\n' +
      '.editor-codeview-highlight .html-tag {\n' +
      '  color: #f9eb26;\n' +
      '}\n';

    var style = document.createElement('style');
    style.id = 'wysiwyg-editor-styles';
    style.innerHTML = css;

    document.head.appendChild(style);
  };

  // =========================
  // DEFAULTS
  // =========================
  Editor.defaults = {
    plugins: []
  };

  // =========================
  // JQUERY PLUGIN
  // =========================
  $.fn.wysiwygEditor = function (options) {
    return this.each(function () {
      var editor = new Editor(this, options);
      $(this).data('wysiwygEditor', editor);
    });
  };

  window.WysiwygEditor = Editor;

})(jQuery);