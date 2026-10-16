function HistoryManager(editor) {
  this.editor = editor;

  this.undoStack = [];
  this.redoStack = [];

  this.maxStack = 50;
}

HistoryManager.prototype.init = function () {
  this.bind();
  this.save(); // estado inicial
};

HistoryManager.prototype.bind = function () {
  var self = this;
  var timeout;

  this.editor.$content.on('input', function () {
    clearTimeout(timeout);

    timeout = setTimeout(function () {
      self.save();
    }, 300);
  });
};

HistoryManager.prototype.save = function () {
  var html = this.editor.$content.html();

  if (this.undoStack.length && this.undoStack[this.undoStack.length - 1] === html) {
    return;
  }

  this.undoStack.push(html);

  if (this.undoStack.length > this.maxStack) {
    this.undoStack.shift();
  }

  this.redoStack = [];
};

HistoryManager.prototype.undo = function () {
  if (this.undoStack.length < 2) return;

  var current = this.undoStack.pop();
  this.redoStack.push(current);

  var previous = this.undoStack[this.undoStack.length - 1];

  this.restore(previous);
};

HistoryManager.prototype.redo = function () {
  if (!this.redoStack.length) return;

  var next = this.redoStack.pop();
  this.undoStack.push(next);

  this.restore(next);
};

HistoryManager.prototype.restore = function (html) {
  // Não usar jQuery .html(): ele avalia <script> a cada desfazer/refazer.
  this.editor.setContent(html);
};

window.HistoryManager = HistoryManager;