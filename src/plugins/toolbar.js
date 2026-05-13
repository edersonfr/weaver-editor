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

  var defaultButtonLibrary = {
    undo: { name: 'undo', label: '<i data-lucide="undo"></i>', title: 'Desfazer' },
    redo: { name: 'redo', label: '<i data-lucide="redo"></i>', title: 'Refazer' },
    removeFormat: { name: 'removeFormat', label: '<i data-lucide="eraser"></i>', title: 'Remover Formatação' },
    fontName: { name: 'fontName', type: 'dropdown', title: 'Fonte', text: 'Fonte', options: [
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
    fontSize: { name: 'fontSize', type: 'dropdown', title: 'Tamanho', text: 'Tamanho', options: [
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
    formatBlock: { name: 'formatBlock', type: 'dropdown', title: 'Formatos', text: 'Formatos', options: [
      { label: '<p style="margin:0; font-size:14px;">Parágrafo</p>', value: 'P' },
      { label: '<h1 style="margin:0; font-size:24px; font-weight:bold;">Título 1</h1>', value: 'H1' },
      { label: '<h2 style="margin:0; font-size:20px; font-weight:bold;">Título 2</h2>', value: 'H2' },
      { label: '<h3 style="margin:0; font-size:18px; font-weight:bold;">Título 3</h3>', value: 'H3' },
      { label: '<h4 style="margin:0; font-size:16px; font-weight:bold;">Título 4</h4>', value: 'H4' },
      { label: '<h5 style="margin:0; font-size:14px; font-weight:bold;">Título 5</h5>', value: 'H5' },
      { label: '<h6 style="margin:0; font-size:12px; font-weight:bold;">Título 6</h6>', value: 'H6' },
      { label: '<blockquote style="margin:0; border-left:3px solid #ccc; padding-left:8px; font-style:italic; color:#666; font-size:14px;">Citação</blockquote>', value: 'BLOCKQUOTE' },
      { label: '<pre style="margin:0; background:#1f2937; color:#f3f4f6; padding:2px 8px; border-radius:4px; font-size:12px; font-family:monospace; line-height:1.2;">Bloco de Código</pre>', value: 'PRE' }
    ]},
    bold: { name: 'bold', label: '<i data-lucide="bold"></i>', title: 'Negrito' },
    italic: { name: 'italic', label: '<i data-lucide="italic"></i>', title: 'Itálico' },
    underline: { name: 'underline', label: '<i data-lucide="underline"></i>', title: 'Sublinhado' },
    strikethrough: { name: 'strikethrough', label: '<i data-lucide="strikethrough"></i>', title: 'Tachado' },
    subscript: { name: 'subscript', label: '<i data-lucide="subscript"></i>', title: 'Subscrito' },
    superscript: { name: 'superscript', label: '<i data-lucide="superscript"></i>', title: 'Sobrescrito' },
    foreColor: { name: 'foreColor', type: 'color', defaultColor: '#000000', label: '<i data-lucide="baseline"></i>', title: 'Cor da Fonte' },
    backColor: { name: 'backColor', type: 'color', defaultColor: '#ffff00', label: '<i data-lucide="highlighter"></i>', title: 'Cor de Destaque' },
    hr: { name: 'hr', label: '<i data-lucide="minus"></i>', title: 'Linha Horizontal' },
    ul: { name: 'ul', label: '<i data-lucide="list"></i>', title: 'Lista com Marcadores' },
    ol: { name: 'ol', label: '<i data-lucide="list-ordered"></i>', title: 'Lista Numerada' },
    paragraphGroup: { name: 'paragraphGroup', type: 'group', label: '<i data-lucide="align-left"></i>', title: 'Parágrafo', buttons: [
      [
        { name: 'alignLeft', label: '<i data-lucide="align-left"></i>', title: 'Alinhar à Esquerda' },
        { name: 'alignCenter', label: '<i data-lucide="align-center"></i>', title: 'Centralizar' },
        { name: 'alignRight', label: '<i data-lucide="align-right"></i>', title: 'Alinhar à Direita' },
        { name: 'justifyFull', label: '<i data-lucide="align-justify"></i>', title: 'Justificado' }
      ],
      [
        { name: 'outdent', label: '<i data-lucide="outdent"></i>', title: 'Diminuir Margem' },
        { name: 'indent', label: '<i data-lucide="indent"></i>', title: 'Aumentar Margem' }
      ]
    ]},
    link: { name: 'link', label: '<i data-lucide="link"></i>', title: 'Inserir Link' },
    table: { name: 'table', label: '<i data-lucide="table"></i>', title: 'Inserir Tabela' },
    image: { name: 'image', label: '<i data-lucide="image"></i>', title: 'Inserir Imagem' },
    video: { name: 'video', label: '<i data-lucide="video"></i>', title: 'Inserir Vídeo' },
    preview: { name: 'preview', label: '<i data-lucide="eye"></i>', title: 'Visualizar' },
    desktop: { name: 'desktop', label: '<i data-lucide="monitor"></i>', title: 'Modo Desktop', previewOnly: true },
    tablet: { name: 'tablet', label: '<i data-lucide="tablet"></i>', title: 'Modo Tablet', previewOnly: true },
    mobile: { name: 'mobile', label: '<i data-lucide="smartphone"></i>', title: 'Modo Mobile', previewOnly: true },
    closePreview: { name: 'closePreview', label: '<i data-lucide="x"></i> <span class="ml-1 font-semibold text-xs">Sair</span>', title: 'Sair do Preview', previewOnly: true },
    fullscreen: { name: 'fullscreen', label: '<i data-lucide="maximize"></i>', title: 'Tela Cheia' },
    showBlocks: { name: 'showBlocks', label: '<i data-lucide="layout-grid"></i>', title: 'Mostrar Blocos' },
    codeview: { name: 'codeview', label: '<i data-lucide="code"></i>', title: 'Código Fonte' }
  };

  var self = this;

  function createButtonElement(btn) {
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
            $menu.removeClass('right-0').addClass('left-0').show();
            $btn.attr('aria-expanded', 'true');
            
            // Verifica se o menu vazou a tela pela direita
            if ($menu[0].getBoundingClientRect().right > editor.$container[0].getBoundingClientRect().right) {
              $menu.removeClass('left-0').addClass('right-0');
            }
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
      } else if (type === 'group') {
        var $wrapper = $('<div class="editor-dropdown-wrapper relative inline-block"/>');
        var $btn = $('<button type="button" class="editor-dropdown-btn flex items-center justify-center min-w-[32px] h-8 px-1 border border-gray-300 bg-white rounded text-gray-700 hover:bg-gray-50 transition-colors focus:outline-none [&>svg]:w-4 [&>svg]:h-4"/>')
          .attr('data-name', btn.name)
          .attr('title', btn.title || '')
          .attr('aria-label', btn.title || '')
          .attr('aria-haspopup', 'true')
          .attr('aria-expanded', 'false')
          .html(btn.label + '<i data-lucide="chevron-down" class="!w-3 !h-3 ml-0.5 opacity-60"></i>');
        
        var $menu = $('<div class="editor-dropdown-menu hidden absolute top-full left-0 mt-1 bg-white border border-gray-200 rounded shadow-lg z-50 p-2 flex flex-row flex-nowrap w-max gap-2" role="menu"/>');

        for(var g = 0; g < btn.buttons.length; g++) {
          var groupItems = btn.buttons[g];
          if (!Array.isArray(groupItems)) groupItems = [groupItems];

          var $groupContainer = $('<div class="flex shadow-sm rounded"/>');

          for(var j = 0; j < groupItems.length; j++) {
            var subBtn = groupItems[j];
            
            var roundedClass = groupItems.length === 1 ? 'rounded' : 
                               (j === 0 ? 'rounded-l' : 
                               (j === groupItems.length - 1 ? 'rounded-r' : 'rounded-none'));
            
            var marginClass = j === 0 ? '' : '-ml-px';

            var $subBtn = $('<button type="button" class="flex items-center justify-center w-8 h-8 border border-gray-300 bg-white text-gray-700 hover:bg-gray-50 hover:z-10 [&.active]:z-10 transition-colors focus:outline-none relative [&>svg]:w-4 [&>svg]:h-4 ' + marginClass + ' ' + roundedClass + '"/>')
              .attr('data-name', subBtn.name)
              .attr('title', subBtn.title || '')
              .attr('aria-label', subBtn.title || '')
              .attr('role', 'menuitem')
              .html(subBtn.label)
              .on('mousedown', function(e) { e.preventDefault(); })
              .on('click', (function(cmdName) {
                return function(e) {
                  editor.exec(cmdName);
                  $menu.hide();
                  $btn.attr('aria-expanded', 'false');
                  self.updateState();
                };
              })(subBtn.name));

            self.buttons[subBtn.name] = $subBtn;
            $groupContainer.append($subBtn);
          }
          $menu.append($groupContainer);
        }

        $btn.on('mousedown', function(e) { e.preventDefault(); });
        $btn.on('click', function(e) {
          var isVisible = $menu.is(':visible');
          $('.editor-dropdown-menu').hide(); 
          $('.editor-dropdown-btn').attr('aria-expanded', 'false');
          if (!isVisible) {
            $menu.removeClass('right-0').addClass('left-0').css('display', 'flex');
            $btn.attr('aria-expanded', 'true');

            // Verifica se o menu vazou a tela pela direita
            if ($menu[0].getBoundingClientRect().right > editor.$container[0].getBoundingClientRect().right) {
              $menu.removeClass('left-0').addClass('right-0');
            }
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

        var savedRange = null;

        $element.on('mousedown', function (e) {
          if (editor.selection && editor.selection.isInsideEditor()) {
            savedRange = editor.selection.getRange();
          }
        });

        $input.on('input change', function () {
          if (savedRange) {
            var sel = window.getSelection();
            sel.removeAllRanges();
            sel.addRange(savedRange); 
          }

          var val = $(this).val();
          editor.exec(btn.name, val);

          if (editor.selection && editor.selection.isInsideEditor()) {
            savedRange = editor.selection.getRange();
          }
          self.updateState();
        });

        $element.append($input);
      } else {
        $element = $('<button type="button" class="flex items-center justify-center min-w-[32px] h-8 px-1 border border-gray-300 bg-white rounded text-gray-700 hover:bg-gray-50 transition-colors disabled:opacity-50 disabled:cursor-not-allowed focus:outline-none [&>svg]:w-4 [&>svg]:h-4"/>')
          .attr('data-name', btn.name)
          .attr('title', btn.title || '')
          .attr('aria-label', btn.title || '')
          .html(btn.label)
          .on('mousedown', function(e) { e.preventDefault(); })
          .on('click', function () {
          editor.exec(btn.name);

          self.updateState();
        });
      }

      // Define se o botão é padrão ou exclusivo do modo Preview
      if (btn.previewOnly) {
        $element.addClass('preview-only-btn hidden');
        // Joga o botão de "Sair" lá para a ponta direita (ml-auto) e deixa ele com tom de alerta vermelho
        if (btn.name === 'closePreview') {
          $element.removeClass('text-gray-700 hover:bg-gray-50 px-1').addClass('ml-auto text-red-600 hover:bg-red-50 border-red-200 px-3');
        }
      } else {
        $element.addClass('standard-btn');
      }

      self.buttons[btn.name] = $element;

      return $element;
  }

  // Mapeamento Inteligente: caso o usuário use a sintaxe nativa do Summernote, o plugin vai entendê-lo
  var aliasMap = {
    'style': ['formatBlock'],
    'clear': ['removeFormat'],
    'picture': ['image'],
    'paragraph': ['paragraphGroup'],
    'color': ['foreColor', 'backColor']
  };

  var toolbarConfig = editor.options.toolbar;

  for (var i = 0; i < toolbarConfig.length; i++) {
    var groupButtonsRaw = toolbarConfig[i][1];
    var groupButtons = [];
    
    // Desenrola Aliases e Nomes
    for (var b = 0; b < groupButtonsRaw.length; b++) {
      var rawName = groupButtonsRaw[b];
      if (aliasMap[rawName]) groupButtons = groupButtons.concat(aliasMap[rawName]);
      else groupButtons.push(rawName);
    }

    // Cria a caixinha elegante que comportará o grupo e a margem divisória
    var $groupWrapper = $('<div class="editor-toolbar-group flex gap-1 items-center mr-2 pr-2 border-r border-gray-300 last:border-r-0 last:mr-0 last:pr-0"/>');

    for (var k = 0; k < groupButtons.length; k++) {
      var btnData = defaultButtonLibrary[groupButtons[k]];
      if (btnData) $groupWrapper.append(createButtonElement(btnData));
    }

    if (groupButtons.length > 0) editor.$toolbar.append($groupWrapper);
  }

  // Garante que os botões vitais de Preview sejam gerados silenciosamente no fundo para entrarem em ação
  var previewBtns = ['desktop', 'tablet', 'mobile', 'closePreview'];
  var $pGroup = $('<div class="editor-toolbar-group flex gap-1 items-center w-full"/>');
  for (var p = 0; p < previewBtns.length; p++) {
    if (!self.buttons[previewBtns[p]]) $pGroup.append(createButtonElement(defaultButtonLibrary[previewBtns[p]]));
  }
  if ($pGroup.children().length > 0) editor.$toolbar.append($pGroup);

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