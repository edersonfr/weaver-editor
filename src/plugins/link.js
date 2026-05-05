function LinkPlugin(editor) {
  this.editor = editor;
}

LinkPlugin.prototype.init = function () {
  var self = this;

  this.editor.registerCommand('link', function () {
    self.toggleLink();
  });
};

LinkPlugin.prototype.toggleLink = function () {
  var editor = this.editor;

  if (!editor.selection || !editor.selection.isInsideEditor()) return;

  var isLinked = editor.selection.getActiveFormats().link;

  if (isLinked) {
    // Se já for um link, remove
    document.execCommand('unlink', false, null);
  } else {
    // Pede a URL
    var url = prompt('Digite a URL do link:', 'https://');
    
    if (url) {
      // Caso o usuário não tenha selecionado nenhum texto, evita criar um link vazio
      if (window.getSelection().isCollapsed) {
        document.execCommand('insertText', false, url);
      }
      
      document.execCommand('createLink', false, url);
    }
  }
};

window.LinkPlugin = LinkPlugin;