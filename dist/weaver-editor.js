function CommandRegistry(editor) {
  this.editor = editor;
  this.commands = {};
}

CommandRegistry.prototype.register = function (name, fn) {
  this.commands[name] = fn;
};

CommandRegistry.prototype.exec = function (name, editor, value) {
  if (this.commands[name]) {
    this.commands[name](editor, value);
  }
};
function Plugin(editor) {
  this.editor = editor;
}

Plugin.prototype.init = function () {};
function SelectionManager(editor) {
  this.editor = editor;
}

SelectionManager.prototype.getSelection = function () {
  return window.getSelection();
};

SelectionManager.prototype.getRange = function () {
  var sel = this.getSelection();
  if (sel.rangeCount === 0) return null;
  return sel.getRangeAt(0);
};

SelectionManager.prototype.wrap = function (tag) {
  var range = this.getRange();
  if (!range || range.collapsed) return;

  var wrapper = document.createElement(tag);
  wrapper.appendChild(range.extractContents());
  range.insertNode(wrapper);

  this.restoreSelection(wrapper);
};

SelectionManager.prototype.isWrapped = function (tag) {
  var range = this.getRange();
  if (!range) return false;

  var node = range.commonAncestorContainer;

  while (node && node !== this.editor.$content[0]) {
    if (node.nodeType === 1 && node.tagName.toLowerCase() === tag) {
      return true;
    }
    node = node.parentNode;
  }

  return false;
};

SelectionManager.prototype.unwrap = function (tag) {
  var range = this.getRange();
  if (!range) return;

  var node = range.commonAncestorContainer;

  while (node && node !== this.editor.$content[0]) {
    if (node.nodeType === 1 && node.tagName.toLowerCase() === tag) {

      var parent = node.parentNode;

      // salva referência do conteúdo
      var firstChild = node.firstChild;
      var lastChild = node.lastChild;

      // move filhos pra fora
      while (node.firstChild) {
        parent.insertBefore(node.firstChild, node);
      }

      parent.removeChild(node);

      // restaura seleção
      var newRange = document.createRange();

      if (firstChild && lastChild) {
        newRange.setStartBefore(firstChild);
        newRange.setEndAfter(lastChild);
      }

      var sel = window.getSelection();
      sel.removeAllRanges();
      sel.addRange(newRange);

      return;
    }

    node = node.parentNode;
  }
};

SelectionManager.prototype.restoreSelection = function (node) {
  var range = document.createRange();
  range.selectNodeContents(node);

  var sel = window.getSelection();
  sel.removeAllRanges();
  sel.addRange(range);
};

SelectionManager.prototype.isInsideEditor = function () {
  var sel = this.getSelection();
  if (!sel.anchorNode) return false;

  return this.editor.$content[0].contains(sel.anchorNode);
};

SelectionManager.prototype.toggle = function (tag) {
  if (this.isWrapped(tag)) {
    this.unwrap(tag);
  } else {
    this.wrap(tag);
  }
};

SelectionManager.prototype.getActiveFormats = function () {
  var formats = {};
  var node = this.getRange() ? this.getRange().commonAncestorContainer : null;

  while (node && node !== this.editor.$content[0]) {
    if (node.nodeType === 1) {
      var tag = node.tagName.toLowerCase();

      if (tag === 'b' || tag === 'strong') formats.bold = true;
      if (tag === 'i' || tag === 'em') formats.italic = true;
      if (tag === 'a') formats.link = true;
    }
    node = node.parentNode;
  }

  return formats;
};

window.SelectionManager = SelectionManager;
function HistoryManager(editor) {
  this.editor = editor;

  this.undoStack = [];
  this.redoStack = [];

  this.maxStack = 50;
}

HistoryManager.prototype.init = function () {
  this.bind();
  this.save(); // estado inicial
};

HistoryManager.prototype.bind = function () {
  var self = this;
  var timeout;

  this.editor.$content.on('input', function () {
    clearTimeout(timeout);

    timeout = setTimeout(function () {
      self.save();
    }, 300);
  });
};

HistoryManager.prototype.save = function () {
  var html = this.editor.$content.html();

  if (this.undoStack.length && this.undoStack[this.undoStack.length - 1] === html) {
    return;
  }

  this.undoStack.push(html);

  if (this.undoStack.length > this.maxStack) {
    this.undoStack.shift();
  }

  this.redoStack = [];
};

HistoryManager.prototype.undo = function () {
  if (this.undoStack.length < 2) return;

  var current = this.undoStack.pop();
  this.redoStack.push(current);

  var previous = this.undoStack[this.undoStack.length - 1];

  this.restore(previous);
};

HistoryManager.prototype.redo = function () {
  if (!this.redoStack.length) return;

  var next = this.redoStack.pop();
  this.undoStack.push(next);

  this.restore(next);
};

HistoryManager.prototype.restore = function (html) {
  this.editor.$content.html(html);
};

window.HistoryManager = HistoryManager;
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
    this.$container = $('<div class="wysiwyg-editor border border-gray-300 rounded-md shadow-sm flex flex-col bg-white font-sans text-gray-800 relative"/>');
    this.$toolbar = $('<div class="editor-toolbar flex flex-wrap gap-1 p-2 border-b border-gray-200 rounded-t-md bg-gray-50 items-center z-10" role="toolbar" aria-label="Ferramentas de formatação"/>');
    
    // Configurações herdadas na inicialização do plugin
    var minHeight = this.options.height ? this.options.height + 'px' : '300px';
    var placeholder = this.options.placeholder || this.$el.attr('placeholder') || 'Digite aqui...';

    this.$content = $('<div contenteditable="true" class="editor-content p-4 outline-none focus:ring-2 focus:ring-inset focus:ring-blue-500 overflow-y-auto prose max-w-none w-full rounded-b-md" role="textbox" aria-multiline="true" aria-label="Editor de conteúdo"/>')
      .css('min-height', minHeight)
      .attr('data-placeholder', placeholder);

    this.$container.append(this.$toolbar, this.$content);
    
    this.isTextarea = this.$el.is('textarea');

    if (this.isTextarea) {
      // Oculta o textarea nativo e injeta a interface do editor na frente dele
      this.$el.hide();
      this.$container.insertAfter(this.$el);
      
      // Carrega o valor inicial que já estava no HTML do textarea
      var initialContent = this.$el.val();
      if (initialContent) {
        this.$content[0].innerHTML = initialContent;
      }
      
      // Garante a sincronização absoluta no momento do envio do formulário
      var self = this;
      this.$el.closest('form').on('submit', function() {
        self.$el.val(self.getContent());
      });
    } else {
      this.$el.append(this.$container);
    }
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

    // Se nenhum plugin for passado na configuração, carrega os nativos dinamicamente
    if (!plugins || plugins.length === 0) {
      // Plugins essenciais que sempre devem rodar silenciosamente (núcleo do editor)
      var corePlugins = [
        window.ToolbarPlugin,
        window.BasicCommandsPlugin,
        window.SanitizerPlugin,
        window.NormalizerPlugin,
        window.HistoryPlugin
      ];

      // Mapeamento: "Se a toolbar tiver este botão, importe esta extensão"
      var pluginMap = {
        'link': window.LinkPlugin,
        'table': window.TablePlugin,
        'image': window.ImagePlugin,
        'picture': window.ImagePlugin, // Suporte ao apelido do summernote
        'video': window.VideoPlugin,
        'codeview': window.CodeViewPlugin,
        'preview': window.PreviewPlugin,
        'fullscreen': window.FullscreenPlugin
      };

      var activeOptionalPlugins = [];
      var toolbarConfig = this.options.toolbar || [];

      // Verifica a configuração da Toolbar e "acorda" apenas os plugins necessários
      for (var t = 0; t < toolbarConfig.length; t++) {
        var groupButtons = toolbarConfig[t][1] || [];
        for (var b = 0; b < groupButtons.length; b++) {
          var btnName = groupButtons[b];
          var PluginClass = pluginMap[btnName];
          
          if (PluginClass && activeOptionalPlugins.indexOf(PluginClass) === -1) {
            activeOptionalPlugins.push(PluginClass);
          }
        }
      }

      plugins = corePlugins.concat(activeOptionalPlugins).filter(Boolean);
    }

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
    var content = this.getContent();
    
    // Se estamos mascarando um textarea, sincronizamos os dados de volta para ele para permitir submissões de formulário perfeitas
    if (this.isTextarea && event === 'change') {
      this.$el.val(content); 
    }
    
    this.$el.trigger(event, [content]);
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
    plugins: [],
    toolbar: [
      ['history', ['undo', 'redo']],
      ['style', ['formatBlock', 'fontName', 'fontSize']],
      ['font', ['bold', 'italic', 'underline', 'strikethrough', 'removeFormat']],
      ['color', ['foreColor', 'backColor']],
      ['para', ['ul', 'ol', 'paragraphGroup']],
      ['insert', ['link', 'table', 'image', 'video', 'hr']],
      ['view', ['preview', 'fullscreen', 'showBlocks', 'codeview']]
    ],
    placeholder: '',
    height: null
  };

  // =========================
  // JQUERY PLUGIN
  // =========================
  $.fn.weaver = function (options) {
    return this.each(function () {
      var editor = new Editor(this, options);
      $(this).data('weaver', editor);
    });
  };

  window.WysiwygEditor = Editor;

})(jQuery);
window.ToolbarPlugin = ToolbarPlugin;

