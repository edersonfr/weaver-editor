(function ($) {

  function Editor(element, options) {
    this.$el = $(element);
    this.options = Editor.mergeOptions(Editor.defaults, options || {});
    this.id = ++Editor.instanceCount;
    this.ns = '.weaver' + this.id; // namespace dos eventos desta instância

    this.plugins = [];
    this.commands = {};
    this.state = {};

    this.init();
  }

  Editor.instanceCount = 0;

  /**
   * Opções que são listas ou mapas SUBSTITUEM o padrão em vez de serem fundidas.
   * Com $.extend(true), arrays eram mesclados por posição: pedir só
   * [['font', ['bold']]] gerava a toolbar padrão inteira com 'redo' no meio.
   */
  Editor.REPLACE_OPTIONS = ['toolbar', 'plugins', 'fontNames', 'previewCss', 'allowedTags', 'allowedAttributes', 'allowedStyles', 'allowedIframeSources'];

  Editor.mergeOptions = function (defaults, options) {
    var merged = $.extend(true, {}, defaults);

    for (var key in options) {
      if (!options.hasOwnProperty(key)) continue;
      var value = options[key];

      if (Editor.REPLACE_OPTIONS.indexOf(key) !== -1 || $.isArray(value) || !$.isPlainObject(value)) {
        merged[key] = $.isArray(value) ? value.slice() : value;
      } else {
        merged[key] = $.extend(true, {}, merged[key], value);
      }
    }

    merged.toolbar = Editor.normalizeToolbar(merged.toolbar);
    return merged;
  };

  /**
   * Aceita grupos sem lista de botões (['color']) usando o nome do grupo
   * como botão/alias, como no Summernote.
   */
  Editor.normalizeToolbar = function (toolbar) {
    var normalized = [];
    if (!$.isArray(toolbar)) return normalized;

    for (var i = 0; i < toolbar.length; i++) {
      var group = toolbar[i];
      if (typeof group === 'string') {
        normalized.push([group, [group]]);
      } else if ($.isArray(group) && group.length) {
        var buttons = $.isArray(group[1]) ? group[1].slice() : [group[0]];
        normalized.push([group[0], buttons]);
      }
    }
    return normalized;
  };

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
      
      // Guarda o valor inicial do textarea; ele é carregado (sanitizado) em initCore
      this.initialContent = this.$el.val();

      // Garante a sincronização absoluta no momento do envio do formulário
      var self = this;
      this.$el.closest('form').on('submit' + this.ns, function() {
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
    this.sanitizer = new HtmlSanitizer(this.options);
    this.commandRegistry = new CommandRegistry(this);
    this.selection = new SelectionManager(this);

    // Conteúdo inicial vindo do textarea: nunca entra sem sanitização
    if (this.initialContent) {
      this.setContent(this.initialContent);
    }

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
        'fullscreen': window.FullscreenPlugin,
        'ai': window.AiPlugin
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
      // Nome estável para getPlugin(), mesmo com o código minificado
      if (!plugin.name) plugin.name = Editor.pluginNameOf(plugins[i]);
      this.plugins.push(plugin);

      if (plugin.init) {
        plugin.init();
      }
    }
  };

  Editor.PLUGIN_NAMES = [
    'ToolbarPlugin', 'BasicCommandsPlugin', 'SanitizerPlugin', 'NormalizerPlugin', 'HistoryPlugin',
    'LinkPlugin', 'TablePlugin', 'ImagePlugin', 'VideoPlugin', 'CodeViewPlugin', 'PreviewPlugin',
    'FullscreenPlugin', 'AiPlugin'
  ];

  Editor.pluginNameOf = function (PluginClass) {
    if (PluginClass.pluginName) return PluginClass.pluginName;
    for (var i = 0; i < Editor.PLUGIN_NAMES.length; i++) {
      if (window[Editor.PLUGIN_NAMES[i]] === PluginClass) return Editor.PLUGIN_NAMES[i];
    }
    return PluginClass.name || '';
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

    // Enter cria <p> em vez de <div> (Chrome/Edge); ajuda a manter o HTML limpo
    try {
      document.execCommand('defaultParagraphSeparator', false, 'p');
    } catch (e) { /* navegador sem suporte */ }

    this.$content.on('input' + this.ns, function (e) {
      // A primeira linha digitada no Chrome fica como texto solto na raiz;
      // envolve num <p> (fora de composição de IME, para não atrapalhar acentos)
      var oe = e.originalEvent;
      var root = self.$content[0];
      if (!(oe && oe.isComposing) && root.firstChild && root.firstChild.nodeType === 3 && /\S/.test(root.firstChild.nodeValue)) {
        self.selection.ensureBlock();
      }

      self.trigger('change');
    });

    this.$content.on('keyup' + this.ns + ' mouseup' + this.ns, function () {
      self.updateToolbar();
    });
  };

  /**
   * Remove o editor da página: desfaz todos os eventos (inclusive os de
   * document), devolve o textarea com o conteúdo atual e libera a instância.
   */
  Editor.prototype.destroy = function () {
    for (var i = 0; i < this.plugins.length; i++) {
      if (this.plugins[i].destroy) this.plugins[i].destroy();
    }

    if (this.history) clearTimeout(this.history.timeout);

    var content = this.getContent();

    $(document).off(this.ns);
    $(window).off(this.ns);
    this.$el.closest('form').off(this.ns);
    this.$content.off(this.ns);

    if (this.isTextarea) {
      this.$el.val(content).show();
    }

    this.$container.remove();
    this.$el.removeData('weaver');
    this.plugins = [];
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
    // O conteúdo já entrou sanitizado (setContent, insertHTML, colar, IA, code view).
    // Importante: sanitize também no servidor. Sanitização no navegador não é
    // uma barreira de segurança, pois o POST pode ser forjado.

    // Com o code view aberto, o conteúdo vigente é o que está no código
    // (antes, enviar o formulário nesse modo descartava as edições)
    if (this.codeView && this.codeView.active) {
      return this.sanitize(this.codeView.$textarea.val());
    }

    return this.$content.html();
  };

  /**
   * Sanitiza um HTML com as regras deste editor.
   * @param {string} html
   * @returns {string}
   */
  Editor.prototype.sanitize = function (html) {
    return this.sanitizer.sanitize(html);
  };

  Editor.prototype.getPlugin = function (name) {
    for (var i = 0; i < this.plugins.length; i++) {
      // `name` é definido em initPlugins (constructor.name muda ao minificar)
      if (this.plugins[i].name === name) {
        return this.plugins[i];
      }
    }
    return null;
  };

  Editor.prototype.setContent = function (html) {
    // Sempre sanitiza e insere nós vindos de um documento inerte: nenhum
    // <script> ou handler (onerror, onload...) chega a executar.
    var content = this.$content[0];

    while (content.firstChild) {
      content.removeChild(content.firstChild);
    }

    content.appendChild(this.sanitizer.toFragment(html));
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
      '  font-family: Menlo, Monaco, Consolas, "Courier New", monospace !important;\n' +
      '  font-size: 14px !important;\n' +
      '  line-height: 1.5 !important;\n' +
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
      '  font-family: Menlo, Monaco, Consolas, "Courier New", monospace !important;\n' +
      '  font-size: 14px !important;\n' +
      '  line-height: 1.5 !important;\n' +
      '  tab-size: 4 !important;\n' +
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
      '.editor-codeview-textarea::selection {\n' +
      '  color: transparent !important;\n' +
      '  background: rgba(100, 150, 255, 0.3) !important;\n' +
      '}\n' +
      '.editor-codeview-textarea::-moz-selection {\n' +
      '  color: transparent !important;\n' +
      '  background: rgba(100, 150, 255, 0.3) !important;\n' +
      '}\n' +
      '.editor-codeview-highlight {\n' +
      '  color: #e0e0e0;\n' +
      '  z-index: 1;\n' +
      '  pointer-events: none;\n' +
      '  overflow: auto;\n' +
      '}\n' +
      '.editor-codeview-highlight .html-tag {\n' +
      '  color: #f9eb26;\n' +
      '}\n';

    // Estilos base (equivalentes às classes Tailwind usadas): o editor
    // funciona mesmo em páginas sem Tailwind
    if (window.WeaverBaseStyles) {
      css = window.WeaverBaseStyles + '\n' + css;
    }

    var style = document.createElement('style');
    style.id = 'wysiwyg-editor-styles';
    style.textContent = css;

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
      ['insert', ['link', 'table', 'image', 'video', 'hr', 'ai']],
      ['view', ['preview', 'fullscreen', 'showBlocks', 'codeview']]
    ],
    fontNames: null,
    placeholder: '',
    height: null,
    aiEndpoint: 'ai-api.php',
    onAiGenerate: null
  };

  // =========================
  // JQUERY PLUGIN
  // =========================
  $.fn.weaver = function (options) {
    return this.each(function () {
      var existing = $(this).data('weaver');

      // $('#x').weaver('destroy') remove o editor
      if (options === 'destroy') {
        if (existing) existing.destroy();
        return;
      }

      // Inicializar duas vezes o mesmo elemento criava dois editores
      if (existing) return;

      var editor = new Editor(this, options);
      $(this).data('weaver', editor);
    });
  };

  $.fn.wysiwygEditor = $.fn.weaver;

  window.WysiwygEditor = Editor;

})(jQuery);