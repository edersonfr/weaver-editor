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

  this.$popover = $('<div class="editor-video-popover" style="display: none; position: absolute; background: #fff; border: 1px solid #dae0e5; padding: 12px; border-radius: 4px; z-index: 100; box-shadow: 0 4px 12px rgba(0,0,0,0.15); width: 280px; font-family: -apple-system, BlinkMacSystemFont, \'Segoe UI\', Roboto, sans-serif; font-size: 13px;"></div>');
  
  var $form = $('<div style="display: flex; flex-direction: column; gap: 10px;"></div>');
  
  var $urlGroup = $('<div style="display: flex; flex-direction: column; gap: 4px;"><label style="font-weight: 600; color: #333; margin: 0;">URL do Vídeo (YouTube/Vimeo)</label></div>');
  this.$urlInput = $('<input type="text" placeholder="https://" style="padding: 6px 8px; border: 1px solid #ccc; border-radius: 3px; font-size: 13px; outline: none; box-sizing: border-box; width: 100%;">');
  $urlGroup.append(this.$urlInput);

  var $btnGroup = $('<div style="display: flex; margin-top: 4px;"></div>');
  
  var $rightBtns = $('<div style="display: flex; gap: 6px; margin-left: auto;"></div>');
  var $btnCancel = $('<button type="button" style="padding: 6px 10px; border: 1px solid #ccc; background: #fff; border-radius: 3px; cursor: pointer; font-size: 13px; color: #333;">Cancelar</button>');
  var $btnSave = $('<button type="button" style="padding: 6px 12px; border: none; background: #007bff; color: #fff; border-radius: 3px; cursor: pointer; font-size: 13px; font-weight: 600;">Inserir</button>');
  
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