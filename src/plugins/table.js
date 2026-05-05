function TablePlugin(editor) {
  this.editor = editor;
}

TablePlugin.prototype.init = function () {
  var self = this;

  this.editor.registerCommand('table', function () {
    self.insertTable();
  });
};

TablePlugin.prototype.insertTable = function () {
  if (!this.editor.selection || !this.editor.selection.isInsideEditor()) return;

  var rowsStr = prompt('Número de linhas:', '3');
  if (!rowsStr) return;
  
  var colsStr = prompt('Número de colunas:', '3');
  if (!colsStr) return;

  var rows = parseInt(rowsStr, 10);
  var cols = parseInt(colsStr, 10);

  if (isNaN(rows) || isNaN(cols) || rows <= 0 || cols <= 0) {
    alert('Valores de linhas ou colunas inválidos.');
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