function ToolbarPlugin(editor) {
  this.editor = editor;
  this.buttons = {};
}

ToolbarPlugin.prototype.init = function () {
  this.render();
};

ToolbarPlugin.prototype.render = function () {
  var editor = this.editor;

  var defaultButtonLibrary = {
    undo: { name: 'undo', label: '<i data-lucide="undo"></i>', title: 'Desfazer' },
    redo: { name: 'redo', label: '<i data-lucide="redo"></i>', title: 'Refazer' },
    removeFormat: { name: 'removeFormat', label: '<i data-lucide="eraser"></i>', title: 'Remover Formatação' },
    fontName: { name: 'fontName', type: 'dropdown', title: 'Fonte', text: 'Fonte', options: [
      { label: '<span style="font-family: Arial, sans-serif; font-size:14px;">Arial</span>', value: 'Arial' },
      { label: '<span style="font-family: \'Courier New\', Courier, monospace; font-size:14px;">Courier New</span>', value: 'Courier New' },
      { label: '<span style="font-family: Georgia, serif; font-size:14px;">Georgia</span>', value: 'Georgia' },
      { label: '<span style="font-family: Tahoma, sans-serif; font-size:14px;">Tahoma</span>', value: 'Tahoma' },
      { label: '<span style="font-family: \'Times New Roman\', Times, serif; font-size:14px;">Times New Roman</span>', value: 'Times New Roman' },
      { label: '<span style="font-family: Verdana, sans-serif; font-size:14px;">Verdana</span>', value: 'Verdana' },
      { label: '<span style="font-family: Roboto, sans-serif; font-size:14px;">Roboto</span>', value: 'Roboto' },
      { label: '<span style="font-family: \'Open Sans\', sans-serif; font-size:14px;">Open Sans</span>', value: 'Open Sans' },
      { label: '<span style="font-family: Lato, sans-serif; font-size:14px;">Lato</span>', value: 'Lato' },
      { label: '<span style="font-family: Montserrat, sans-serif; font-size:14px;">Montserrat</span>', value: 'Montserrat' },
      { label: '<span style="font-family: Poppins, sans-serif; font-size:14px;">Poppins</span>', value: 'Poppins' },
      { label: '<span style="font-family: Oswald, sans-serif; font-size:14px;">Oswald</span>', value: 'Oswald' }
    ]},
    fontSize: { name: 'fontSize', type: 'dropdown', title: 'Tamanho', text: 'Tamanho', options: [
      { label: '8px', value: '8' },
      { label: '10px', value: '10' },
      { label: '12px', value: '12' },
      { label: '14px', value: '14' },
      { label: 'Padrão (16px)', value: '16' },
      { label: '18px', value: '18' },
      { label: '24px', value: '24' },
      { label: '36px', value: '36' },
      { label: '48px', value: '48' },
      { label: '72px', value: '72' }
    ]},
    formatBlock: { name: 'formatBlock', type: 'dropdown', title: 'Formatos', text: 'Formatos', options: [
      { label: '<p style="margin:0; font-size:14px;">Parágrafo</p>', value: 'P' },
      { label: '<h1 style="margin:0; font-size:24px; font-weight:bold;">Título 1</h1>', value: 'H1' },
      { label: '<h2 style="margin:0; font-size:20px; font-weight:bold;">Título 2</h2>', value: 'H2' },
      { label: '<h3 style="margin:0; font-size:18px; font-weight:bold;">Título 3</h3>', value: 'H3' },
      { label: '<h4 style="margin:0; font-size:16px; font-weight:bold;">Título 4</h4>', value: 'H4' },
      { label: '<h5 style="margin:0; font-size:14px; font-weight:bold;">Título 5</h5>', value: 'H5' },
      { label: '<h6 style="margin:0; font-size:12px; font-weight:bold;">Título 6</h6>', value: 'H6' },
      { label: '<blockquote style="margin:0; border-left:3px solid #ccc; padding-left:8px; font-style:italic; color:#666; font-size:14px;">Citação</blockquote>', value: 'BLOCKQUOTE' },
      { label: '<pre style="margin:0; background:#1f2937; color:#f3f4f6; padding:2px 8px; border-radius:4px; font-size:12px; font-family:monospace; line-height:1.2;">Bloco de Código</pre>', value: 'PRE' }
    ]},
    bold: { name: 'bold', label: '<i data-lucide="bold"></i>', title: 'Negrito' },
    italic: { name: 'italic', label: '<i data-lucide="italic"></i>', title: 'Itálico' },
    underline: { name: 'underline', label: '<i data-lucide="underline"></i>', title: 'Sublinhado' },
    strikethrough: { name: 'strikethrough', label: '<i data-lucide="strikethrough"></i>', title: 'Tachado' },
    subscript: { name: 'subscript', label: '<i data-lucide="subscript"></i>', title: 'Subscrito' },
    superscript: { name: 'superscript', label: '<i data-lucide="superscript"></i>', title: 'Sobrescrito' },
    foreColor: { name: 'foreColor', type: 'color', defaultColor: '#000000', label: '<i data-lucide="baseline"></i>', title: 'Cor da Fonte' },
    backColor: { name: 'backColor', type: 'color', defaultColor: '#ffff00', label: '<i data-lucide="highlighter"></i>', title: 'Cor de Destaque' },
    hr: { name: 'hr', label: '<i data-lucide="minus"></i>', title: 'Linha Horizontal' },
    ul: { name: 'ul', label: '<i data-lucide="list"></i>', title: 'Lista com Marcadores' },
    ol: { name: 'ol', label: '<i data-lucide="list-ordered"></i>', title: 'Lista Numerada' },
    paragraphGroup: { name: 'paragraphGroup', type: 'group', label: '<i data-lucide="align-left"></i>', title: 'Parágrafo', buttons: [
      [
        { name: 'alignLeft', label: '<i data-lucide="align-left"></i>', title: 'Alinhar à Esquerda' },
        { name: 'alignCenter', label: '<i data-lucide="align-center"></i>', title: 'Centralizar' },
        { name: 'alignRight', label: '<i data-lucide="align-right"></i>', title: 'Alinhar à Direita' },
        { name: 'justifyFull', label: '<i data-lucide="align-justify"></i>', title: 'Justificado' }
      ],
      [
        { name: 'outdent', label: '<i data-lucide="outdent"></i>', title: 'Diminuir Margem' },
        { name: 'indent', label: '<i data-lucide="indent"></i>', title: 'Aumentar Margem' }
      ]
    ]},
    link: { name: 'link', label: '<i data-lucide="link"></i>', title: 'Inserir Link' },
    table: { name: 'table', label: '<i data-lucide="table"></i>', title: 'Inserir Tabela' },
    image: { name: 'image', label: '<i data-lucide="image"></i>', title: 'Inserir Imagem' },
    video: { name: 'video', label: '<i data-lucide="video"></i>', title: 'Inserir Vídeo' },
    preview: { name: 'preview', label: '<i data-lucide="eye"></i>', title: 'Visualizar' },
    desktop: { name: 'desktop', label: '<i data-lucide="monitor"></i>', title: 'Modo Desktop', previewOnly: true },
    tablet: { name: 'tablet', label: '<i data-lucide="tablet"></i>', title: 'Modo Tablet', previewOnly: true },
    mobile: { name: 'mobile', label: '<i data-lucide="smartphone"></i>', title: 'Modo Mobile', previewOnly: true },
    closePreview: { name: 'closePreview', label: '<i data-lucide="x"></i> <span class="ml-1 font-semibold text-xs">Sair</span>', title: 'Sair do Preview', previewOnly: true },
    fullscreen: { name: 'fullscreen', label: '<i data-lucide="maximize"></i>', title: 'Tela Cheia' },
    showBlocks: { name: 'showBlocks', label: '<i data-lucide="layout-grid"></i>', title: 'Mostrar Blocos' },
    codeview: { name: 'codeview', label: '<i data-lucide="code"></i>', title: 'Código Fonte' }
  };

  var self = this;

  function createButtonElement(btn) {
      var $element;
      var type = btn.type || 'button';

      if (type === 'dropdown') {
        var $wrapper = $('<div class="editor-dropdown-wrapper relative inline-block"/>');
        var $btn = $('<button type="button" class="editor-dropdown-btn flex items-center justify-between gap-1 h-8 px-2 border border-gray-300 bg-white rounded text-sm text-gray-700 hover:bg-gray-50 transition-colors focus:outline-none"/>')
          .attr('data-name', btn.name)
          .attr('title', btn.title || '')
          .attr('aria-label', btn.title || '')
          .attr('aria-haspopup', 'true')
          .attr('aria-expanded', 'false')
          .html('<span>' + (btn.text || btn.title) + '</span> <i data-lucide="chevron-down" class="w-4 h-4"></i>');
        
        var $menu = $('<div class="editor-dropdown-menu hidden absolute top-full left-0 mt-1 bg-white border border-gray-200 rounded shadow-lg z-50 min-w-[180px] max-h-60 overflow-y-auto text-left" role="menu"/>');

        for(var j = 0; j < btn.options.length; j++) {
          var $item = $('<div class="editor-dropdown-item px-3 py-2 text-sm text-gray-700 cursor-pointer hover:bg-gray-100 border-b border-gray-50 last:border-0 leading-tight"/>')
            .html(btn.options[j].label)
            .attr('role', 'menuitem')
            .attr('tabindex', '0')
            .attr('data-value', btn.options[j].value);
          
          $item.on('mousedown', function(e) { e.preventDefault(); }); // Evita perder o foco
          $item.on('click', function(e) {
            var val = $(this).attr('data-value');
            if (val) {
              editor.exec(btn.name, val);
            }
            $menu.hide();
            self.updateState();
          });
          $menu.append($item);
        }

        $btn.on('mousedown', function(e) { e.preventDefault(); });
        $btn.on('click', function(e) {
          var isVisible = $menu.is(':visible');
          $('.editor-dropdown-menu').hide(); // Esconde os outros painéis abertos
          $('.editor-dropdown-btn').attr('aria-expanded', 'false');
          if (!isVisible) {
            $menu.removeClass('right-0').addClass('left-0').show();
            $btn.attr('aria-expanded', 'true');
            
            // Verifica se o menu vazou a tela pela direita
            if ($menu[0].getBoundingClientRect().right > editor.$container[0].getBoundingClientRect().right) {
              $menu.removeClass('left-0').addClass('right-0');
            }
          }
        });

        $(document).on('mousedown', function(e) {
          if (!$wrapper.is(e.target) && $wrapper.has(e.target).length === 0) {
            $menu.hide();
            $btn.attr('aria-expanded', 'false');
          }
        });

        $wrapper.append($btn, $menu);
        $element = $wrapper;
      } else if (type === 'group') {
        var $wrapper = $('<div class="editor-dropdown-wrapper relative inline-block"/>');
        var $btn = $('<button type="button" class="editor-dropdown-btn flex items-center justify-center min-w-[32px] h-8 px-1 border border-gray-300 bg-white rounded text-gray-700 hover:bg-gray-50 transition-colors focus:outline-none [&>svg]:w-4 [&>svg]:h-4"/>')
          .attr('data-name', btn.name)
          .attr('title', btn.title || '')
          .attr('aria-label', btn.title || '')
          .attr('aria-haspopup', 'true')
          .attr('aria-expanded', 'false')
          .html(btn.label + '<i data-lucide="chevron-down" class="!w-3 !h-3 ml-0.5 opacity-60"></i>');
        
        var $menu = $('<div class="editor-dropdown-menu hidden absolute top-full left-0 mt-1 bg-white border border-gray-200 rounded shadow-lg z-50 p-2 flex flex-row flex-nowrap w-max gap-2" role="menu"/>');

        for(var g = 0; g < btn.buttons.length; g++) {
          var groupItems = btn.buttons[g];
          if (!Array.isArray(groupItems)) groupItems = [groupItems];

          var $groupContainer = $('<div class="flex shadow-sm rounded"/>');

          for(var j = 0; j < groupItems.length; j++) {
            var subBtn = groupItems[j];
            
            var roundedClass = groupItems.length === 1 ? 'rounded' : 
                               (j === 0 ? 'rounded-l' : 
                               (j === groupItems.length - 1 ? 'rounded-r' : 'rounded-none'));
            
            var marginClass = j === 0 ? '' : '-ml-px';

            var $subBtn = $('<button type="button" class="flex items-center justify-center w-8 h-8 border border-gray-300 bg-white text-gray-700 hover:bg-gray-50 hover:z-10 [&.active]:z-10 transition-colors focus:outline-none relative [&>svg]:w-4 [&>svg]:h-4 ' + marginClass + ' ' + roundedClass + '"/>')
              .attr('data-name', subBtn.name)
              .attr('title', subBtn.title || '')
              .attr('aria-label', subBtn.title || '')
              .attr('role', 'menuitem')
              .html(subBtn.label)
              .on('mousedown', function(e) { e.preventDefault(); })
              .on('click', (function(cmdName) {
                return function(e) {
                  editor.exec(cmdName);
                  $menu.hide();
                  $btn.attr('aria-expanded', 'false');
                  self.updateState();
                };
              })(subBtn.name));

            self.buttons[subBtn.name] = $subBtn;
            $groupContainer.append($subBtn);
          }
          $menu.append($groupContainer);
        }

        $btn.on('mousedown', function(e) { e.preventDefault(); });
        $btn.on('click', function(e) {
          var isVisible = $menu.is(':visible');
          $('.editor-dropdown-menu').hide(); 
          $('.editor-dropdown-btn').attr('aria-expanded', 'false');
          if (!isVisible) {
            $menu.removeClass('right-0').addClass('left-0').css('display', 'flex');
            $btn.attr('aria-expanded', 'true');

            // Verifica se o menu vazou a tela pela direita
            if ($menu[0].getBoundingClientRect().right > editor.$container[0].getBoundingClientRect().right) {
              $menu.removeClass('left-0').addClass('right-0');
            }
          }
        });

        $(document).on('mousedown', function(e) {
          if (!$wrapper.is(e.target) && $wrapper.has(e.target).length === 0) {
            $menu.hide();
            $btn.attr('aria-expanded', 'false');
          }
        });

        $wrapper.append($btn, $menu);
        $element = $wrapper;
      } else if (type === 'color') {
        var defaultColor = btn.defaultColor || '#000000';
        $element = $('<button type="button" class="relative overflow-hidden flex items-center justify-center w-8 h-8 border border-gray-300 bg-white rounded text-gray-700 hover:bg-gray-50 transition-colors focus:outline-none [&>svg]:w-4 [&>svg]:h-4"/>')
          .attr('data-name', btn.name)
          .attr('title', btn.title || '')
          .attr('aria-label', btn.title || '')
          .html(btn.label);

        var $input = $('<input type="color"/>').val(defaultColor).css({
          position: 'absolute',
          left: 0,
          top: 0,
          width: '100%',
          height: '100%',
          margin: 0,
          padding: 0,
          border: 'none',
          opacity: 0,
          cursor: 'pointer'
        })
        .attr('aria-label', 'Escolher cor');

        var savedRange = null;

        $element.on('mousedown', function (e) {
          if (editor.selection && editor.selection.isInsideEditor()) {
            savedRange = editor.selection.getRange();
          }
        });

        $input.on('input change', function () {
          if (savedRange) {
            var sel = window.getSelection();
            sel.removeAllRanges();
            sel.addRange(savedRange); 
          }

          var val = $(this).val();
          editor.exec(btn.name, val);

          if (editor.selection && editor.selection.isInsideEditor()) {
            savedRange = editor.selection.getRange();
          }
          self.updateState();
        });

        $element.append($input);
      } else {
        $element = $('<button type="button" class="flex items-center justify-center min-w-[32px] h-8 px-1 border border-gray-300 bg-white rounded text-gray-700 hover:bg-gray-50 transition-colors disabled:opacity-50 disabled:cursor-not-allowed focus:outline-none [&>svg]:w-4 [&>svg]:h-4"/>')
          .attr('data-name', btn.name)
          .attr('title', btn.title || '')
          .attr('aria-label', btn.title || '')
          .html(btn.label)
          .on('mousedown', function(e) { e.preventDefault(); })
          .on('click', function () {
          editor.exec(btn.name);

          self.updateState();
        });
      }

      // Define se o botão é padrão ou exclusivo do modo Preview
      if (btn.previewOnly) {
        $element.addClass('preview-only-btn hidden');
        // Joga o botão de "Sair" lá para a ponta direita (ml-auto) e deixa ele com tom de alerta vermelho
        if (btn.name === 'closePreview') {
          $element.removeClass('text-gray-700 hover:bg-gray-50 px-1').addClass('ml-auto text-red-600 hover:bg-red-50 border-red-200 px-3');
        }
      } else {
        $element.addClass('standard-btn');
      }

      self.buttons[btn.name] = $element;

      return $element;
  }

  // Mapeamento Inteligente: caso o usuário use a sintaxe nativa do Summernote, o plugin vai entendê-lo
  var aliasMap = {
    'style': ['formatBlock'],
    'clear': ['removeFormat'],
    'picture': ['image'],
    'paragraph': ['paragraphGroup'],
    'color': ['foreColor', 'backColor']
  };

  var toolbarConfig = editor.options.toolbar;

  for (var i = 0; i < toolbarConfig.length; i++) {
    var groupButtonsRaw = toolbarConfig[i][1];
    var groupButtons = [];
    
    // Desenrola Aliases e Nomes
    for (var b = 0; b < groupButtonsRaw.length; b++) {
      var rawName = groupButtonsRaw[b];
      if (aliasMap[rawName]) groupButtons = groupButtons.concat(aliasMap[rawName]);
      else groupButtons.push(rawName);
    }

    // Cria a caixinha elegante que comportará o grupo e a margem divisória
    var $groupWrapper = $('<div class="editor-toolbar-group flex gap-1 items-center mr-2 pr-2 border-r border-gray-300 last:border-r-0 last:mr-0 last:pr-0"/>');

    for (var k = 0; k < groupButtons.length; k++) {
      var btnData = defaultButtonLibrary[groupButtons[k]];
      if (btnData) $groupWrapper.append(createButtonElement(btnData));
    }

    if (groupButtons.length > 0) editor.$toolbar.append($groupWrapper);
  }

  // Garante que os botões vitais de Preview sejam gerados silenciosamente no fundo para entrarem em ação
  var previewBtns = ['desktop', 'tablet', 'mobile', 'closePreview'];
  var $pGroup = $('<div class="editor-toolbar-group flex gap-1 items-center w-full"/>');
  for (var p = 0; p < previewBtns.length; p++) {
    if (!self.buttons[previewBtns[p]]) $pGroup.append(createButtonElement(defaultButtonLibrary[previewBtns[p]]));
  }
  if ($pGroup.children().length > 0) editor.$toolbar.append($pGroup);

  // Caso o script do Lucide já tenha carregado
  if (window.lucide) {
    window.lucide.createIcons({ root: editor.$toolbar[0] });
  }
};

