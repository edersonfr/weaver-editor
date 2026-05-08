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
    { name: 'undo', label: '<i data-lucide="undo"></i>', title: 'Desfazer' },
    { name: 'redo', label: '<i data-lucide="redo"></i>', title: 'Refazer' },
    { name: 'removeFormat', label: '<i data-lucide="eraser"></i>', title: 'Remover Formatação' },
    { name: 'fontName', type: 'dropdown', title: 'Fonte', text: 'Fonte', options: [
      { label: '<span style="font-family: Arial, sans-serif; font-size:14px;">Arial</span>', value: 'Arial' },
      { label: '<span style="font-family: \'Courier New\', Courier, monospace; font-size:14px;">Courier New</span>', value: 'Courier New' },
      { label: '<span style="font-family: Georgia, serif; font-size:14px;">Georgia</span>', value: 'Georgia' },
      { label: '<span style="font-family: Tahoma, sans-serif; font-size:14px;">Tahoma</span>', value: 'Tahoma' },
      { label: '<span style="font-family: \'Times New Roman\', Times, serif; font-size:14px;">Times New Roman</span>', value: 'Times New Roman' },
      { label: '<span style="font-family: Verdana, sans-serif; font-size:14px;">Verdana</span>', value: 'Verdana' },
      { label: '<span style="font-family: Roboto, sans-serif; font-size:14px;">Roboto</span>', value: 'Roboto' },
      { label: '<span style="font-family: \'Open Sans\', sans-serif; font-size:14px;">Open Sans</span>', value: 'Open Sans' },
      { label: '<span style="font-family: Lato, sans-serif; font-size:14px;">Lato</span>', value: 'Lato' },
      { label: '<span style="font-family: Montserrat, sans-serif; font-size:14px;">Montserrat</span>', value: 'Montserrat' },
      { label: '<span style="font-family: Poppins, sans-serif; font-size:14px;">Poppins</span>', value: 'Poppins' },
      { label: '<span style="font-family: Oswald, sans-serif; font-size:14px;">Oswald</span>', value: 'Oswald' }
    ]},
    { name: 'fontSize', type: 'dropdown', title: 'Tamanho', text: 'Tamanho', options: [
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
    { name: 'formatBlock', type: 'dropdown', title: 'Formatos', text: 'Formatos', options: [
      { label: '<p style="margin:0; font-size:14px;">Parágrafo</p>', value: 'P' },
      { label: '<h1 style="margin:0; font-size:24px; font-weight:bold;">Título 1</h1>', value: 'H1' },
      { label: '<h2 style="margin:0; font-size:20px; font-weight:bold;">Título 2</h2>', value: 'H2' },
      { label: '<h3 style="margin:0; font-size:18px; font-weight:bold;">Título 3</h3>', value: 'H3' },
      { label: '<h4 style="margin:0; font-size:16px; font-weight:bold;">Título 4</h4>', value: 'H4' },
      { label: '<h5 style="margin:0; font-size:14px; font-weight:bold;">Título 5</h5>', value: 'H5' },
      { label: '<h6 style="margin:0; font-size:12px; font-weight:bold;">Título 6</h6>', value: 'H6' },
      { label: '<blockquote style="margin:0; border-left:3px solid #ccc; padding-left:8px; font-style:italic; color:#666; font-size:14px;">Citação</blockquote>', value: 'BLOCKQUOTE' }
    ]},
    { name: 'bold', label: '<i data-lucide="bold"></i>', title: 'Negrito' },
    { name: 'italic', label: '<i data-lucide="italic"></i>', title: 'Itálico' },
    { name: 'underline', label: '<i data-lucide="underline"></i>', title: 'Sublinhado' },
    { name: 'strikethrough', label: '<i data-lucide="strikethrough"></i>', title: 'Tachado' },
    { name: 'subscript', label: '<i data-lucide="subscript"></i>', title: 'Subscrito' },
    { name: 'superscript', label: '<i data-lucide="superscript"></i>', title: 'Sobrescrito' },
    { name: 'foreColor', type: 'color', defaultColor: '#000000', label: '<i data-lucide="baseline"></i>', title: 'Cor da Fonte' },
    { name: 'backColor', type: 'color', defaultColor: '#ffff00', label: '<i data-lucide="highlighter"></i>', title: 'Cor de Destaque' },
    { name: 'hr', label: '<i data-lucide="minus"></i>', title: 'Linha Horizontal' },
    { name: 'ul', label: '<i data-lucide="list"></i>', title: 'Lista com Marcadores' },
    { name: 'ol', label: '<i data-lucide="list-ordered"></i>', title: 'Lista Numerada' },
    { name: 'outdent', label: '<i data-lucide="outdent"></i>', title: 'Diminuir Margem' },
    { name: 'indent', label: '<i data-lucide="indent"></i>', title: 'Aumentar Margem' },
    { name: 'alignLeft', label: '<i data-lucide="align-left"></i>', title: 'Alinhar à Esquerda' },
    { name: 'alignCenter', label: '<i data-lucide="align-center"></i>', title: 'Centralizar' },
    { name: 'alignRight', label: '<i data-lucide="align-right"></i>', title: 'Alinhar à Direita' },
    { name: 'justifyFull', label: '<i data-lucide="align-justify"></i>', title: 'Justificado' },
    { name: 'link', label: '<i data-lucide="link"></i>', title: 'Inserir Link' },
    { name: 'table', label: '<i data-lucide="table"></i>', title: 'Inserir Tabela' },
    { name: 'image', label: '<i data-lucide="image"></i>', title: 'Inserir Imagem' },
    { name: 'video', label: '<i data-lucide="video"></i>', title: 'Inserir Vídeo' },
    { name: 'preview', label: '<i data-lucide="eye"></i>', title: 'Visualizar' },
    { name: 'desktop', label: '<i data-lucide="monitor"></i>', title: 'Modo Desktop' },
    { name: 'tablet', label: '<i data-lucide="tablet"></i>', title: 'Modo Tablet' },
    { name: 'mobile', label: '<i data-lucide="smartphone"></i>', title: 'Modo Mobile' },
    { name: 'fullscreen', label: '<i data-lucide="maximize"></i>', title: 'Tela Cheia' },
    { name: 'showBlocks', label: '<i data-lucide="layout-grid"></i>', title: 'Mostrar Blocos' },
    { name: 'codeview', label: '<i data-lucide="code"></i>', title: 'Código Fonte' }
  ];

  var self = this;

  for (var i = 0; i < buttons.length; i++) {
    (function (btn, self) {
      var $element;
      var type = btn.type || 'button';

      if (type === 'dropdown') {
        var $wrapper = $('<div class="editor-dropdown-wrapper relative inline-block"/>');
        var $btn = $('<button type="button" class="editor-dropdown-btn flex items-center justify-between gap-1 h-8 px-2 border border-gray-300 bg-white rounded text-sm text-gray-700 hover:bg-gray-50 transition-colors focus:outline-none"/>')
          .attr('data-name', btn.name)
          .attr('title', btn.title || '')
          .attr('aria-label', btn.title || '')
          .attr('aria-haspopup', 'true')
          .attr('aria-expanded', 'false')
          .html('<span>' + (btn.text || btn.title) + '</span> <i data-lucide="chevron-down" class="w-4 h-4"></i>');
        
        var $menu = $('<div class="editor-dropdown-menu hidden absolute top-full left-0 mt-1 bg-white border border-gray-200 rounded shadow-lg z-50 min-w-[180px] max-h-60 overflow-y-auto text-left" role="menu"/>');

        for(var j = 0; j < btn.options.length; j++) {
          var $item = $('<div class="editor-dropdown-item px-3 py-2 text-sm text-gray-700 cursor-pointer hover:bg-gray-100 border-b border-gray-50 last:border-0 leading-tight"/>')
            .html(btn.options[j].label)
            .attr('role', 'menuitem')
            .attr('tabindex', '0')
            .attr('data-value', btn.options[j].value);
          
          $item.on('mousedown', function(e) { e.preventDefault(); }); // Evita perder o foco
          $item.on('click', function(e) {
            var val = $(this).attr('data-value');
            if (val) {
              editor.exec(btn.name, val);
            }
            $menu.hide();
            self.updateState();
          });
          $menu.append($item);
        }

        $btn.on('mousedown', function(e) { e.preventDefault(); });
        $btn.on('click', function(e) {
          var isVisible = $menu.is(':visible');
          $('.editor-dropdown-menu').hide(); // Esconde os outros painéis abertos
          $('.editor-dropdown-btn').attr('aria-expanded', 'false');
          if (!isVisible) {
            $menu.show();
            $btn.attr('aria-expanded', 'true');
          }
        });

        $(document).on('mousedown', function(e) {
          if (!$wrapper.is(e.target) && $wrapper.has(e.target).length === 0) {
            $menu.hide();
            $btn.attr('aria-expanded', 'false');
          }
        });

        $wrapper.append($btn, $menu);
        $element = $wrapper;
      } else if (type === 'color') {
        var defaultColor = btn.defaultColor || '#000000';
        $element = $('<button type="button" class="relative overflow-hidden flex items-center justify-center w-8 h-8 border border-gray-300 bg-white rounded text-gray-700 hover:bg-gray-50 transition-colors focus:outline-none [&>svg]:w-4 [&>svg]:h-4"/>')
          .attr('data-name', btn.name)
          .attr('title', btn.title || '')
          .attr('aria-label', btn.title || '')
          .html(btn.label);

        var $input = $('<input type="color"/>').val(defaultColor).css({
          position: 'absolute',
          left: 0,
          top: 0,
          width: '100%',
          height: '100%',
          margin: 0,
          padding: 0,
          border: 'none',
          opacity: 0,
          cursor: 'pointer'
        })
        .attr('aria-label', 'Escolher cor');

        $input.on('input change', function () {
          var val = $(this).val();
          editor.exec(btn.name, val);
          $element.find('.color-indicator').css('border-bottom-color', val);
          self.updateState();
        });

        $element.append($input);
      } else {
        $element = $('<button type="button" class="flex items-center justify-center min-w-[32px] h-8 px-1 border border-gray-300 bg-white rounded text-gray-700 hover:bg-gray-50 transition-colors disabled:opacity-50 disabled:cursor-not-allowed focus:outline-none [&>svg]:w-4 [&>svg]:h-4"/>')
          .attr('data-name', btn.name)
          .attr('title', btn.title || '')
          .attr('aria-label', btn.title || '')
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

  // Caso o script do Lucide já tenha carregado
  if (window.lucide) {
    window.lucide.createIcons({ root: editor.$toolbar[0] });
  }
};

ToolbarPlugin.prototype.updateState = function () {
  if (!this.editor.selection) return;

  var formats = this.editor.selection.getActiveFormats();

  for (var key in this.buttons) {
    this.buttons[key].removeClass('bg-gray-200 shadow-inner active').addClass('bg-white');
  }

  if (formats.bold && this.buttons.bold) {
    this.buttons.bold.removeClass('bg-white').addClass('bg-gray-200 shadow-inner active');
  }

  if (formats.italic && this.buttons.italic) {
    this.buttons.italic.removeClass('bg-white').addClass('bg-gray-200 shadow-inner active');
  }

  if (formats.link && this.buttons.link) {
    this.buttons.link.removeClass('bg-white').addClass('bg-gray-200 shadow-inner active');
  }

  // Verifica o estado nativo dos comandos executados via execCommand
  var nativeCommands = {
    'underline': 'underline',
    'strikethrough': 'strikeThrough',
    'subscript': 'subscript',
    'superscript': 'superscript',
    'ul': 'insertUnorderedList',
    'ol': 'insertOrderedList',
    'alignLeft': 'justifyLeft',
    'alignCenter': 'justifyCenter',
    'alignRight': 'justifyRight',
    'justifyFull': 'justifyFull'
  };

  for (var btnName in nativeCommands) {
    if (this.buttons[btnName] && document.queryCommandState(nativeCommands[btnName])) {
      this.buttons[btnName].removeClass('bg-white').addClass('bg-gray-200 shadow-inner active');
    }
  }

  if (this.editor.$content.hasClass('editor-show-blocks') && this.buttons.showBlocks) {
    this.buttons.showBlocks.removeClass('bg-white').addClass('bg-gray-200 shadow-inner active');
  }
};