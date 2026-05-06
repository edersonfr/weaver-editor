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
    { name: 'removeFormat', label: '🧹', title: 'Remover Formatação' },
    { name: 'fontName', type: 'select', title: 'Fonte', options: [
      { label: 'Arial', value: 'Arial' },
      { label: 'Courier New', value: 'Courier New' },
      { label: 'Georgia', value: 'Georgia' },
      { label: 'Tahoma', value: 'Tahoma' },
      { label: 'Times New Roman', value: 'Times New Roman' },
      { label: 'Verdana', value: 'Verdana' },
      { label: 'Roboto', value: 'Roboto' },
      { label: 'Open Sans', value: 'Open Sans' },
      { label: 'Lato', value: 'Lato' },
      { label: 'Montserrat', value: 'Montserrat' },
      { label: 'Poppins', value: 'Poppins' },
      { label: 'Oswald', value: 'Oswald' }
    ]},
    { name: 'fontSize', type: 'select', title: 'Tamanho', options: [
      { label: '8px', value: '8' },
      { label: '10px', value: '10' },
      { label: '12px', value: '12' },
      { label: '14px', value: '14' },
      { label: 'Padrão (16px)', value: '16' },
      { label: '18px', value: '18' },
      { label: '24px', value: '24' },
      { label: '36px', value: '36' },
      { label: '48px', value: '48' },
      { label: '72px', value: '72' }
    ]},
    { name: 'formatBlock', type: 'select', title: 'Formatos', options: [
      { label: 'Parágrafo', value: 'P' },
      { label: 'Título 1', value: 'H1' },
      { label: 'Título 2', value: 'H2' },
      { label: 'Título 3', value: 'H3' },
      { label: 'Título 4', value: 'H4' },
      { label: 'Título 5', value: 'H5' },
      { label: 'Título 6', value: 'H6' },
      { label: 'Citação', value: 'BLOCKQUOTE' }
    ]},
    { name: 'bold', label: '<b>B</b>' },
    { name: 'italic', label: '<i>I</i>' },
    { name: 'underline', label: '<u>U</u>' },
    { name: 'strikethrough', label: '<s>S</s>' },
    { name: 'foreColor', type: 'color', title: 'Cor da Fonte' },
    { name: 'backColor', type: 'color', title: 'Cor de Destaque' },
    { name: 'ul', label: '• Lista' },
    { name: 'ol', label: '1. Lista' },
    { name: 'outdent', label: '⇤ Menos Margem' },
    { name: 'indent', label: '⇥ Mais Margem' },
    { name: 'alignLeft', label: '⇤' },
    { name: 'alignCenter', label: '↔' },
    { name: 'alignRight', label: '⇥' },
    { name: 'justifyFull', label: '≡', title: 'Justificado' },
    { name: 'link', label: '🔗' },
    { name: 'table', label: '📊' },
    { name: 'image', label: '🖼️' },
    { name: 'video', label: '🎥', title: 'Inserir Vídeo' },
    { name: 'preview', label: '👁️' },
    { name: 'desktop', label: '🖥️' },
    { name: 'tablet', label: '📱' },
    { name: 'mobile', label: '📲' },
    { name: 'fullscreen', label: '⛶', title: 'Tela Cheia' },
    { name: 'showBlocks', label: '🔲', title: 'Mostrar Blocos' },
    { name: 'codeview', label: '&lt;/&gt;' }
  ];

  var self = this;

  for (var i = 0; i < buttons.length; i++) {
    (function (btn, self) {
      var $element;
      var type = btn.type || 'button';

      if (type === 'select') {
        $element = $('<select/>').attr('data-name', btn.name).attr('title', btn.title || '');
        $element.append($('<option/>').val('').text(btn.title || 'Selecione...'));
        
        for(var j = 0; j < btn.options.length; j++) {
          $element.append($('<option/>').val(btn.options[j].value).text(btn.options[j].label));
        }
        
        $element.on('change', function () {
          if ($(this).val()) {
            editor.exec(btn.name, $(this).val());
            $(this).prop('selectedIndex', 0); // Reseta para continuar escolhendo depois
          }
          self.updateState();
        });
      } else if (type === 'color') {
        $element = $('<input type="color"/>')
          .attr('data-name', btn.name)
          .attr('title', btn.title || '')
          .on('change', function () {
            editor.exec(btn.name, $(this).val());
            self.updateState();
          });
      } else {
        $element = $('<button type="button"/>')
          .attr('data-name', btn.name)
          .attr('title', btn.title || '')
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
      }

      self.buttons[btn.name] = $element;

      editor.$toolbar.append($element);

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
    'alignRight': 'justifyRight',
    'justifyFull': 'justifyFull'
  };

  for (var btnName in nativeCommands) {
    if (this.buttons[btnName] && document.queryCommandState(nativeCommands[btnName])) {
      this.buttons[btnName].addClass('active');
    }
  }

  if (this.editor.$content.hasClass('editor-show-blocks') && this.buttons.showBlocks) {
    this.buttons.showBlocks.addClass('active');
  }
};