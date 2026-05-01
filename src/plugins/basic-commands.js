window.BasicCommandsPlugin = BasicCommandsPlugin;

function BasicCommandsPlugin(editor) {
  this.editor = editor;
}

BasicCommandsPlugin.prototype.init = function () {
  var editor = this.editor;

  editor.registerCommand('bold', function (editor) {
    if (!editor.selection) return;
    if (!editor.selection.isInsideEditor()) return;

    editor.selection.toggle('b');
  });

  editor.registerCommand('italic', function (editor) {
    if (!editor.selection) return;
    if (!editor.selection.isInsideEditor()) return;

    editor.selection.toggle('i');
  });
};