ToolbarPlugin.prototype.updateState = function () {
  if (!this.editor.selection) return;

  var formats = this.editor.selection.getActiveFormats();

  for (var key in this.buttons) {
    this.buttons[key].removeClass('bg-gray-200 shadow-inner active').addClass('bg-white');
  }

  if (formats.bold && this.buttons.bold) {
    this.buttons.bold.removeClass('bg-white').addClass('bg-gray-200 shadow-inner active');
  }

  if (formats.italic && this.buttons.italic) {
    this.buttons.italic.removeClass('bg-white').addClass('bg-gray-200 shadow-inner active');
  }

  if (formats.link && this.buttons.link) {
    this.buttons.link.removeClass('bg-white').addClass('bg-gray-200 shadow-inner active');
  }

  // Verifica o estado nativo dos comandos executados via execCommand
  var nativeCommands = {
    'underline': 'underline',
    'strikethrough': 'strikeThrough',
    'subscript': 'subscript',
    'superscript': 'superscript',
    'ul': 'insertUnorderedList',
    'ol': 'insertOrderedList',
    'alignLeft': 'justifyLeft',
    'alignCenter': 'justifyCenter',
    'alignRight': 'justifyRight',
    'justifyFull': 'justifyFull'
  };

  for (var btnName in nativeCommands) {
    if (this.buttons[btnName] && document.queryCommandState(nativeCommands[btnName])) {
      this.buttons[btnName].removeClass('bg-white').addClass('bg-gray-200 shadow-inner active');
    }
  }

  if (this.editor.$content.hasClass('editor-show-blocks') && this.buttons.showBlocks) {
    this.buttons.showBlocks.removeClass('bg-white').addClass('bg-gray-200 shadow-inner active');
  }
};
window.BasicCommandsPlugin = BasicCommandsPlugin;

