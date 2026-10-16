function TablePlugin(editor) {
  this.editor = editor;
  this.$grid = null;
  this.$contextMenu = null;
  this.activeCell = null;
}

TablePlugin.prototype.init = function () {
  var self = this;

  // Inicializa o RangeFormatter para operações robustas no DOM
  this.rangeFormatter = new RangeFormatter(this.editor);

  this.editor.registerCommand('table', function () {
    self.toggleGrid();
  });

  this.buildGrid();
  this.buildContextMenu();
  this.bindEvents();
};

TablePlugin.prototype.buildGrid = function () {
  var self = this;

  this.$grid = $('<div class="editor-table-grid hidden absolute bg-white border border-gray-200 p-2 rounded z-50 shadow-md"></div>');
  var $gridInner = $('<div class="flex flex-wrap w-[150px]"></div>');

  // Gera uma grade 10x10
  for (var r = 1; r <= 10; r++) {
    for (var c = 1; c <= 10; c++) {
      var $cell = $('<div class="grid-cell w-[15px] h-[15px] border border-gray-100 box-border cursor-pointer hover:border-blue-500" data-row="' + r + '" data-col="' + c + '"></div>');
      $gridInner.append($cell);
    }
  }

  var $label = $('<div class="grid-label text-center text-xs mt-2 text-gray-500 font-sans">0 x 0</div>');

  this.$grid.append($gridInner).append($label);
  this.editor.$container.append(this.$grid);

  // Evita que clicar na grade faça o editor perder o foco
  this.$grid.on('mousedown', function (e) {
    e.preventDefault();
  });

  // Pinta de azul as células correspondentes ao passar o mouse
  this.$grid.on('mouseover', '.grid-cell', function () {
    var row = $(this).data('row');
    var col = $(this).data('col');
    
    self.$grid.find('.grid-cell').each(function () {
      var $this = $(this);
      if ($this.data('row') <= row && $this.data('col') <= col) {
        $this.css('background', '#3b82f6'); // azul do tailwind
      } else {
        $this.css('background', 'transparent');
      }
    });
    $label.text(col + ' x ' + row);
  });

  // Dispara a criação da tabela quando clicado e oculta o grid
  this.$grid.on('click', '.grid-cell', function () {
    var row = $(this).data('row');
    var col = $(this).data('col');
    self.insertTable(row, col);
    self.toggleGrid(false);
  });

  // Esconde o menu de grade se clicar em outro lugar da tela
  $(document).on('click' + this.editor.ns, function (e) {
    var $btn = self.editor.$toolbar.find('[data-name="table"]');
    if (!self.$grid.is(e.target) && self.$grid.has(e.target).length === 0 && !$btn.is(e.target) && $btn.has(e.target).length === 0) {
      self.toggleGrid(false);
    }
  });
};

TablePlugin.prototype.toggleGrid = function (forceState) {
  var $btn = this.editor.$toolbar.find('[data-name="table"]');
  if ($btn.length === 0) return;

  var isVisible = forceState !== undefined ? forceState : !this.$grid.is(':visible');

  if (isVisible) {
    // Salva a posição exata do cursor para usarmos depois
    if (this.editor.selection && this.editor.selection.isInsideEditor()) {
      this.savedRange = this.editor.selection.getRange();
    }

    var btnOffset = $btn.position();
    this.$grid.css({
      top: btnOffset.top + $btn.outerHeight() + 5,
      left: btnOffset.left
    });
    this.$grid.show();
    this.$grid.find('.grid-cell').css('background', 'transparent');
    this.$grid.find('.grid-label').text('0 x 0');

    // Verifica se o painel vazou pela direita
    if (this.$grid[0].getBoundingClientRect().right > this.editor.$container[0].getBoundingClientRect().right) {
      this.$grid.css('left', btnOffset.left - this.$grid.outerWidth() + $btn.outerWidth());
    }
  } else {
    this.$grid.hide();
  }
};

