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

  // Novos comandos de formatação básica usando a API nativa
  editor.registerCommand('underline', function (editor) {
    if (!editor.selection || !editor.selection.isInsideEditor()) return;
    document.execCommand('underline', false, null);
  });

  editor.registerCommand('strikethrough', function (editor) {
    if (!editor.selection || !editor.selection.isInsideEditor()) return;
    document.execCommand('strikeThrough', false, null);
  });

  editor.registerCommand('ul', function (editor) {
    if (!editor.selection || !editor.selection.isInsideEditor()) return;
    document.execCommand('insertUnorderedList', false, null);
  });

  editor.registerCommand('ol', function (editor) {
    if (!editor.selection || !editor.selection.isInsideEditor()) return;
    document.execCommand('insertOrderedList', false, null);
  });

  editor.registerCommand('alignLeft', function (editor) {
    if (!editor.selection || !editor.selection.isInsideEditor()) return;
    document.execCommand('justifyLeft', false, null);
  });

  editor.registerCommand('alignCenter', function (editor) {
    if (!editor.selection || !editor.selection.isInsideEditor()) return;
    document.execCommand('justifyCenter', false, null);
  });

  editor.registerCommand('alignRight', function (editor) {
    if (!editor.selection || !editor.selection.isInsideEditor()) return;
    document.execCommand('justifyRight', false, null);
  });
};