function BasicCommandsPlugin(editor) {
  this.editor = editor;
}

BasicCommandsPlugin.prototype.init = function () {
  var editor = this.editor;

  // --- Funções Auxiliares baseadas em Selection e Range ---

  function applySpanStyle(styleProp, value) {
    // Força o foco no editor para recuperar corretamente a seleção após usar o color picker
    editor.$content.focus();
    
    var sel = window.getSelection();
    if (!sel.rangeCount) return;

    var range = sel.getRangeAt(0);
    if (range.collapsed) return;

    var fragment = range.extractContents();

    // Caminha inteligentemente pelos nós para não quebrar blocos HTML com Spans
    function styleNodes(node) {
      if (node.nodeType === 3) {
        if (node.nodeValue.length > 0) {
          var span = document.createElement('span');
          span.style[styleProp] = value;
          node.parentNode.insertBefore(span, node);
          span.appendChild(node);
        }
      } else if (node.nodeType === 1) {
        var blockTags = ['P', 'DIV', 'H1', 'H2', 'H3', 'H4', 'H5', 'H6', 'BLOCKQUOTE', 'LI', 'UL', 'OL', 'TD', 'TH', 'TR', 'TBODY', 'THEAD', 'TABLE'];
        if (blockTags.indexOf(node.tagName.toUpperCase()) !== -1) {
          var children = Array.prototype.slice.call(node.childNodes);
          for (var i = 0; i < children.length; i++) {
            styleNodes(children[i]);
          }
        } else {
          node.style[styleProp] = value;
          var childrenElements = node.querySelectorAll('*');
          for (var j = 0; j < childrenElements.length; j++) {
            childrenElements[j].style[styleProp] = '';
          }
        }
      }
    }

    var tempDiv = document.createElement('div');
    tempDiv.appendChild(fragment);

    var children = Array.prototype.slice.call(tempDiv.childNodes);
    for (var i = 0; i < children.length; i++) {
      styleNodes(children[i]);
    }

    range.insertNode(tempDiv);

    var lastNode = null;
    var firstNode = tempDiv.firstChild;

    while (tempDiv.firstChild) {
      lastNode = tempDiv.firstChild;
      tempDiv.parentNode.insertBefore(lastNode, tempDiv);
    }
    tempDiv.parentNode.removeChild(tempDiv);

    if (firstNode && lastNode) {
      var newRange = document.createRange();
      newRange.setStartBefore(firstNode);
      newRange.setEndAfter(lastNode);
      sel.removeAllRanges();
      sel.addRange(newRange);
    }

    editor.trigger('change');
    editor.updateToolbar();
  }

  function applyAlignment(align) {
    if (!editor.selection || !editor.selection.isInsideEditor()) return;
    var range = editor.selection.getRange();
    if (!range) return;
    
    var block = $(range.commonAncestorContainer).closest('p, div, h1, h2, h3, h4, h5, h6, blockquote, li, td');
    if (block.length) {
        block.css('text-align', align);
    } else {
        var wrapper = $('<p>').css('text-align', align);
        if (!range.collapsed) {
            wrapper.append(range.extractContents());
            range.insertNode(wrapper[0]);
        } else {
            wrapper.html('<br>');
            range.insertNode(wrapper[0]);
        }
    }

    editor.trigger('change');
    editor.updateToolbar();
  }

  function toggleList(listTag) {
    if (!editor.selection || !editor.selection.isInsideEditor()) return;
    var range = editor.selection.getRange();
    if (!range) return;

    var block = $(range.commonAncestorContainer).closest('p, div, h1, h2, h3, h4, h5, h6');
    var currentList = $(range.commonAncestorContainer).closest('ul, ol');

    if (currentList.length) {
        if (currentList[0].tagName.toLowerCase() !== listTag) {
            var newList = $('<' + listTag + '>').html(currentList.html());
            currentList.replaceWith(newList);
        } else {
            // Remove a lista (unwrap)
            var items = currentList.find('li');
            var fragment = document.createDocumentFragment();
            items.each(function() {
                var p = $('<p>').html($(this).html() || '<br>');
                fragment.appendChild(p[0]);
            });
            currentList.replaceWith(fragment);
        }
    } else if (block.length) {
        var list = $('<' + listTag + '>');
        var li = $('<li>').html(block.html());
        list.append(li);
        block.replaceWith(list);
    } else if (!range.collapsed) {
        var list = $('<' + listTag + '>');
        var li = $('<li>').append(range.extractContents());
        list.append(li);
        range.insertNode(list[0]);
    }

    editor.trigger('change');
    editor.updateToolbar();
  }

  // --- Registro de Comandos Nativos Customizados ---

  editor.registerCommand('bold', function (editor) {
    if (!editor.selection || !editor.selection.isInsideEditor()) return;
    editor.selection.toggle('b');
    editor.trigger('change');
    editor.updateToolbar();
  });

  editor.registerCommand('italic', function (editor) {
    if (!editor.selection || !editor.selection.isInsideEditor()) return;
    editor.selection.toggle('i');
    editor.trigger('change');
    editor.updateToolbar();
  });

  editor.registerCommand('underline', function (editor) {
    if (!editor.selection || !editor.selection.isInsideEditor()) return;
    editor.selection.toggle('u');
    editor.trigger('change');
    editor.updateToolbar();
  });

  editor.registerCommand('strikethrough', function (editor) {
    if (!editor.selection || !editor.selection.isInsideEditor()) return;
    editor.selection.toggle('s');
    editor.trigger('change');
    editor.updateToolbar();
  });

  editor.registerCommand('subscript', function (editor) {
    if (!editor.selection || !editor.selection.isInsideEditor()) return;
    editor.selection.toggle('sub');
    editor.trigger('change');
    editor.updateToolbar();
  });

  editor.registerCommand('superscript', function (editor) {
    if (!editor.selection || !editor.selection.isInsideEditor()) return;
    editor.selection.toggle('sup');
    editor.trigger('change');
    editor.updateToolbar();
  });

  editor.registerCommand('hr', function (editor) {
    if (!editor.selection || !editor.selection.isInsideEditor()) return;
    var range = editor.selection.getRange();
    if (!range) return;
    
    var hr = document.createElement('hr');
    range.deleteContents();
    range.insertNode(hr);
    
    var p = document.createElement('p');
    p.innerHTML = '<br>';
    $(hr).after(p);
    
    editor.selection.restoreSelection(p);

    editor.trigger('change');
    editor.updateToolbar();
  });

  editor.registerCommand('ul', function (editor) { toggleList('ul'); });
  editor.registerCommand('ol', function (editor) { toggleList('ol'); });

  editor.registerCommand('alignLeft', function (editor) { applyAlignment('left'); });
  editor.registerCommand('alignCenter', function (editor) { applyAlignment('center'); });
  editor.registerCommand('alignRight', function (editor) { applyAlignment('right'); });
  editor.registerCommand('justifyFull', function (editor) { applyAlignment('justify'); });

  editor.registerCommand('indent', function (editor) {
    if (!editor.selection || !editor.selection.isInsideEditor()) return;
    var range = editor.selection.getRange();
    if (!range) return;
    var block = $(range.commonAncestorContainer).closest('p, div, h1, h2, h3, h4, h5, h6, blockquote, li');
    if (block.length) {
        var currentMargin = parseInt(block.css('margin-left')) || 0;
        block.css('margin-left', (currentMargin + 20) + 'px');
        
        editor.trigger('change');
    }
  });

  editor.registerCommand('outdent', function (editor) {
    if (!editor.selection || !editor.selection.isInsideEditor()) return;
    var range = editor.selection.getRange();
    if (!range) return;
    var block = $(range.commonAncestorContainer).closest('p, div, h1, h2, h3, h4, h5, h6, blockquote, li');
    if (block.length) {
        var currentMargin = parseInt(block.css('margin-left')) || 0;
        if (currentMargin > 0) {
            block.css('margin-left', Math.max(0, currentMargin - 20) + 'px');
            
            editor.trigger('change');
        }
    }
  });

  editor.registerCommand('removeFormat', function (editor) {
    if (!editor.selection || !editor.selection.isInsideEditor()) return;
    var range = editor.selection.getRange();
    if (!range || range.collapsed) return;

    var fragment = range.extractContents();
    var tempDiv = document.createElement('div');
    tempDiv.appendChild(fragment);

    var inlineTags = ['b', 'i', 'u', 's', 'strike', 'em', 'strong', 'span', 'font', 'sub', 'sup', 'a'];
    $(tempDiv).find(inlineTags.join(',')).each(function() {
        $(this).contents().unwrap();
    });

    $(tempDiv).find('*').removeAttr('style').removeAttr('class').removeAttr('color').removeAttr('face').removeAttr('size');

    range.insertNode(tempDiv);
    $(tempDiv).contents().unwrap();

    editor.trigger('change');
    editor.updateToolbar();
  });

  editor.registerCommand('formatBlock', function (editor, value) {
    if (!editor.selection || !editor.selection.isInsideEditor()) return;
    var range = editor.selection.getRange();
    if (!range) return;
    
    var tagName = value.toLowerCase();
    var block = $(range.commonAncestorContainer).closest('p, div, h1, h2, h3, h4, h5, h6, blockquote, pre');
    
    if (block.length) {
        var newBlock = $('<' + tagName + '>').html(block.html());
        block.replaceWith(newBlock);
        
        editor.trigger('change');
        editor.updateToolbar();
    } else if (!range.collapsed) {
        var newBlock = $('<' + tagName + '>').append(range.extractContents());
        range.insertNode(newBlock[0]);
        
        editor.trigger('change');
        editor.updateToolbar();
    }
  });

  editor.registerCommand('foreColor', function (editor, value) {
    applySpanStyle('color', value);
  });

  editor.registerCommand('backColor', function (editor, value) {
    applySpanStyle('backgroundColor', value);
  });

  editor.registerCommand('fontName', function (editor, value) {
    applySpanStyle('fontFamily', value);
  });

  editor.registerCommand('fontSize', function (editor, value) {
    var remValue = (parseInt(value, 10) / 16) + 'rem';
    applySpanStyle('fontSize', remValue);
  });

  editor.registerCommand('showBlocks', function (editor) {
    editor.$content.toggleClass('editor-show-blocks');
  });

  // Atalhos de teclado
  editor.$content.on('keydown', function (e) {
    // Atalhos que usam Ctrl (Windows/Linux) ou Cmd (Mac)
    if (e.ctrlKey || e.metaKey) {
      var key = e.key.toLowerCase();
      var prevent = false;

      switch (key) {
        case 'b':
          editor.exec('bold');
          prevent = true;
          break;
        case 'i':
          editor.exec('italic');
          prevent = true;
          break;
        case 'u':
          editor.exec('underline');
          prevent = true;
          break;
        case 'z':
          e.shiftKey ? editor.exec('redo') : editor.exec('undo');
          prevent = true;
          break;
        case 'y':
          editor.exec('redo');
          prevent = true;
          break;
      }

      if (prevent) {
        e.preventDefault();
      }
    }
  });
};
function SanitizerPlugin(editor) {
  this.editor = editor;
}

