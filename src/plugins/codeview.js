function CodeViewPlugin(editor) {
  this.editor = editor;
  this.active = false;
}

CodeViewPlugin.prototype.init = function () {
  var self = this;

  // Cria a textarea para a visualização de código
  this.$textarea = $('<textarea class="editor-codeview" style="display: none;"></textarea>');
  this.editor.$container.append(this.$textarea);

  this.editor.registerCommand('codeview', function () {
    self.toggle();
  });
};

CodeViewPlugin.prototype.toggle = function () {
  this.active = !this.active;
  var $codeViewBtn = this.editor.$toolbar.find('[data-name="codeview"]');

  if (this.active) {
    // Pega o conteúdo atual e mostra no textarea
    var html = this.editor.getContent();
    this.$textarea.val(html);
    this.editor.$content.hide();
    this.$textarea.show();
    
    // Desabilita os outros botões para evitar conflitos de edição
    this.editor.$toolbar.find('button').not($codeViewBtn).prop('disabled', true);
    $codeViewBtn.addClass('active');
  } else {
    // Devolve o conteúdo da textarea para o editor real
    var val = this.$textarea.val();
    this.editor.setContent(val);
    this.$textarea.hide();
    this.editor.$content.show();
    
    // Habilita os botões de volta
    this.editor.$toolbar.find('button').prop('disabled', false);
    $codeViewBtn.removeClass('active');
  }
};

window.CodeViewPlugin = CodeViewPlugin;