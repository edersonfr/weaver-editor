function AiPlugin(editor) {
  this.editor = editor;
  this.$popover = null;
  this.savedRange = null;
}

AiPlugin.prototype.init = function () {
  var self = this;

  this.rangeFormatter = new RangeFormatter(this.editor);

  this.editor.registerCommand('ai', function () {
    self.togglePopover();
  });

  this.buildPopover();
};

AiPlugin.prototype.buildPopover = function () {
  var self = this;

  this.$popover = $('<div class="editor-ai-popover absolute bg-white border border-gray-200 p-3 rounded-md z-50 shadow-lg w-80 text-sm hidden font-sans"></div>');
  
  var $form = $('<div class="flex flex-col gap-3"></div>');
  
  var $promptGroup = $('<div class="flex flex-col gap-1"><label class="font-semibold text-gray-700 m-0 flex items-center"><i data-lucide="sparkles" class="w-4 h-4 mr-1 text-purple-600"></i> IA: Descrever Produto</label></div>');
  this.$promptInput = $('<textarea rows="3" placeholder="Ex: Crie uma descrição persuasiva para uma camiseta preta de algodão..." class="px-2 py-1.5 border border-gray-300 rounded text-sm outline-none focus:border-purple-500 focus:ring-1 focus:ring-purple-500 w-full resize-none"></textarea>');
  $promptGroup.append(this.$promptInput);

  // Erro mostrado no próprio popover (antes era um alert() que travava a página)
  this.$error = $('<div class="editor-ai-error text-xs text-red-600 hidden" role="alert"></div>');
  $promptGroup.append(this.$error);

  var $btnGroup = $('<div class="flex mt-1"></div>');
  
  var $rightBtns = $('<div class="flex gap-2 ml-auto"></div>');
  var $btnCancel = $('<button type="button" class="px-3 py-1.5 border border-gray-300 bg-white rounded cursor-pointer text-sm text-gray-700 hover:bg-gray-50 transition-colors">Cancelar</button>');
  this.$btnGenerate = $('<button type="button" class="px-4 py-1.5 border-none bg-purple-600 text-white rounded cursor-pointer text-sm font-semibold hover:bg-purple-700 transition-colors flex items-center justify-center min-w-[80px]">Gerar</button>');
  
  $rightBtns.append($btnCancel, this.$btnGenerate);
  $btnGroup.append($rightBtns);

  $form.append($promptGroup, $btnGroup);
  this.$popover.append($form);

  this.editor.$container.append(this.$popover);

  // Diálogo acessível: rótulos ligados, Esc fecha e Tab fica no popover
  this.editor.dialogize(this.$popover, {
    name: 'ai',
    label: 'Assistente de IA',
    close: function () { self.togglePopover(false); }
  });

  this.$popover.on('mousedown', function (e) {
    if (e.target.tagName !== 'INPUT' && e.target.tagName !== 'TEXTAREA') {
      e.preventDefault();
    }
  });

  $btnCancel.on('click', function () {
    self.togglePopover(false);
  });

  this.$btnGenerate.on('click', function () {
    self.generateDescription();
  });

  // Ctrl+Enter (Cmd+Enter no Mac) gera sem precisar sair do campo
  this.$promptInput.on('keydown', function (e) {
    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
      e.preventDefault();
      self.generateDescription();
    }
  });

  $(document).on('mousedown' + this.editor.ns, function (e) {
    var $btn = self.editor.$toolbar.find('[data-name="ai"]');
    if (!self.$popover.is(e.target) && self.$popover.has(e.target).length === 0 && !$btn.is(e.target) && $btn.has(e.target).length === 0) {
      self.togglePopover(false);
    }
  });
};

