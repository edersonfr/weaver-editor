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
    { name: 'foreColor', type: 'color', defaultColor: '#000000', label: '<i data-lucide="baseline"></i>', title: 'Cor da Fonte' },
    { name: 'backColor', type: 'color', defaultColor: '#ffff00', label: '<i data-lucide="highlighter"></i>', title: 'Cor de Destaque' },
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
        var $wrapper = $('<div class="editor-dropdown-wrapper" style="display:inline-block; position:relative; vertical-align:top; margin-right:4px; margin-bottom:4px;"/>');
        var $btn = $('<button type="button" class="editor-dropdown-btn" style="height:32px; padding:0 8px; border:1px solid #dae0e5; background:#fff; border-radius:3px; cursor:pointer; font-size:14px; color:#333; display:inline-flex; align-items:center; gap:4px;"/>')
          .attr('data-name', btn.name)
          .attr('title', btn.title || '')
          .html('<span>' + (btn.text || btn.title) + '</span> <i data-lucide="chevron-down" style="width:14px; height:14px;"></i>');
        
        var $menu = $('<div class="editor-dropdown-menu" style="display:none; position:absolute; top:34px; left:0; background:#fff; border:1px solid #dae0e5; border-radius:3px; box-shadow:0 4px 12px rgba(0,0,0,0.15); z-index:100; min-width:180px; max-height:300px; overflow-y:auto; text-align:left;"/>');

        for(var j = 0; j < btn.options.length; j++) {
          var $item = $('<div class="editor-dropdown-item" style="padding:8px 12px; cursor:pointer; border-bottom:1px solid #f8f9fa; line-height:1.2;"/>')
            .html(btn.options[j].label)
            .attr('data-value', btn.options[j].value);
          
          $item.on('mouseover', function() { $(this).css('background', '#f1f3f5'); });
          $item.on('mouseout', function() { $(this).css('background', 'transparent'); });

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
          if (!isVisible) $menu.show();
        });

        $(document).on('mousedown', function(e) {
          if (!$wrapper.is(e.target) && $wrapper.has(e.target).length === 0) {
            $menu.hide();
          }
        });

        $wrapper.append($btn, $menu);
        $element = $wrapper;
      } else if (type === 'color') {
        var defaultColor = btn.defaultColor || '#000000';
        $element = $('<button type="button" style="position: relative; overflow: hidden;"/>')
          .attr('data-name', btn.name)
          .attr('title', btn.title || '')
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
        });

        $input.on('input change', function () {
          var val = $(this).val();
          editor.exec(btn.name, val);
          $element.find('.color-indicator').css('border-bottom-color', val);
          self.updateState();
        });

        $element.append($input);
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

  // Caso o script do Lucide já tenha carregado
  if (window.lucide) {
    window.lucide.createIcons({ root: editor.$toolbar[0] });
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