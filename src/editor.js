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
    this.$container = $('<div class="wysiwyg-editor"/>');
    this.$toolbar = $('<div class="editor-toolbar"/>');
    this.$content = $('<div contenteditable="true" class="editor-content"/>').attr('data-placeholder', 'Digite aqui...');

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
    this.$content.html(html);
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
      '.wysiwyg-editor { border: 1px solid #a9a9a9; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif; border-radius: 4px; overflow: hidden; position: relative; }\n' +
      '.editor-toolbar {\n' +
      '  border-bottom: 1px solid #e5e5e5;\n' +
      '  padding: 8px 8px 4px 8px;\n' +
      '  background: #f8f9fa;\n' +
      '}\n' +
      '.editor-toolbar button {\n' +
      '  margin-right: 4px;\n' +
      '  margin-bottom: 4px;\n' +
      '  cursor: pointer;\n' +
      '  background: #fff;\n' +
      '  border: 1px solid #dae0e5;\n' +
      '  border-radius: 3px;\n' +
      '  padding: 0 8px;\n' +
      '  min-width: 32px;\n' +
      '  height: 32px;\n' +
      '  box-sizing: border-box;\n' +
      '  vertical-align: top;\n' +
      '  font-size: 14px;\n' +
      '  color: #333;\n' +
      '  transition: all 0.2s;\n' +
      '}\n' +
      '.editor-toolbar svg {\n' +
      '  width: 16px;\n' +
      '  height: 16px;\n' +
      '  vertical-align: middle;\n' +
      '}\n' +
      '.editor-toolbar button:hover:not(:disabled) {\n' +
      '  background: #e2e6ea;\n' +
      '  border-color: #dae0e5;\n' +
      '}\n' +
      '.editor-toolbar button.active {\n' +
      '  background: #dae0e5;\n' +
      '  box-shadow: inset 0 3px 5px rgba(0,0,0,.125);\n' +
      '}\n' +
      '.editor-toolbar button:disabled {\n' +
      '  opacity: 0.65;\n' +
      '  cursor: not-allowed;\n' +
      '}\n' +
      '.editor-toolbar select {\n' +
      '  margin-right: 4px; margin-bottom: 4px; background: #fff;\n' +
      '  border: 1px solid #dae0e5; border-radius: 3px; padding: 4px; font-size: 14px; color: #333;\n' +
      '  vertical-align: top; height: 32px; cursor: pointer;\n' +
      '}\n' +
      '.editor-toolbar input[type="color"] {\n' +
      '  margin-right: 4px; margin-bottom: 4px; border: 1px solid #dae0e5; border-radius: 3px;\n' +
      '  padding: 0; width: 32px; height: 32px; cursor: pointer; vertical-align: top;\n' +
      '}\n' +
      '.editor-fullscreen { position: fixed !important; top: 0; left: 0; width: 100vw !important; height: 100vh !important; z-index: 99999; display: flex; flex-direction: column; border: none !important; border-radius: 0 !important; }\n' +
      '.editor-fullscreen .editor-content { flex: 1; overflow-y: auto; }\n' +
      '.editor-show-blocks p, .editor-show-blocks div, .editor-show-blocks ul, .editor-show-blocks ol, .editor-show-blocks blockquote, .editor-show-blocks table {\n' +
      '  border: 1px dashed #adb5bd !important; padding: 2px;\n' +
      '}\n' +
      '.editor-content {\n' +
      '  min-height: 300px;\n' +
      '  padding: 15px;\n' +
      '  outline:none;\n' +
      '  background: #fff;\n' +
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
      '.editor-image-toolbar {\n' +
      '  position: absolute;\n' +
      '  display: none;\n' +
      '  background: #333;\n' +
      '  color: #fff;\n' +
      '  padding: 5px;\n' +
      '  border-radius: 4px;\n' +
      '  z-index: 101;\n' +
      '  box-shadow: 0 2px 8px rgba(0,0,0,0.3);\n' +
      '}\n' +
      '.editor-image-toolbar button {\n' +
      '  background: transparent;\n' +
      '  border: 1px solid #555;\n' +
      '  color: #fff;\n' +
      '  padding: 4px 8px;\n' +
      '  margin: 2px;\n' +
      '  height: auto;\n' +
      '  min-width: auto;\n' +
      '}\n' +
      '.editor-image-toolbar button:hover {\n' +
      '  background: #555;\n' +
      '}\n' +
      '.editor-codeview {\n' +
      '  width: 100%;\n' +
      '  min-height: 200px;\n' +
      '  padding: 15px;\n' +
      '  border: none;\n' +
      '  outline: none;\n' +
      '  resize: vertical;\n' +
      '  font-family: Menlo, Monaco, Consolas, "Courier New", monospace;\n' +
      '  background: #f8f9fa;\n' +
      '  color: #333;\n' +
      '  box-sizing: border-box;\n' +
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