SanitizerPlugin.prototype.init = function () {
  this.allowedTags = this.editor.options.allowedTags || [
    'p', 'b', 'i', 'u', 'strong', 'em',
    'ul', 'ol', 'li',
    'a', 'img',
    'h1', 'h2', 'h3','h4', 'h5', 'h6',
    'div', 'span', 'br',
    'table', 'thead', 'tbody', 'tfoot', 'tr', 'th', 'td', 'caption', 'colgroup', 'col',
    'blockquote', 'pre', 'code', 's', 'strike', 'del', 'sub', 'sup', 'hr', 'mark',
    'iframe', 'video', 'audio', 'source',
    'style', 'script'
  ];

  this.allowedAttributes = this.editor.options.allowedAttributes || {
    '*': ['class', 'id', 'style', 'title', 'dir'],
    a: ['href', 'target', 'rel'],
    img: ['src', 'alt', 'width', 'height'],
    iframe: ['src', 'width', 'height', 'allow', 'allowfullscreen', 'frameborder', 'scrolling'],
    table: ['border', 'cellpadding', 'cellspacing', 'width'],
    td: ['colspan', 'rowspan', 'scope', 'width', 'height', 'valign'],
    th: ['colspan', 'rowspan', 'scope', 'width', 'height', 'valign'],
    ol: ['start', 'type', 'reversed'],
    video: ['src', 'controls', 'width', 'height', 'poster', 'autoplay', 'loop', 'muted'],
    audio: ['src', 'controls', 'autoplay', 'loop', 'muted'],
    source: ['src', 'type'],
    style: ['type', 'media'],
    script: ['src', 'type', 'async', 'defer', 'charset']
  };

  this.bind();
};

SanitizerPlugin.prototype.bind = function () {
  var self = this;

  this.editor.$content.on('paste', function (e) {
    e.preventDefault();

    var html = (e.originalEvent || e).clipboardData.getData('text/html');
    var text = (e.originalEvent || e).clipboardData.getData('text/plain');

    var content = html || text;

    var clean = self.clean(content);

    document.execCommand('insertHTML', false, clean);
  });
};

SanitizerPlugin.prototype.clean = function (html) {
  var div = document.createElement('div');
  div.innerHTML = html;

  this.walk(div);

  return this.normalize(div.innerHTML);
};

SanitizerPlugin.prototype.walk = function (node) {
  var children = node.children;

  for (var i = children.length - 1; i >= 0; i--) {
    var child = children[i];

    // Caminha para os filhos primeiro (bottom-up) para garantir que
    // os filhos não sejam perdidos caso o pai seja desempacotado
    this.walk(child);

    var tag = child.tagName.toLowerCase();

    if (this.allowedTags.indexOf(tag) === -1) {
      // Desempacota a tag (mantém o conteúdo interno) em vez de apagar tudo
      while (child.firstChild) {
        child.parentNode.insertBefore(child.firstChild, child);
      }
      child.parentNode.removeChild(child);
      continue;
    }

    this.cleanAttributes(child, tag);
  }
};

SanitizerPlugin.prototype.cleanAttributes = function (el, tag) {
  var allowedForTag = this.allowedAttributes[tag] || [];
  var allowedGlobal = this.allowedAttributes['*'] || [];
  var attrs = el.attributes;

  for (var i = attrs.length - 1; i >= 0; i--) {
    var originalName = attrs[i].name;
    var name = originalName.toLowerCase();
    var value = attrs[i].value;

    // remove eventos (proteção contra XSS)
    if (name.indexOf('on') === 0) {
      el.removeAttribute(originalName);
      continue;
    }

    // remove atributos não permitidos
    if (allowedForTag.indexOf(name) === -1 && allowedGlobal.indexOf(name) === -1) {
      el.removeAttribute(originalName);
      continue;
    }

    // proteção genérica contra XSS em URLs (links, imagens, iframes, videos)
    if ((name === 'href' || name === 'src') && !this.isSafeUrl(value)) {
      el.removeAttribute(originalName);
    }
  }

  // segurança adicional para links
  if (tag === 'a') {
    if (el.getAttribute('target') === '_blank') {
      el.setAttribute('rel', 'noopener noreferrer');
    } else {
      el.removeAttribute('rel');
    }
  }
};

