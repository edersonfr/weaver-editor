function HistoryManager(editor) {
  this.editor = editor;

  // Cada entrada guarda o HTML e a posição do cursor: { html, caret }
  this.undoStack = [];
  this.redoStack = [];

  this.maxStack = 50;
  this.timeout = null;
}

HistoryManager.prototype.init = function () {
  this.bind();
  this.save(); // estado inicial
};

HistoryManager.prototype.bind = function () {
  var self = this;

  this.editor.$content.on('input' + this.editor.ns, function () {
    clearTimeout(self.timeout);

    self.timeout = setTimeout(function () {
      self.save();
    }, 300);
  });
};

HistoryManager.prototype.current = function () {
  return this.undoStack.length ? this.undoStack[this.undoStack.length - 1] : null;
};

HistoryManager.prototype.save = function () {
  // Uma digitação pendente no debounce entra agora, antes de outra ação
  clearTimeout(this.timeout);

  // Sem estados visuais (imagem selecionada etc.)
  var html = WysiwygEditor.cleanOutput(this.editor.$content.html());
  var caret = this.editor.selection ? this.editor.selection.serialize() : null;
  var top = this.current();

  if (top && top.html === html) {
    // Mesmo conteúdo: só atualiza onde o cursor está
    if (caret) top.caret = caret;
    return;
  }

  this.undoStack.push({ html: html, caret: caret });

  if (this.undoStack.length > this.maxStack) {
    this.undoStack.shift();
  }

  this.redoStack = [];
};

HistoryManager.prototype.undo = function () {
  if (this.undoStack.length < 2) return;

  var current = this.undoStack.pop();
  this.redoStack.push(current);

  this.restore(this.current());
};

HistoryManager.prototype.redo = function () {
  if (!this.redoStack.length) return;

  var next = this.redoStack.pop();
  this.undoStack.push(next);

  this.restore(next);
};

HistoryManager.prototype.restore = function (entry) {
  if (typeof entry === 'string') entry = { html: entry, caret: null };
  if (!entry) return;

  // Não usar jQuery .html(): ele avalia <script> a cada desfazer/refazer.
  this.editor._loadContent(entry.html);

  // Devolve o cursor para onde estava, em vez de jogá-lo para o início
  if (!entry.caret || !this.editor.selection.deserialize(entry.caret)) {
    var range = document.createRange();
    range.selectNodeContents(this.editor.$content[0]);
    range.collapse(false);
    this.editor.selection.setRange(range);
  }

  this.editor.trigger('change');
};

window.HistoryManager = HistoryManager;
