function FullscreenPlugin(editor) {
  this.editor = editor;
  this.active = false;
}

FullscreenPlugin.prototype.init = function () {
  var self = this;
  this.editor.registerCommand('fullscreen', function () {
    self.toggle();
  });
  this.editor.registerCommand('closeFullscreen', function () {
    if (self.active) self.toggle();
  });

  $(document).on('keydown' + this.editor.ns, function(e) {
    if (e.key === 'Escape' && self.active) {
      self.toggle();
    }
  });
};

FullscreenPlugin.prototype.toggle = function () {
  this.active = !this.active;
  this.editor.$container.toggleClass('editor-fullscreen', this.active);

  var $btn = this.editor.$toolbar.find('[data-name="fullscreen"]');
  var $closeBtn = this.editor.$toolbar.find('[data-name="closeFullscreen"]');
  var $closeBtnGroup = $closeBtn.closest('.editor-toolbar-group');

  if (this.active) {
    $btn.hide();
    $closeBtn.removeClass('hidden');
    $closeBtnGroup.removeClass('hidden');
  } else {
    $btn.show();
    $closeBtn.addClass('hidden');
    $closeBtnGroup.addClass('hidden');
  }
};

window.FullscreenPlugin = FullscreenPlugin;