SanitizerPlugin.prototype.isSafeUrl = function (url) {
  // Se a URL possui um protocolo explícito (ex: http:, javascript:, mailto:), valida-o
  if (/^([a-z0-9\+\-\.]+):/i.test(url)) {
    return /^(https?|data:image\/)/i.test(url);
  }
  // Caminhos relativos puros (como "uploads/img_xxx.jpg" ou "../imagem.png") são sempre seguros
  return true;
};

SanitizerPlugin.prototype.normalize = function (html) {
  return html;
};

window.SanitizerPlugin = SanitizerPlugin;
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
function NormalizerPlugin(editor) {
  this.editor = editor;
}

NormalizerPlugin.prototype.init = function () {
  this.bind();
};

NormalizerPlugin.prototype.bind = function () {
  var self = this;

  this.editor.$content.on('blur', function () {
    self.normalize();
  });
};

NormalizerPlugin.prototype.normalize = function () {
  var root = this.editor.$content[0];

  this.flatten(root, 'b');
  this.flatten(root, 'i');
  this.removeEmpty(root);
};

NormalizerPlugin.prototype.flatten = function (root, tag) {
  var nodes = root.querySelectorAll(tag + ' ' + tag);

  for (var i = 0; i < nodes.length; i++) {
    var inner = nodes[i];
    var parent = inner.parentNode;

    while (inner.firstChild) {
      parent.insertBefore(inner.firstChild, inner);
    }

    parent.removeChild(inner);
  }
};

NormalizerPlugin.prototype.removeEmpty = function (root) {
  var nodes = root.querySelectorAll('*');
  var keepTags = ['BR', 'IMG', 'IFRAME', 'HR', 'VIDEO', 'AUDIO', 'TD', 'TH', 'SCRIPT', 'STYLE'];

  for (var i = nodes.length - 1; i >= 0; i--) {
    var el = nodes[i];

    if (
      el.childNodes.length === 0 &&
      keepTags.indexOf(el.tagName) === -1 &&
      el.textContent.trim() === ''
    ) {
      el.parentNode.removeChild(el);
    }
  }
};

window.NormalizerPlugin = NormalizerPlugin;
function LinkPlugin(editor) {
  this.editor = editor;
  this.$popover = null;
  this.savedRange = null;
  this.activeLinkNode = null;
}

LinkPlugin.prototype.init = function () {
  var self = this;

  this.editor.registerCommand('link', function () {
    self.togglePopover();
  });

  this.buildPopover();
};

LinkPlugin.prototype.buildPopover = function () {
  var self = this;

  this.$popover = $('<div class="editor-link-popover absolute bg-white border border-gray-200 p-3 rounded-md z-50 shadow-lg w-72 text-sm hidden font-sans"></div>');
  
  var $form = $('<div class="flex flex-col gap-3"></div>');
  
  var $textGroup = $('<div class="flex flex-col gap-1"><label class="font-semibold text-gray-700 m-0">Texto de Exibição</label></div>');
  this.$textInput = $('<input type="text" placeholder="Texto do link" class="px-2 py-1.5 border border-gray-300 rounded text-sm outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 w-full">');
  $textGroup.append(this.$textInput);

  var $urlGroup = $('<div class="flex flex-col gap-1"><label class="font-semibold text-gray-700 m-0">URL</label></div>');
  this.$urlInput = $('<input type="text" placeholder="https://" class="px-2 py-1.5 border border-gray-300 rounded text-sm outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 w-full">');
  $urlGroup.append(this.$urlInput);

  var $targetGroup = $('<label class="flex items-center gap-2 cursor-pointer text-gray-700 m-0"><input type="checkbox" class="rounded text-blue-600 focus:ring-blue-500" checked> Abrir em nova aba</label>');
  this.$targetInput = $targetGroup.find('input');

  var $btnGroup = $('<div class="flex mt-1"></div>');
  
  this.$btnUnlink = $('<button type="button" class="px-3 py-1.5 border border-red-500 text-red-500 bg-white rounded cursor-pointer text-sm hover:bg-red-50 transition-colors">Remover</button>');
  
  var $rightBtns = $('<div class="flex gap-2 ml-auto"></div>');
  var $btnCancel = $('<button type="button" class="px-3 py-1.5 border border-gray-300 bg-white rounded cursor-pointer text-sm text-gray-700 hover:bg-gray-50 transition-colors">Cancelar</button>');
  var $btnSave = $('<button type="button" class="px-4 py-1.5 border-none bg-blue-600 text-white rounded cursor-pointer text-sm font-semibold hover:bg-blue-700 transition-colors">Salvar</button>');
  
  $rightBtns.append($btnCancel, $btnSave);
  $btnGroup.append(this.$btnUnlink, $rightBtns);

  $form.append($textGroup, $urlGroup, $targetGroup, $btnGroup);
  this.$popover.append($form);

  this.editor.$container.append(this.$popover);

  // Evita que clicar no popover faça o editor perder o foco
  this.$popover.on('mousedown', function (e) {
    if (e.target.tagName !== 'INPUT') {
      e.preventDefault();
    }
  });

  $btnCancel.on('click', function () {
    self.togglePopover(false);
  });

  this.$btnUnlink.on('click', function () {
    self.removeLink();
    self.togglePopover(false);
  });

  $btnSave.on('click', function () {
    self.insertLink();
    self.togglePopover(false);
  });

  // Esconde o popover se clicar fora
  $(document).on('mousedown', function (e) {
    var $btn = self.editor.$toolbar.find('[data-name="link"]');
    if (!self.$popover.is(e.target) && self.$popover.has(e.target).length === 0 && !$btn.is(e.target) && $btn.has(e.target).length === 0) {
      self.togglePopover(false);
    }
  });
};

LinkPlugin.prototype.togglePopover = function (forceState) {
  var $btn = this.editor.$toolbar.find('[data-name="link"]');
  if ($btn.length === 0) return;

  var isVisible = forceState !== undefined ? forceState : !this.$popover.is(':visible');

  if (isVisible) {
    if (this.editor.selection && this.editor.selection.isInsideEditor()) {
      this.savedRange = this.editor.selection.getRange();
    } else {
      return;
    }

    var text = '';
    var url = 'https://';
    var isBlank = true;
    var isLinked = false;

    // Verificar se o cursor já está dentro de um link existente
    var node = this.savedRange.commonAncestorContainer;
    while (node && node !== this.editor.$content[0]) {
      if (node.nodeType === 1 && node.tagName.toLowerCase() === 'a') {
        isLinked = true;
        text = node.innerText;
        url = node.getAttribute('href') || 'https://';
        isBlank = node.getAttribute('target') === '_blank';
        this.activeLinkNode = node;
        break;
      }
      node = node.parentNode;
    }

    if (!isLinked) {
      this.activeLinkNode = null;
      text = this.savedRange.toString();
    }

    this.$textInput.val(text);
    this.$urlInput.val(url);
    this.$targetInput.prop('checked', isBlank);
    
    if (isLinked) {
      this.$btnUnlink.show();
    } else {
      this.$btnUnlink.hide();
    }

    var btnOffset = $btn.position();
    this.$popover.css({
      top: btnOffset.top + $btn.outerHeight() + 5,
      left: btnOffset.left
    });
    this.$popover.show();
    
    // Verifica se o painel vazou pela direita
    if (this.$popover[0].getBoundingClientRect().right > this.editor.$container[0].getBoundingClientRect().right) {
      this.$popover.css('left', btnOffset.left - this.$popover.outerWidth() + $btn.outerWidth());
    }

    // Foca no input correto automaticamente
    var self = this;
    setTimeout(function() {
      if (!text) {
        self.$textInput.focus();
      } else {
        self.$urlInput.focus();
      }
    }, 0);

  } else {
    this.$popover.hide();
  }
};

LinkPlugin.prototype.insertLink = function () {
  if (this.savedRange) {
    var sel = window.getSelection();
    sel.removeAllRanges();
    sel.addRange(this.savedRange);
  } else if (!this.editor.selection || !this.editor.selection.isInsideEditor()) {
    return;
  }

  var url = this.$urlInput.val().trim();
  var text = this.$textInput.val().trim() || url;
  var isBlank = this.$targetInput.prop('checked');

  if (!url || url === 'https://') return;

  if (this.activeLinkNode) {
    this.activeLinkNode.href = url;
    this.activeLinkNode.innerText = text;
    if (isBlank) {
      this.activeLinkNode.setAttribute('target', '_blank');
      this.activeLinkNode.setAttribute('rel', 'noopener noreferrer');
    } else {
      this.activeLinkNode.removeAttribute('target');
      this.activeLinkNode.removeAttribute('rel');
    }
  } else {
    var linkHtml = '<a href="' + url + '"' + (isBlank ? ' target="_blank" rel="noopener noreferrer"' : '') + '>' + text + '</a>';
    document.execCommand('insertHTML', false, linkHtml);
  }
  
  this.editor.trigger('change');
  this.editor.updateToolbar();
};

LinkPlugin.prototype.removeLink = function () {
  if (this.savedRange) {
    var sel = window.getSelection();
    sel.removeAllRanges();
    sel.addRange(this.savedRange);
  }
  
  if (this.activeLinkNode) {
    var $node = $(this.activeLinkNode);
    $node.replaceWith($node.html());
  } else {
    document.execCommand('unlink', false, null);
  }
  
  this.editor.trigger('change');
  this.editor.updateToolbar();
};

