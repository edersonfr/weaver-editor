function TablePlugin(editor) {
  this.editor = editor;
  this.$grid = null;
}

TablePlugin.prototype.init = function () {
  var self = this;

  this.editor.registerCommand('table', function () {
    self.toggleGrid();
  });

  this.buildGrid();
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
  $(document).on('click', function (e) {
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

  var html = '<table style="width: 100%; border-collapse: collapse; margin-bottom: 15px;" border="1"><tbody>';
  for (var r = 0; r < rows; r++) {
    html += '<tr>';
    for (var c = 0; c < cols; c++) {
      html += '<td style="padding: 8px;">&nbsp;</td>';
    }
    html += '</tr>';
  }
  html += '</tbody></table><p><br></p>'; // Adiciona um parágrafo no final para poder continuar digitando

  document.execCommand('insertHTML', false, html);
};

window.TablePlugin = TablePlugin;