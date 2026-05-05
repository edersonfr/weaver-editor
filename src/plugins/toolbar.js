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
    { name: 'undo', label: '↶' },
    { name: 'redo', label: '↷' },
    { name: 'bold', label: '<b>B</b>' },
    { name: 'italic', label: '<i>I</i>' },
    { name: 'underline', label: '<u>U</u>' },
    { name: 'strikethrough', label: '<s>S</s>' },
    { name: 'ul', label: '• Lista' },
    { name: 'ol', label: '1. Lista' },
    { name: 'alignLeft', label: '⇤' },
    { name: 'alignCenter', label: '↔' },
    { name: 'alignRight', label: '⇥' },
    { name: 'link', label: '🔗' },
    { name: 'table', label: '📊' },
    { name: 'image', label: '🖼️' },
    { name: 'preview', label: '👁️' },
    { name: 'desktop', label: '🖥️' },
    { name: 'tablet', label: '📱' },
    { name: 'mobile', label: '📲' },
    { name: 'codeview', label: '&lt;/&gt;' }
  ];

  var self = this;

  for (var i = 0; i < buttons.length; i++) {
    (function (btn, self) {

      var $btn = $('<button type="button"/>')
        .attr('data-name', btn.name)
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

  if (formats.link && this.buttons.link) {
    this.buttons.link.addClass('active');
  }

  // Verifica o estado nativo dos comandos executados via execCommand
  var nativeCommands = {
    'underline': 'underline',
    'strikethrough': 'strikeThrough',
    'ul': 'insertUnorderedList',
    'ol': 'insertOrderedList',
    'alignLeft': 'justifyLeft',
    'alignCenter': 'justifyCenter',
    'alignRight': 'justifyRight'
  };

  for (var btnName in nativeCommands) {
    if (this.buttons[btnName] && document.queryCommandState(nativeCommands[btnName])) {
      this.buttons[btnName].addClass('active');
    }
  }
};