window.LinkPlugin = LinkPlugin;
function TablePlugin(editor) {
  this.editor = editor;
  this.$grid = null;
}

TablePlugin.prototype.init = function () {
  var self = this;

  this.editor.registerCommand('table', function () {
    self.toggleGrid();
  });

  this.buildGrid();
};

TablePlugin.prototype.buildGrid = function () {
  var self = this;

  this.$grid = $('<div class="editor-table-grid hidden absolute bg-white border border-gray-200 p-2 rounded z-50 shadow-md"></div>');
  var $gridInner = $('<div class="flex flex-wrap w-[150px]"></div>');

  // Gera uma grade 10x10
  for (var r = 1; r <= 10; r++) {
    for (var c = 1; c <= 10; c++) {
      var $cell = $('<div class="grid-cell w-[15px] h-[15px] border border-gray-100 box-border cursor-pointer hover:border-blue-500" data-row="' + r + '" data-col="' + c + '"></div>');
      $gridInner.append($cell);
    }
  }

  var $label = $('<div class="grid-label text-center text-xs mt-2 text-gray-500 font-sans">0 x 0</div>');

  this.$grid.append($gridInner).append($label);
  this.editor.$container.append(this.$grid);

  // Evita que clicar na grade faça o editor perder o foco
  this.$grid.on('mousedown', function (e) {
    e.preventDefault();
  });

  // Pinta de azul as células correspondentes ao passar o mouse
  this.$grid.on('mouseover', '.grid-cell', function () {
    var row = $(this).data('row');
    var col = $(this).data('col');
    
    self.$grid.find('.grid-cell').each(function () {
      var $this = $(this);
      if ($this.data('row') <= row && $this.data('col') <= col) {
        $this.css('background', '#3b82f6'); // azul do tailwind
      } else {
        $this.css('background', 'transparent');
      }
    });
    $label.text(col + ' x ' + row);
  });

  // Dispara a criação da tabela quando clicado e oculta o grid
  this.$grid.on('click', '.grid-cell', function () {
    var row = $(this).data('row');
    var col = $(this).data('col');
    self.insertTable(row, col);
    self.toggleGrid(false);
  });

  // Esconde o menu de grade se clicar em outro lugar da tela
  $(document).on('click', function (e) {
    var $btn = self.editor.$toolbar.find('[data-name="table"]');
    if (!self.$grid.is(e.target) && self.$grid.has(e.target).length === 0 && !$btn.is(e.target) && $btn.has(e.target).length === 0) {
      self.toggleGrid(false);
    }
  });
};

TablePlugin.prototype.toggleGrid = function (forceState) {
  var $btn = this.editor.$toolbar.find('[data-name="table"]');
  if ($btn.length === 0) return;

  var isVisible = forceState !== undefined ? forceState : !this.$grid.is(':visible');

  if (isVisible) {
    // Salva a posição exata do cursor para usarmos depois
    if (this.editor.selection && this.editor.selection.isInsideEditor()) {
      this.savedRange = this.editor.selection.getRange();
    }

    var btnOffset = $btn.position();
    this.$grid.css({
      top: btnOffset.top + $btn.outerHeight() + 5,
      left: btnOffset.left
    });
    this.$grid.show();
    this.$grid.find('.grid-cell').css('background', 'transparent');
    this.$grid.find('.grid-label').text('0 x 0');

    // Verifica se o painel vazou pela direita
    if (this.$grid[0].getBoundingClientRect().right > this.editor.$container[0].getBoundingClientRect().right) {
      this.$grid.css('left', btnOffset.left - this.$grid.outerWidth() + $btn.outerWidth());
    }
  } else {
    this.$grid.hide();
  }
};

TablePlugin.prototype.insertTable = function (rows, cols) {
  // Restaura o cursor para o exato local antes do menu ser aberto
  if (this.savedRange) {
    var sel = window.getSelection();
    sel.removeAllRanges();
    sel.addRange(this.savedRange);
  } else if (!this.editor.selection || !this.editor.selection.isInsideEditor()) {
    return;
  }

  if (isNaN(rows) || isNaN(cols) || rows <= 0 || cols <= 0) {
    return;
  }

  var html = '<table style="width: 100%; border-collapse: collapse; margin-bottom: 15px; border: 1px solid #ccc;"><tbody>';
  for (var r = 0; r < rows; r++) {
    html += '<tr>';
    for (var c = 0; c < cols; c++) {
      html += '<td style="padding: 8px; border: 1px solid #ccc;">&nbsp;</td>';
    }
    html += '</tr>';
  }
  html += '</tbody></table><p><br></p>'; // Adiciona um parágrafo no final para poder continuar digitando

  document.execCommand('insertHTML', false, html);
};

window.TablePlugin = TablePlugin;
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

  $content.on('dragover', function (e) { e.preventDefault(); e.stopPropagation(); $content.addClass('drag-over'); });
  $content.on('dragleave', function (e) { e.preventDefault(); e.stopPropagation(); $content.removeClass('drag-over'); });

  $content.on('drop', function (e) {
    e.preventDefault();
    e.stopPropagation();
    $content.removeClass('drag-over');

    var oe = e.originalEvent;
    self.editor.$content.focus();

    // Tenta posicionar o cursor no local exato onde a imagem foi solta
    if (document.caretRangeFromPoint) {
      var range = document.caretRangeFromPoint(oe.clientX, oe.clientY);
      if (range) {
        var sel = window.getSelection();
        sel.removeAllRanges();
        sel.addRange(range);
      }
    } else if (oe.rangeParent) { // fallback Firefox
      var range = document.createRange();
      range.setStart(oe.rangeParent, oe.rangeOffset);
      var sel = window.getSelection();
      sel.removeAllRanges();
      sel.addRange(range);
    }

    if (self.editor.selection && self.editor.selection.isInsideEditor()) {
      self.savedRange = self.editor.selection.getRange();
    } else {
      self.savedRange = null;
    }

    var files = oe.dataTransfer.files;
    if (files && files.length > 0 && files[0].type.match(/^image\//)) {
      self.insertImage(files[0]);
    }
  });
};

