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
    this.commandRegistry.exec(name, value);
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
      if (this.plugins[i].constructor.name === name) {
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