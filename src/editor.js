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

  /** Botões registrados para todos os editores da página (registerButton). */
  Editor.buttons = {};

  /**
   * Registra um botão de toolbar para todos os editores. Use o nome dele
   * na opção `toolbar`. Formato igual ao da opção `buttons`.
   * @param {string} name
   * @param {Object} def - { icon|html|text, title, action(editor, $button), isActive(editor) }
   */
  Editor.registerButton = function (name, def) {
    Editor.buttons[name] = def;
  };

  /**
   * Opções que são listas ou mapas SUBSTITUEM o padrão em vez de serem fundidas.
   * Com $.extend(true), arrays eram mesclados por posição: pedir só
   * [['font', ['bold']]] gerava a toolbar padrão inteira com 'redo' no meio.
   */
  Editor.REPLACE_OPTIONS = ['toolbar', 'plugins', 'extraPlugins', 'fontNames', 'previewCss', 'allowedTags', 'allowedAttributes', 'allowedStyles', 'allowedIframeSources', 'forbiddenTags'];

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

    // Área de avisos (erros de upload, IA etc.), lida por leitores de tela
    this.$notice = $('<div class="editor-notice" role="status" aria-live="polite"/>').hide();

    this.$container.append(this.$toolbar, this.$notice, this.$content);
    
    this.isTextarea = this.$el.is('textarea');

    // Se a página tem <label for="..."> para o textarea, ele vira o nome
    // acessível da área de edição (em vez do genérico "Editor de conteúdo")
    var elId = this.$el.attr('id');
    var $label = elId ? $('label[for="' + elId + '"]') : $();
    if ($label.length) {
      if (!$label.attr('id')) $label.attr('id', elId + '-weaver-label');
      this.$content.removeAttr('aria-label').attr('aria-labelledby', $label.attr('id'));
      // Clicar no label foca o editor, já que o textarea fica escondido
      var content = this.$content[0];
      $label.on('click' + this.ns, function (e) {
        e.preventDefault();
        content.focus();
      });
    }

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

    this.rangeFormatter = new RangeFormatter(this);
  };

  // =========================
  // INSERÇÃO E SELEÇÃO (API pública)
  // =========================

  /**
   * Guarda a posição do cursor/seleção, se estiver dentro do editor.
   * Use antes de abrir um modal que tira o foco do editor.
   * @returns {boolean} true se havia seleção no editor
   */
  Editor.prototype.saveSelection = function () {
    var saved = this.selection.isInsideEditor() ? this.selection.serialize() : null;
    if (saved) this._savedSelection = saved;
    return !!saved;
  };

  /**
   * Foca o editor e restaura a seleção salva (por saveSelection ou, na
   * falta dela, a última antes de o editor perder o foco). Sem nenhuma,
   * coloca o cursor no fim do conteúdo.
   * @returns {boolean} true se uma seleção salva foi restaurada
   */
  Editor.prototype.restoreSelection = function () {
    var root = this.$content[0];
    var saved = this._savedSelection || this._blurSelection;

    root.focus();
    if (saved && this.selection.deserialize(saved)) return true;

    var range = document.createRange();
    range.selectNodeContents(root);
    range.collapse(false);
    this.selection.setRange(range);
    return false;
  };

  /** Foca a área de edição, mantendo a seleção que havia. */
  Editor.prototype.focus = function () {
    if (this.selection.isInsideEditor()) {
      this.$content[0].focus();
    } else {
      this.restoreSelection();
    }
  };

  /**
   * Insere HTML (sanitizado) na seleção salva, como um passo de desfazer.
   * @param {string} html
   * @returns {boolean} false se não havia nada para inserir
   */
  Editor.prototype.insertHTML = function (html) {
    this.restoreSelection();
    this.history.save();
    var inserted = this.rangeFormatter.insertHTML(html);
    this._savedSelection = null;
    if (!inserted) return false;

    this.history.save();
    this.updateToolbar();
    this.trigger('change');
    return true;
  };

  /**
   * Insere uma imagem na seleção salva.
   * @param {string} url - http(s), relativa ou data:image (PNG, JPG, GIF, WebP, AVIF)
   * @param {Object} [attrs] - atributos do <img> (alt, style, width...)
   * @returns {boolean} false se a URL for recusada
   */
  Editor.prototype.insertImage = function (url, attrs) {
    var img = this._buildImage(url, attrs);
    return img ? this.insertHTML(img.outerHTML) : false;
  };

  /** @private Cria o <img> num documento inerte; null se a URL for recusada. */
  Editor.prototype._buildImage = function (url, attrs) {
    if (!url || !this.sanitizer.isSafeUrl(url, 'img', 'src')) return null;

    var doc = document.implementation.createHTMLDocument('');
    var img = doc.createElement('img');
    var all = $.extend({}, this.options.imageDefaults, attrs);
    for (var name in all) {
      if (!all.hasOwnProperty(name) || all[name] === null || all[name] === undefined || name === 'src') continue;
      img.setAttribute(name, all[name]);
    }
    img.setAttribute('src', url);
    return img;
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

    // extraPlugins soma aos plugins (automáticos ou da opção `plugins`)
    var extra = this.options.extraPlugins || [];
    for (var x = 0; x < extra.length; x++) {
      if (extra[x] && plugins.indexOf(extra[x]) === -1) plugins = plugins.concat([extra[x]]);
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

  // =========================
  // ACESSIBILIDADE (teclado e leitores de tela)
  // =========================

  Editor.FOCUSABLE = 'button:not([disabled]), input:not([disabled]), textarea:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])';

  /**
   * Transforma um popover (link, vídeo, IA...) num diálogo acessível:
   * role="dialog" com nome, rótulos ligados aos campos, Esc fecha e devolve
   * o foco ao botão que abriu, e Tab circula só dentro do popover.
   * @param {jQuery} $popover
   * @param {{label: string, name: string, close: function}} opts
   */
  Editor.prototype.dialogize = function ($popover, opts) {
    var self = this;
    var prefix = 'weaver' + this.id + '-' + opts.name;

    $popover.attr({ role: 'dialog', 'aria-label': opts.label });

    // <label> sem for: liga ao campo do mesmo grupo
    $popover.find('label').each(function (i) {
      var label = this;
      if (label.htmlFor || label.querySelector('input, textarea, select')) return;
      var field = label.parentNode.querySelector('input, textarea, select');
      if (!field) return;
      if (!field.id) field.id = prefix + '-field-' + i;
      label.htmlFor = field.id;
    });

    // Mensagens de erro descrevem o campo ao lado
    $popover.find('[role="alert"]').each(function (i) {
      var msg = this;
      var field = msg.parentNode.querySelector('input, textarea');
      if (!field) return;
      if (!msg.id) msg.id = prefix + '-error-' + i;
      field.setAttribute('aria-describedby', msg.id);
    });

    $popover.on('keydown', function (e) {
      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        opts.close();
        self.focusToolbarButton(opts.name);
        return;
      }

      if (e.key !== 'Tab') return;

      var focusable = $popover.find(Editor.FOCUSABLE).filter(':visible');
      if (!focusable.length) return;
      var first = focusable[0];
      var last = focusable[focusable.length - 1];

      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    });
  };

  /** Devolve o foco ao botão da barra (ou ao conteúdo, se ele não existir). */
  Editor.prototype.focusToolbarButton = function (name) {
    var $btn = this.$toolbar.find('[data-name="' + name + '"]').first();
    if ($btn.length && $btn.is(':visible')) {
      $btn[0].focus();
    } else {
      this.$content[0].focus();
    }
  };

  /**
   * Navegação por teclado num menu (role="menu"): setas movem entre os itens,
   * Home/End vão às pontas, Enter/Espaço ativam e Esc fecha.
   * @param {jQuery} $menu
   * @param {{items: string, close: function}} opts
   */
  Editor.menuKeyboard = function ($menu, opts) {
    $menu.on('keydown', function (e) {
      var items = $menu.find(opts.items).filter(':visible');
      var index = items.index(document.activeElement);
      var next = null;

      switch (e.key) {
        case 'ArrowDown':
        case 'ArrowRight':
          next = items[(index + 1) % items.length];
          break;
        case 'ArrowUp':
        case 'ArrowLeft':
          next = items[(index - 1 + items.length) % items.length];
          break;
        case 'Home':
          next = items[0];
          break;
        case 'End':
          next = items[items.length - 1];
          break;
        case 'Enter':
        case ' ':
          if (index !== -1) {
            e.preventDefault();
            $(items[index]).trigger('click');
          }
          return;
        case 'Escape':
          e.preventDefault();
          e.stopPropagation();
          opts.close(true);
          return;
        case 'Tab':
          opts.close(false);
          return;
        default:
          return;
      }

      e.preventDefault();
      if (next) next.focus();
    });
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

    // Lembra onde estava o cursor quando o foco sai (ex.: para um modal),
    // para insertHTML/insertImage inserirem no lugar certo
    this.$content.on('blur' + this.ns, function () {
      var saved = self.selection.serialize();
      if (saved) self._blurSelection = saved;
    });

    // Alt+F10 leva o foco para a barra de ferramentas (padrão de editores)
    this.$content.on('keydown' + this.ns, function (e) {
      if (e.altKey && e.key === 'F10') {
        e.preventDefault();
        var first = self.$toolbar.find('button:visible:not([disabled])').first();
        if (first.length) first[0].focus();
      }
    });

    // Barra de ferramentas: setas esquerda/direita andam entre os botões;
    // Esc volta para o texto
    this.$toolbar.on('keydown' + this.ns, function (e) {
      if ($(e.target).closest('[role="menu"]').length) return;

      var buttons = self.$toolbar.find('.editor-toolbar-group > button, .editor-toolbar-group > .editor-dropdown-wrapper > button').filter(':visible:not([disabled])');
      var index = buttons.index(e.target);
      if (index === -1) return;

      if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') {
        e.preventDefault();
        var step = e.key === 'ArrowRight' ? 1 : -1;
        buttons[(index + step + buttons.length) % buttons.length].focus();
      } else if (e.key === 'Escape') {
        e.preventDefault();
        self.$content[0].focus();
      }
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
    $('label').off(this.ns);
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
    // (antes, enviar o formulário nesse modo descartava as edições).
    // Código não alterado: vale o conteúdo do editor (e o HTML original).
    if (this.codeView && this.codeView.active && this.codeView.isModified()) {
      return this.sanitize(this.codeView.$textarea.val());
    }

    var html = Editor.cleanOutput(this.$content.html());

    // Nada foi editado desde o carregamento: devolve o HTML original byte a
    // byte (aspas, entidades, ordem de atributos e formatação do CSS)
    if (this._source && html === this._source.dom) {
      return this._source.html;
    }

    return html;
  };

  /**
   * Indica se o conteúdo continua igual ao último carregado por setContent
   * (ou pelo textarea), ou seja, se o usuário ainda não editou nada.
   * @returns {boolean}
   */
  Editor.prototype.isPristine = function () {
    return !!this._source && Editor.cleanOutput(this.$content.html()) === this._source.dom;
  };

  /**
   * Remove do HTML final os estados visuais do editor (imagem selecionada,
   * marcadores) e devolve o código protegido (<weaver-raw>, atributos
   * renomeados) ao original.
   */
  Editor.cleanOutput = function (html) {
    if (html.indexOf('weaver-') === -1) return html;

    // Documento inerte: o código restaurado (onerror, <script>) não executa
    var holder = HtmlSanitizer.parseInert(html);

    HtmlSanitizer.unprotect(holder);

    var states = holder.querySelectorAll('.weaver-selected');
    for (var i = 0; i < states.length; i++) {
      states[i].classList.remove('weaver-selected');
      if (!states[i].getAttribute('class')) states[i].removeAttribute('class');
    }

    var markers = holder.querySelectorAll('weaver-marker');
    for (var m = 0; m < markers.length; m++) {
      markers[m].parentNode.removeChild(markers[m]);
    }

    return holder.innerHTML;
  };

  /**
   * Mostra um aviso curto dentro do editor, no lugar de alert().
   * @param {string} message
   * @param {{type?: 'error'|'info', timeout?: number}} [opts] timeout 0 = fica até ser trocado
   */
  Editor.prototype.notify = function (message, opts) {
    opts = opts || {};
    var self = this;
    var type = opts.type || 'info';
    var timeout = opts.timeout === undefined ? 6000 : opts.timeout;

    clearTimeout(this._noticeTimer);

    if (!message) {
      this.$notice.hide().text('');
      return;
    }

    this.$notice
      .attr('role', type === 'error' ? 'alert' : 'status')
      .attr('data-type', type)
      .text(message)
      .show();

    if (timeout) {
      this._noticeTimer = setTimeout(function () {
        self.$notice.hide().text('');
      }, timeout);
    }
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

  /**
   * Troca todo o conteúdo do editor. O HTML é guardado: enquanto nada for
   * editado, getContent() devolve exatamente esta string (desde que a
   * sanitização não tenha removido nada dela).
   * @param {string} html
   */
  Editor.prototype.setContent = function (html) {
    html = HtmlSanitizer.toStr(html);
    this._loadContent(html);

    var dom = Editor.cleanOutput(this.$content.html());
    this._source = HtmlSanitizer.serialize(html) === dom ? { html: html, dom: dom } : null;
  };

  /**
   * Carrega HTML no editor sem mudar o HTML de referência (usado pelo
   * desfazer/refazer e pelo code view).
   * @private
   */
  Editor.prototype._loadContent = function (html) {
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

  // =========================
  // DEPENDÊNCIAS EXTERNAS (ícones e fontes)
  // =========================

  Editor.GOOGLE_FONTS_URL = 'https://fonts.googleapis.com/css2?family=Lato&family=Montserrat&family=Open+Sans&family=Oswald&family=Poppins&family=Roboto&display=swap';

  /** Estado do carregamento dos ícones na página: 'loading' | 'loaded' | 'failed' */
  Editor.iconsState = null;

  /**
   * Carrega o Lucide numa versão FIXA (nunca @latest): uma versão nova
   * publicada no CDN não muda nem quebra o editor sem aviso. Com
   * `iconsIntegrity`, o navegador recusa o arquivo se ele for adulterado.
   * `iconsUrl: false` não carrega nada (use quando a página já tem o Lucide
   * ou quando ele é servido pelo seu próprio domínio).
   */
  Editor.prototype.loadIcons = function () {
    if (window.lucide) {
      Editor.iconsState = 'loaded';
      return;
    }

    var url = this.options.iconsUrl;
    if (!url) return;
    if (document.getElementById('lucide-script')) return; // outro editor já pediu

    var script = document.createElement('script');
    script.id = 'lucide-script';
    script.src = url;
    script.crossOrigin = 'anonymous';
    script.referrerPolicy = 'no-referrer';
    if (this.options.iconsIntegrity) {
      script.integrity = this.options.iconsIntegrity;
    }

    Editor.iconsState = 'loading';

    script.onload = function () {
      Editor.iconsState = window.lucide ? 'loaded' : 'failed';
      $('.wysiwyg-editor').each(function () {
        Editor.renderIcons(this);
      });
    };

    // CDN fora do ar, bloqueado ou com integridade inválida: mostra o nome
    // dos botões em vez de deixar a barra cheia de botões em branco
    script.onerror = function () {
      Editor.iconsState = 'failed';
      if (window.console && console.warn) console.warn('Weaver: não foi possível carregar os ícones de ' + url);
      $('.wysiwyg-editor').each(function () {
        Editor.renderIcons(this);
      });
    };

    document.head.appendChild(script);
  };

  /**
   * Desenha os ícones dentro de um elemento do editor (barra, menus).
   * Limitado ao editor: antes, createIcons() sem root trocava qualquer
   * <i data-lucide> da página hospedeira.
   */
  Editor.renderIcons = function (root) {
    if (!root) return;

    if (window.lucide && window.lucide.createIcons) {
      window.lucide.createIcons({ root: root });
      return;
    }

    if (Editor.iconsState === 'failed') {
      $(root).find('i[data-lucide]').each(function () {
        var $icon = $(this);
        var $owner = $icon.closest('button, [title]');
        // Botão que já tem texto visível (ex.: "Formatos ▾"): o ícone só enfeita
        var hasText = $.trim($owner.clone().find('i[data-lucide], .weaver-icon-fallback').remove().end().text()) !== '';
        var label = $owner.attr('aria-label') || $owner.attr('title') || '';
        if (hasText || !label) {
          $icon.remove();
          return;
        }
        $icon.replaceWith($('<span class="weaver-icon-fallback"/>').text(label));
      });
    }
  };

  /**
   * Google Fonts é opcional (`googleFonts: false`): cada carregamento envia
   * o IP do visitante ao Google, o que pede atenção à LGPD/GDPR.
   */
  Editor.prototype.loadFonts = function () {
    if (!this.options.googleFonts || document.getElementById('weaver-google-fonts')) return;

    var fontLink = document.createElement('link');
    fontLink.id = 'weaver-google-fonts';
    fontLink.rel = 'stylesheet';
    fontLink.referrerPolicy = 'no-referrer';
    fontLink.href = Editor.GOOGLE_FONTS_URL;
    document.head.appendChild(fontLink);
  };

  Editor.prototype.injectStyles = function () {
    this.loadIcons();
    this.loadFonts();

    if (document.getElementById('wysiwyg-editor-styles')) return;

    // Convertido para concatenação de strings para garantir a compatibilidade com o ES5
    var css = 
      '.weaver-icon-fallback { font-size: 11px; line-height: 1; padding: 0 2px; white-space: nowrap; }\n' +
      '.wysiwyg-editor .editor-toolbar-group { flex-wrap: wrap; }\n' +
      '.wysiwyg-editor button:has(.weaver-icon-fallback) { width: auto; min-width: 32px; }\n' +
      '.wysiwyg-editor button:focus-visible, .wysiwyg-editor [role="menuitem"]:focus-visible, .wysiwyg-editor .editor-table-grid:focus-visible, .wysiwyg-editor input:focus-visible, .wysiwyg-editor textarea:focus-visible { outline: 2px solid #2563eb !important; outline-offset: 1px; }\n' +
      '.wysiwyg-editor .editor-notice { padding: 6px 12px; font-size: 13px; border-bottom: 1px solid #e5e7eb; background: #eff6ff; color: #1e40af; }\n' +
      '.wysiwyg-editor .editor-notice[data-type="error"] { background: #fef2f2; color: #b91c1c; }\n' +
      '.wysiwyg-editor .editor-image-resize { position: absolute; width: 12px; height: 12px; background: #2563eb; border: 2px solid #fff; border-radius: 2px; cursor: nwse-resize; z-index: 51; touch-action: none; box-shadow: 0 0 0 1px #2563eb; }\n' +
      '.wysiwyg-editor .editor-image-alt { display: flex; gap: 4px; align-items: center; }\n' +
      '.wysiwyg-editor .editor-image-alt input { height: 32px; width: 180px; padding: 0 8px; border: 1px solid #d1d5db; border-radius: 4px; font-size: 13px; }\n' +
      '.wysiwyg-editor weaver-raw { display: inline-block; margin: 0 2px; padding: 0 6px; border: 1px dashed #9ca3af; border-radius: 3px; background: #f3f4f6; color: #4b5563; font: 12px/1.6 Menlo, Monaco, Consolas, monospace; cursor: default; user-select: none; vertical-align: middle; }\n' +
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
      '.editor-content img.weaver-selected {\n' +
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
    // Plugins somados aos automáticos (sem desligar link, tabela, imagem...)
    extraPlugins: [],
    // Botões próprios: { nome: { icon|html|text, title, action(editor, $button), isActive(editor) } }
    buttons: {},
    // Atributos aplicados a toda imagem inserida (ex.: { style: 'width:100%;height:auto' })
    imageDefaults: null,
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
    onAiGenerate: null,
    // Ícones: versão fixa do Lucide. Para servir do seu domínio, aponte para
    // o arquivo local; para usar o Lucide que a página já carrega, use false.
    iconsUrl: 'https://unpkg.com/lucide@0.525.0/dist/umd/lucide.min.js',
    // Hash SRI opcional do arquivo de ícones (ex.: 'sha384-...'); veja o README
    iconsIntegrity: null,
    // Imagens: tamanho máximo do arquivo (bytes) e largura máxima ao
    // embutir em base64 (sem uploadImage), para não inchar o HTML salvo
    maxImageSize: 5 * 1024 * 1024,
    imageMaxWidth: 1600,
    // Carrega as fontes do Google usadas no menu de fontes (editor e preview)
    googleFonts: true
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