ImagePlugin.prototype.insertImage = function (file) {
  var self = this;
  var uploadFn = this.editor.options.uploadImage;

  var doInsert = function (url) {
    self.editor.$content.focus();
    if (self.savedRange) {
      var sel = window.getSelection();
      sel.removeAllRanges();
      sel.addRange(self.savedRange);
    }
    document.execCommand('insertImage', false, url);
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
function VideoPlugin(editor) {
  this.editor = editor;
  this.$popover = null;
  this.savedRange = null;
}

VideoPlugin.prototype.init = function () {
  var self = this;

  this.editor.registerCommand('video', function () {
    self.togglePopover();
  });

  this.buildPopover();
};

VideoPlugin.prototype.buildPopover = function () {
  var self = this;

  this.$popover = $('<div class="editor-video-popover absolute bg-white border border-gray-200 p-3 rounded-md z-50 shadow-lg w-72 text-sm hidden font-sans"></div>');
  
  var $form = $('<div class="flex flex-col gap-3"></div>');
  
  var $urlGroup = $('<div class="flex flex-col gap-1"><label class="font-semibold text-gray-700 m-0">URL do Vídeo (YouTube/Vimeo)</label></div>');
  this.$urlInput = $('<input type="text" placeholder="https://" class="px-2 py-1.5 border border-gray-300 rounded text-sm outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 w-full">');
  $urlGroup.append(this.$urlInput);

  var $btnGroup = $('<div class="flex mt-1"></div>');
  
  var $rightBtns = $('<div class="flex gap-2 ml-auto"></div>');
  var $btnCancel = $('<button type="button" class="px-3 py-1.5 border border-gray-300 bg-white rounded cursor-pointer text-sm text-gray-700 hover:bg-gray-50 transition-colors">Cancelar</button>');
  var $btnSave = $('<button type="button" class="px-4 py-1.5 border-none bg-blue-600 text-white rounded cursor-pointer text-sm font-semibold hover:bg-blue-700 transition-colors">Inserir</button>');
  
  $rightBtns.append($btnCancel, $btnSave);
  $btnGroup.append($rightBtns);

  $form.append($urlGroup, $btnGroup);
  this.$popover.append($form);

  this.editor.$container.append(this.$popover);

  // Evita que clicar no popover faça o editor perder o foco
  this.$popover.on('mousedown', function (e) {
    if (e.target.tagName !== 'INPUT') {
      e.preventDefault();
    }
  });

  $btnCancel.on('click', function () {
    self.togglePopover(false);
  });

  $btnSave.on('click', function () {
    self.insertVideo();
    self.togglePopover(false);
  });

  // Esconde o popover se clicar fora
  $(document).on('mousedown', function (e) {
    var $btn = self.editor.$toolbar.find('[data-name="video"]');
    if (!self.$popover.is(e.target) && self.$popover.has(e.target).length === 0 && !$btn.is(e.target) && $btn.has(e.target).length === 0) {
      self.togglePopover(false);
    }
  });
};

VideoPlugin.prototype.togglePopover = function (forceState) {
  var $btn = this.editor.$toolbar.find('[data-name="video"]');
  if ($btn.length === 0) return;

  var isVisible = forceState !== undefined ? forceState : !this.$popover.is(':visible');

  if (isVisible) {
    if (this.editor.selection && this.editor.selection.isInsideEditor()) {
      this.savedRange = this.editor.selection.getRange();
    } else {
      return;
    }

    this.$urlInput.val('');

    var btnOffset = $btn.position();
    this.$popover.css({
      top: btnOffset.top + $btn.outerHeight() + 5,
      left: btnOffset.left
    });
    this.$popover.show();
    
    // Verifica se o painel vazou pela direita
    if (this.$popover[0].getBoundingClientRect().right > this.editor.$container[0].getBoundingClientRect().right) {
      this.$popover.css('left', btnOffset.left - this.$popover.outerWidth() + $btn.outerWidth());
    }

    var self = this;
    setTimeout(function() {
      self.$urlInput.focus();
    }, 0);

  } else {
    this.$popover.hide();
  }
};

VideoPlugin.prototype.insertVideo = function () {
  if (this.savedRange) {
    var sel = window.getSelection();
    sel.removeAllRanges();
    sel.addRange(this.savedRange);
  } else if (!this.editor.selection || !this.editor.selection.isInsideEditor()) {
    return;
  }

  var url = this.$urlInput.val().trim();
  if (!url || url === 'https://') return;

  var iframeUrl = url;
  
  // Tenta converter links normais em links de Embed embedados
  var ytMatch = url.match(/(?:youtube\.com\/(?:[^\/]+\/.+\/|(?:v|e(?:mbed)?)\/|.*[?&]v=)|youtu\.be\/)([^"&?\/\s]{11})/i);
  if (ytMatch) iframeUrl = 'https://www.youtube.com/embed/' + ytMatch[1];

  var vimeoMatch = url.match(/vimeo\.com\/(\d+)/i);
  if (vimeoMatch) iframeUrl = 'https://player.vimeo.com/video/' + vimeoMatch[1];

  var html = '<iframe width="560" height="315" style="max-width: 100%;" src="' + iframeUrl + '" frameborder="0" allowfullscreen></iframe><p><br></p>';
  document.execCommand('insertHTML', false, html);
  
  this.editor.trigger('change');
  this.editor.updateToolbar();
};

window.VideoPlugin = VideoPlugin;
function FullscreenPlugin(editor) {
  this.editor = editor;
  this.active = false;
}

FullscreenPlugin.prototype.init = function () {
  var self = this;
  this.editor.registerCommand('fullscreen', function () {
    self.toggle();
  });
};

FullscreenPlugin.prototype.toggle = function () {
  this.active = !this.active;
  this.editor.$container.toggleClass('editor-fullscreen', this.active);

  var $btn = this.editor.$toolbar.find('[data-name="fullscreen"]');
  if (this.active) {
    $btn.addClass('active');
  } else {
    $btn.removeClass('active');
  }
};

window.FullscreenPlugin = FullscreenPlugin;
function HistoryPlugin(editor) {
  this.editor = editor;
}

HistoryPlugin.prototype.init = function () {
  var editor = this.editor;

  editor.registerCommand('undo', function () {
    editor.history.undo();
  });

  editor.registerCommand('redo', function () {
    editor.history.redo();
  });
};

window.HistoryPlugin = HistoryPlugin;
function CodeViewPlugin(editor) {
  this.editor = editor;
  this.active = false;
}

CodeViewPlugin.prototype.init = function () {
  var self = this;

  // Cria a estrutura para a visualização de código com syntax highlight e numeração
  this.$wrapper = $('<div class="editor-codeview-wrapper"></div>');
  this.$lines = $('<div class="editor-codeview-lines"></div>');
  this.$highlight = $('<div class="editor-codeview-highlight"></div>');
  this.$textarea = $('<textarea class="editor-codeview-textarea" spellcheck="false" wrap="off"></textarea>');

  this.$wrapper.append(this.$lines, this.$highlight, this.$textarea);
  this.editor.$container.append(this.$wrapper);

  this.editor.registerCommand('codeview', function () {
    self.toggle();
  });

  this.$textarea.on('input', function () {
    self.updateView();
  });

  this.$textarea.on('scroll', function () {
    self.$highlight.scrollTop($(this).scrollTop());
    self.$highlight.scrollLeft($(this).scrollLeft());
    self.$lines.scrollTop($(this).scrollTop());
  });
};

CodeViewPlugin.prototype.formatHtml = function (html) {
  var escaped = html.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  // Regex que busca tudo que estiver entre &lt; e &gt; para pintar de amarelo
  return escaped.replace(/(&lt;(?:(?!&lt;)[\s\S])*?&gt;)/gi, '<span class="html-tag">$1</span>');
};

CodeViewPlugin.prototype.updateView = function () {
  var code = this.$textarea.val();
  
  // Atualiza o destaque de sintaxe
  var highlighted = this.formatHtml(code);
  // Corrige problema de renderização onde quebra de linha final em DIV não ocupa espaço
  if (code && code.charAt(code.length - 1) === '\n') {
    highlighted += ' ';
  }
  this.$highlight.html(highlighted);

  // Atualiza os números das linhas
  var linesCount = code.split('\n').length;
  var linesText = '';
  for (var i = 1; i <= linesCount; i++) {
    linesText += i + '\n';
  }
  this.$lines.text(linesText);
};

CodeViewPlugin.prototype.beautifyHtml = function (html) {
  var tab = '  '; // 2 espaços para a indentação
  var result = '';
  var indent = '';

  // Extrai os blocos <pre> para preservá-los intactos e substitui por um placeholder
  var preBlocks = [];
  html = html.replace(/(<pre[^>]*>[\s\S]*?<\/pre>)/gi, function(match) {
    preBlocks.push(match);
    return '<pre-placeholder id="' + (preBlocks.length - 1) + '"/>';
  });

  // Remove quebras de linha pré-existentes para padronizar do zero
  html = html.replace(/[\r\n]/g, '');

  var tags = html.split(/(<[^>]+>)/g);
  var inlineTags = ['a', 'span', 'b', 'i', 'u', 'strong', 'em', 'strike', 's', 'sub', 'sup', 'code', 'font'];

  for (var i = 0; i < tags.length; i++) {
    var tag = tags[i];
    if (!tag) continue;

    // Se não for uma tag (for apenas um nó de texto solto)
    if (tag.charAt(0) !== '<') {
      result += tag;
      continue;
    }

    var isClosingTag = tag.match(/^<\//);
    var isSelfClosingTag = tag.match(/.*\/>$/) || tag.match(/^<(br|hr|img|input|meta|link|area|base|col|embed|param|source|track|wbr)[^>]*>$/i);
    var isOpeningTag = tag.match(/^<\w/) && !isClosingTag && !isSelfClosingTag;
    
    // Descobre o nome da tag
    var tagNameMatch = tag.match(/^<\/?([a-zA-Z0-9]+)/);
    var tagName = tagNameMatch ? tagNameMatch[1].toLowerCase() : '';
    
    var isInline = inlineTags.indexOf(tagName) !== -1;

    if (isClosingTag && !isInline) {
      indent = indent.substring(tab.length);
      result = result.replace(/[ \t]+$/, '');
      if (result.length > 0 && result.charAt(result.length - 1) !== '\n') result += '\n';
      result += indent + tag + '\n';
    } else if (isOpeningTag && !isInline) {
      result = result.replace(/[ \t]+$/, '');
      if (result.length > 0 && result.charAt(result.length - 1) !== '\n') result += '\n';
      result += indent + tag + '\n';
      indent += tab;
    } else if (isSelfClosingTag && !isInline) {
      result = result.replace(/[ \t]+$/, '');
      if (result.length > 0 && result.charAt(result.length - 1) !== '\n') result += '\n';
      result += indent + tag + '\n';
    } else {
      // Tags inline e de formatação simples
      result += tag;
    }
  }

  result = result.trim();

  // Devolve os blocos <pre> para seus lugares originais preservando toda formatação e espaços nativos
  for (var j = 0; j < preBlocks.length; j++) {
    result = result.replace('<pre-placeholder id="' + j + '"/>', function() { 
      return preBlocks[j]; 
    });
  }

  return result;
};

CodeViewPlugin.prototype.toggle = function () {
  this.active = !this.active;
  var $codeViewBtn = this.editor.$toolbar.find('[data-name="codeview"]');

  if (this.active) {
    var html = this.editor.getContent();
    
    // Aplica a formatação em cascata inteligente no HTML
    html = this.beautifyHtml(html);

    this.$textarea.val(html);
    this.updateView();

    this.editor.$content.hide();
    this.$wrapper.show();
    
    this.editor.$toolbar.find('button').not($codeViewBtn).prop('disabled', true);
    $codeViewBtn.addClass('active');
  } else {
    var val = this.$textarea.val();
    this.editor.setContent(val);
    this.$wrapper.hide();
    this.editor.$content.show();
    
    this.editor.$toolbar.find('button').prop('disabled', false);
    $codeViewBtn.removeClass('active');
  }
};

window.CodeViewPlugin = CodeViewPlugin;