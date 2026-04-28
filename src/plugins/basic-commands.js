window.BasicCommandsPlugin = BasicCommandsPlugin;

function BasicCommandsPlugin(editor) {
  this.editor = editor;
}

BasicCommandsPlugin.prototype.init = function () {
  var editor = this.editor;

  editor.registerCommand('bold', function () {
    document.execCommand('bold', false, null);
  });

  editor.registerCommand('italic', function () {
    document.execCommand('italic', false, null);
  });
};