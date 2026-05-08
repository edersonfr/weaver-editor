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