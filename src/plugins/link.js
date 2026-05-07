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

  this.$popover = $('<div class="editor-link-popover" style="display: none; position: absolute; background: #fff; border: 1px solid #dae0e5; padding: 12px; border-radius: 4px; z-index: 100; box-shadow: 0 4px 12px rgba(0,0,0,0.15); width: 280px; font-family: -apple-system, BlinkMacSystemFont, \'Segoe UI\', Roboto, sans-serif; font-size: 13px;"></div>');
  
  var $form = $('<div style="display: flex; flex-direction: column; gap: 10px;"></div>');
  
  var $textGroup = $('<div style="display: flex; flex-direction: column; gap: 4px;"><label style="font-weight: 600; color: #333; margin: 0;">Texto de Exibição</label></div>');
  this.$textInput = $('<input type="text" placeholder="Texto do link" style="padding: 6px 8px; border: 1px solid #ccc; border-radius: 3px; font-size: 13px; outline: none; box-sizing: border-box; width: 100%;">');
  $textGroup.append(this.$textInput);

  var $urlGroup = $('<div style="display: flex; flex-direction: column; gap: 4px;"><label style="font-weight: 600; color: #333; margin: 0;">URL</label></div>');
  this.$urlInput = $('<input type="text" placeholder="https://" style="padding: 6px 8px; border: 1px solid #ccc; border-radius: 3px; font-size: 13px; outline: none; box-sizing: border-box; width: 100%;">');
  $urlGroup.append(this.$urlInput);

  var $targetGroup = $('<label style="display: flex; align-items: center; gap: 6px; cursor: pointer; color: #333; margin: 0;"><input type="checkbox" checked> Abrir em nova aba</label>');
  this.$targetInput = $targetGroup.find('input');

  var $btnGroup = $('<div style="display: flex; margin-top: 4px;"></div>');
  
  this.$btnUnlink = $('<button type="button" style="padding: 6px 10px; border: 1px solid #dc3545; color: #dc3545; background: #fff; border-radius: 3px; cursor: pointer; font-size: 13px;">Remover</button>');
  
  var $rightBtns = $('<div style="display: flex; gap: 6px; margin-left: auto;"></div>');
  var $btnCancel = $('<button type="button" style="padding: 6px 10px; border: 1px solid #ccc; background: #fff; border-radius: 3px; cursor: pointer; font-size: 13px; color: #333;">Cancelar</button>');
  var $btnSave = $('<button type="button" style="padding: 6px 12px; border: none; background: #007bff; color: #fff; border-radius: 3px; cursor: pointer; font-size: 13px; font-weight: 600;">Salvar</button>');
  
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