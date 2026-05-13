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