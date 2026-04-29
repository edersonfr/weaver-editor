function PreviewPlugin(editor) {
  this.editor = editor;
  this.active = false;
}

PreviewPlugin.prototype.init = function () {
  this.build();
  this.bind();
};

PreviewPlugin.prototype.build = function () {
  this.$preview = $('<div class="editor-preview"/>').hide();

  this.editor.$container.append(this.$preview);
};

PreviewPlugin.prototype.bind = function () {
  var self = this;

  this.editor.registerCommand('preview', function () {
    self.toggle();
  });
};

PreviewPlugin.prototype.toggle = function () {
  if (this.active) {
    this.disable();
  } else {
    this.enable();
  }
};

PreviewPlugin.prototype.enable = function () {
  var html = this.editor.getContent();

  this.$preview.html(html);

  this.editor.$content.hide();
  this.$preview.show();

  this.active = true;
};

PreviewPlugin.prototype.disable = function () {
  this.$preview.hide();
  this.editor.$content.show();

  this.active = false;
};

window.PreviewPlugin = PreviewPlugin;