AiPlugin.prototype.togglePopover = function (forceState) {
  var $btn = this.editor.$toolbar.find('[data-name="ai"]');
  if ($btn.length === 0) return;

  var isVisible = forceState !== undefined ? forceState : !this.$popover.is(':visible');

  if (isVisible) {
    if (this.editor.selection && this.editor.selection.isInsideEditor()) {
      this.savedRange = this.editor.selection.getRange();
    } else {
      return;
    }

    this.$promptInput.val('');
    this.$error.text('').addClass('hidden').hide();
    this.$btnGenerate.html('Gerar').prop('disabled', false).removeAttr('aria-busy');

    var btnOffset = $btn.position();
    this.$popover.css({
      top: btnOffset.top + $btn.outerHeight() + 5,
      left: btnOffset.left
    });
    this.$popover.show();
    
    if (this.$popover[0].getBoundingClientRect().right > this.editor.$container[0].getBoundingClientRect().right) {
      this.$popover.css('left', btnOffset.left - this.$popover.outerWidth() + $btn.outerWidth());
    }

    var self = this;
    setTimeout(function() {
      self.$promptInput.focus();
    }, 0);

  } else {
    this.$popover.hide();
  }
};

AiPlugin.prototype.generateDescription = function () {
  var self = this;
  var prompt = this.$promptInput.val().trim();
  
  if (!prompt) {
    this.$promptInput.focus();
    return;
  }

  this.$error.text('').addClass('hidden').hide();
  this.$btnGenerate.html('<i data-lucide="loader-2" class="w-4 h-4 mr-2 animate-spin" aria-hidden="true"></i> Gerando...').prop('disabled', true).attr('aria-busy', 'true');
  
  WysiwygEditor.renderIcons(this.$btnGenerate[0]);

  function handleSuccess(html) {
    self.insertHtml(html);
    self.togglePopover(false);
  }

  function handleError(errorMsg) {
    self.$error.text('Não foi possível gerar o conteúdo: ' + (errorMsg || 'falha na comunicação com a API.')).removeClass('hidden').show();
    self.$btnGenerate.html('Gerar').prop('disabled', false).removeAttr('aria-busy');
    self.$promptInput.focus();
  }

  // 1. Caso o desenvolvedor tenha informado um callback customizado (ex: onAiGenerate)
  if (typeof this.editor.options.onAiGenerate === 'function') {
    this.editor.options.onAiGenerate(prompt, function(html, error) {
      if (error) {
        handleError(error);
      } else {
        handleSuccess(html);
      }
    }, this.editor);
    return;
  }

  // 2. Chamada AJAX padrão para o endpoint da API de IA (ex: ai-api.php)
  var endpoint = this.editor.options.aiEndpoint || 'ai-api.php';

  $.ajax({
    url: endpoint,
    type: 'POST',
    contentType: 'application/json',
    data: JSON.stringify({ prompt: prompt }),
    dataType: 'json',
    success: function(response) {
      if (response && response.success && response.html) {
        handleSuccess(response.html);
      } else if (response && response.error) {
        handleError(response.error);
      } else {
        handleError('Resposta inválida do servidor.');
      }
    },
    error: function(xhr, status, error) {
      // O backend devolve { error: "mensagem" } com o status HTTP adequado
      var message = xhr && xhr.responseJSON && xhr.responseJSON.error;
      handleError(message || error || 'Erro na requisição AJAX para ' + endpoint);
    }
  });
};

AiPlugin.prototype.insertHtml = function (html) {
  if (this.savedRange) {
    var sel = window.getSelection();
    sel.removeAllRanges();
    sel.addRange(this.savedRange);
  } else if (!this.editor.selection || !this.editor.selection.isInsideEditor()) {
    return;
  }

  // A resposta da IA é conteúdo não confiável (pode ser induzida via prompt
  // a devolver <script> ou onerror); insertHTML sempre sanitiza.
  this.editor.history.save();
  this.rangeFormatter.insertHTML(String(html || ''));
  this.editor.history.save();

  this.editor.trigger('change');
  this.editor.updateToolbar();
};

window.AiPlugin = AiPlugin;