TablePlugin.prototype.insertTable = function (rows, cols) {
  // Restaura o cursor para o exato local antes do menu ser aberto
  if (this.savedRange) {
    var sel = window.getSelection();
    sel.removeAllRanges();
    sel.addRange(this.savedRange);
  } else if (!this.editor.selection || !this.editor.selection.isInsideEditor()) {
    return;
  }

  if (isNaN(rows) || isNaN(cols) || rows <= 0 || cols <= 0) {
    return;
  }

  var html = '<table style="width: 100%; border-collapse: collapse; margin-bottom: 15px; border: 1px solid #ccc;"><tbody>';
  for (var r = 0; r < rows; r++) {
    html += '<tr>';
    for (var c = 0; c < cols; c++) {
      html += '<td style="padding: 8px; border: 1px solid #ccc;">&nbsp;</td>';
    }
    html += '</tr>';
  }
  html += '</tbody></table><p><br></p>'; // Adiciona um parágrafo no final para poder continuar digitando

  // A grade insere fora do editor.exec(): grava histórico e sincroniza aqui
  this.editor.history.save();
  this.rangeFormatter.insertHTML(html);
  this.editor.history.save();
  this.editor.trigger('change');
};

TablePlugin.prototype.buildContextMenu = function () {
  var self = this;

  this.$contextMenu = $('<div class="editor-table-context-menu absolute bg-white border border-gray-200 rounded-md shadow-md z-[100] py-1 font-sans min-w-[180px] hidden flex-col"></div>');
  
  var menuItems = [
    { label: '<i data-lucide="arrow-up" class="w-4 h-4 mr-2 opacity-70"></i> Inserir Linha Acima', action: 'insertRowAbove' },
    { label: '<i data-lucide="arrow-down" class="w-4 h-4 mr-2 opacity-70"></i> Inserir Linha Abaixo', action: 'insertRowBelow' },
    { divider: true },
    { label: '<i data-lucide="arrow-left" class="w-4 h-4 mr-2 opacity-70"></i> Inserir Col. à Esq.', action: 'insertColLeft' },
    { label: '<i data-lucide="arrow-right" class="w-4 h-4 mr-2 opacity-70"></i> Inserir Col. à Dir.', action: 'insertColRight' },
    { divider: true },
    { label: '<i data-lucide="trash-2" class="w-4 h-4 mr-2 opacity-80"></i> <span class="font-medium">Excluir Linha</span>', action: 'deleteRow', isDestructive: true },
    { label: '<i data-lucide="trash-2" class="w-4 h-4 mr-2 opacity-80"></i> <span class="font-medium">Excluir Coluna</span>', action: 'deleteCol', isDestructive: true },
    { divider: true },
    { label: '<i data-lucide="trash" class="w-4 h-4 mr-2"></i> <span class="font-semibold">Excluir Tabela</span>', action: 'deleteTable', isDestructive: true }
  ];

  $.each(menuItems, function(i, item) {
    if (item.divider) {
      self.$contextMenu.append('<div class="h-px bg-gray-200 my-1 mx-1"></div>');
    } else {
      var hoverClass = item.isDestructive ? 'hover:bg-red-50 text-red-600 hover:text-red-700' : 'hover:bg-gray-100 text-gray-700 hover:text-gray-900';
      var $btn = $('<button type="button" class="flex items-center mx-1 px-2 py-1.5 text-left text-sm rounded-sm focus:outline-none transition-colors select-none ' + hoverClass + '"></button>')
        .html(item.label)
        .on('click', function(e) {
          e.preventDefault();
          self[item.action]();
          self.hideContextMenu();
        });
      self.$contextMenu.append($btn);
    }
  });

  this.editor.$container.append(this.$contextMenu);

  // Fecha o menu ao clicar fora
  $(document).on('mousedown' + this.editor.ns, function (e) {
    if (!self.$contextMenu.is(e.target) && self.$contextMenu.has(e.target).length === 0) {
      self.hideContextMenu();
    }
  });

  // Esconde ao fazer scroll no editor
  this.editor.$content.on('scroll' + this.editor.ns, function () {
    self.hideContextMenu();
  });
};

TablePlugin.prototype.bindEvents = function () {
  var self = this;

  this.editor.$content.on('contextmenu' + this.editor.ns, 'td, th', function (e) {
    // Shift + clique direito abre o menu do navegador (correção ortográfica, colar...)
    if (e.shiftKey) return;
    e.preventDefault();
    self.activeCell = this;
    self.showContextMenu(e);
  });
};

