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

  editor.registerCommand('subscript', function (editor) {
    if (!editor.selection || !editor.selection.isInsideEditor()) return;
    document.execCommand('subscript', false, null);
  });

  editor.registerCommand('superscript', function (editor) {
    if (!editor.selection || !editor.selection.isInsideEditor()) return;
    document.execCommand('superscript', false, null);
  });

  editor.registerCommand('hr', function (editor) {
    if (!editor.selection || !editor.selection.isInsideEditor()) return;
    document.execCommand('insertHorizontalRule', false, null);
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

  editor.registerCommand('justifyFull', function (editor) {
    if (!editor.selection || !editor.selection.isInsideEditor()) return;
    document.execCommand('justifyFull', false, null);
  });

  editor.registerCommand('indent', function (editor) {
    if (!editor.selection || !editor.selection.isInsideEditor()) return;
    document.execCommand('indent', false, null);
  });

  editor.registerCommand('outdent', function (editor) {
    if (!editor.selection || !editor.selection.isInsideEditor()) return;
    document.execCommand('outdent', false, null);
  });

  editor.registerCommand('removeFormat', function (editor) {
    if (!editor.selection || !editor.selection.isInsideEditor()) return;
    document.execCommand('removeFormat', false, null);
  });

  editor.registerCommand('formatBlock', function (editor, value) {
    if (!editor.selection || !editor.selection.isInsideEditor()) return;
    document.execCommand('formatBlock', false, value);
  });

  editor.registerCommand('foreColor', function (editor, value) {
    if (!editor.selection || !editor.selection.isInsideEditor()) return;
    document.execCommand('foreColor', false, value);
  });

  editor.registerCommand('backColor', function (editor, value) {
    if (!editor.selection || !editor.selection.isInsideEditor()) return;
    document.execCommand('backColor', false, value); // backColor preenche o destaque/fundo
  });

  editor.registerCommand('fontName', function (editor, value) {
    if (!editor.selection || !editor.selection.isInsideEditor()) return;
    
    document.execCommand('styleWithCSS', false, false);
    document.execCommand('fontName', false, value);

    // Converte a tag legada <font face="..."> gerada pelo navegador em um <span style="font-family: ..."> (HTML5)
    var fonts = editor.$content[0].querySelectorAll('font[face]');
    for (var i = 0; i < fonts.length; i++) {
      var fontEl = fonts[i];
      var span = document.createElement('span');
      span.style.fontFamily = fontEl.getAttribute('face');
      span.innerHTML = fontEl.innerHTML; // Mantém o texto selecionado
      fontEl.parentNode.replaceChild(span, fontEl);
    }
  });

  editor.registerCommand('fontSize', function (editor, value) {
    if (!editor.selection || !editor.selection.isInsideEditor()) return;

    // Desativa o styleWithCSS para forçar o navegador a gerar a tag genérica <font size="7">
    document.execCommand('styleWithCSS', false, false);
    
    // Aplica o tamanho 7 como um "marcador" temporário
    document.execCommand('fontSize', false, '7');

    // Encontra a tag recém-criada pelo navegador e a converte para um SPAN válido (HTML5)
    var fonts = editor.$content[0].querySelectorAll('font[size="7"]');
    for (var i = 0; i < fonts.length; i++) {
      var fontEl = fonts[i];
      var span = document.createElement('span');
      var remValue = (parseInt(value, 10) / 16) + 'rem'; // Converte de px para rem (base 16px)
      span.style.fontSize = remValue;
      span.innerHTML = fontEl.innerHTML; // Mantém textos e formatações internas
      fontEl.parentNode.replaceChild(span, fontEl);
    }
  });

  editor.registerCommand('showBlocks', function (editor) {
    editor.$content.toggleClass('editor-show-blocks');
  });

  // Atalhos de teclado
  editor.$content.on('keydown', function (e) {
    // Atalhos que usam Ctrl (Windows/Linux) ou Cmd (Mac)
    if (e.ctrlKey || e.metaKey) {
      var key = e.key.toLowerCase();
      var prevent = false;

      switch (key) {
        case 'b':
          editor.exec('bold');
          prevent = true;
          break;
        case 'i':
          editor.exec('italic');
          prevent = true;
          break;
        case 'u':
          editor.exec('underline');
          prevent = true;
          break;
        case 'z':
          e.shiftKey ? editor.exec('redo') : editor.exec('undo');
          prevent = true;
          break;
        case 'y':
          editor.exec('redo');
          prevent = true;
          break;
      }

      if (prevent) {
        e.preventDefault();
      }
    }
  });
};