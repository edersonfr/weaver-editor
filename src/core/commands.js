function CommandRegistry(editor) {
  this.editor = editor;
  this.commands = {};
}

CommandRegistry.prototype.register = function (name, fn) {
  this.commands[name] = fn;
};

CommandRegistry.prototype.exec = function (name, value) {
  if (this.commands[name]) {
    this.commands[name](this.editor, value);
  }
};