TablePlugin.prototype.showContextMenu = function (e) {
  if (!this.activeCell) return;

  var containerOffset = this.editor.$container.offset();
  if (!containerOffset) return;

  var menuX = e.pageX - containerOffset.left;
  var menuY = e.pageY - containerOffset.top;

  this.$contextMenu.css({
    display: 'flex',
    left: menuX,
    top: menuY
  });

  var menuWidth = this.$contextMenu.outerWidth();
  var menuHeight = this.$contextMenu.outerHeight();
  var containerWidth = this.editor.$container.outerWidth();
  var containerHeight = this.editor.$container.outerHeight();

  if (menuX + menuWidth > containerWidth) {
    this.$contextMenu.css('left', Math.max(0, containerWidth - menuWidth - 5));
  }
  
  if (menuY + menuHeight > containerHeight) {
    this.$contextMenu.css('top', Math.max(0, menuY - menuHeight - 5));
  }

  if (window.lucide) {
    window.lucide.createIcons({ root: this.$contextMenu[0] });
  }
};

TablePlugin.prototype.hideContextMenu = function () {
  this.$contextMenu.hide();
  this.activeCell = null;
};

TablePlugin.prototype.insertRowAbove = function () {
  if (!this.activeCell) return;
  this.editor.history.save();
  var $tr = $(this.activeCell).closest('tr');
  var cols = $tr.children('td, th').length;
  var newRow = '<tr>';
  for (var i = 0; i < cols; i++) {
    newRow += '<td style="padding: 8px; border: 1px solid #ccc;">&nbsp;</td>';
  }
  newRow += '</tr>';
  $tr.before(newRow);
  this.editor.trigger('change');
};

TablePlugin.prototype.insertRowBelow = function () {
  if (!this.activeCell) return;
  this.editor.history.save();
  var $tr = $(this.activeCell).closest('tr');
  var cols = $tr.children('td, th').length;
  var newRow = '<tr>';
  for (var i = 0; i < cols; i++) {
    newRow += '<td style="padding: 8px; border: 1px solid #ccc;">&nbsp;</td>';
  }
  newRow += '</tr>';
  $tr.after(newRow);
  this.editor.trigger('change');
};

TablePlugin.prototype.insertColLeft = function () {
  if (!this.activeCell) return;
  this.editor.history.save();
  var index = $(this.activeCell).index();
  var $table = $(this.activeCell).closest('table');
  $table.find('tr').each(function () {
    $(this).children().eq(index).before('<td style="padding: 8px; border: 1px solid #ccc;">&nbsp;</td>');
  });
  this.editor.trigger('change');
};

TablePlugin.prototype.insertColRight = function () {
  if (!this.activeCell) return;
  this.editor.history.save();
  var index = $(this.activeCell).index();
  var $table = $(this.activeCell).closest('table');
  $table.find('tr').each(function () {
    $(this).children().eq(index).after('<td style="padding: 8px; border: 1px solid #ccc;">&nbsp;</td>');
  });
  this.editor.trigger('change');
};

TablePlugin.prototype.deleteRow = function () {
  if (!this.activeCell) return;
  this.editor.history.save();
  var $tr = $(this.activeCell).closest('tr');
  var $table = $tr.closest('table');
  if ($table.find('tr').length <= 1) {
    this.deleteTable();
  } else {
    $tr.remove();
    this.editor.trigger('change');
  }
};

TablePlugin.prototype.deleteCol = function () {
  if (!this.activeCell) return;
  this.editor.history.save();
  var index = $(this.activeCell).index();
  var $table = $(this.activeCell).closest('table');
  if ($table.find('tr').first().children().length <= 1) {
    this.deleteTable();
  } else {
    $table.find('tr').each(function () {
      $(this).children().eq(index).remove();
    });
    this.editor.trigger('change');
  }
};

TablePlugin.prototype.deleteTable = function () {
  if (!this.activeCell) return;
  this.editor.history.save();
  $(this.activeCell).closest('table').remove();
  this.editor.trigger('change');
};

window.TablePlugin = TablePlugin;