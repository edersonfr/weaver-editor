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

  var buttons = [
    { name: 'bold', label: '<b>B</b>' },
    { name: 'italic', label: '<i>I</i>' },
    { name: 'image', label: '🖼️' },
    { name: 'preview', label: '👁️' },
    { name: 'desktop', label: '🖥️' },
    { name: 'tablet', label: '📱' },
    { name: 'mobile', label: '📲' }
  ];

  var self = this;

  for (var i = 0; i < buttons.length; i++) {
    (function (btn, self) {

      var $btn = $('<button type="button"/>')
        .html(btn.label)
        .on('click', function () {
          if (btn.name === 'desktop' || btn.name === 'tablet' || btn.name === 'mobile') {
            var preview = editor.getPlugin('PreviewPlugin');
            if (preview && preview.active) {
              preview.setViewport(btn.name);
            }
          } else {
            editor.exec(btn.name);
          }

          self.updateState();
        });

      self.buttons[btn.name] = $btn;

      editor.$toolbar.append($btn);

    })(buttons[i], this);
  }
};

ToolbarPlugin.prototype.updateState = function () {
  if (!this.editor.selection) return;

  var formats = this.editor.selection.getActiveFormats();

  for (var key in this.buttons) {
    this.buttons[key].removeClass('active');
  }

  if (formats.bold && this.buttons.bold) {
    this.buttons.bold.addClass('active');
  }

  if (formats.italic && this.buttons.italic) {
    this.buttons.italic.addClass('active');
  }
};