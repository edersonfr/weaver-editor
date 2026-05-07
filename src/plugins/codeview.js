function CodeViewPlugin(editor) {
  this.editor = editor;
  this.active = false;
}

CodeViewPlugin.prototype.init = function () {
  var self = this;

  // Cria a estrutura para a visualização de código com syntax highlight e numeração
  this.$wrapper = $('<div class="editor-codeview-wrapper"></div>');
  this.$lines = $('<div class="editor-codeview-lines"></div>');
  this.$highlight = $('<div class="editor-codeview-highlight"></div>');
  this.$textarea = $('<textarea class="editor-codeview-textarea" spellcheck="false" wrap="off"></textarea>');

  this.$wrapper.append(this.$lines, this.$highlight, this.$textarea);
  this.editor.$container.append(this.$wrapper);

  this.editor.registerCommand('codeview', function () {
    self.toggle();
  });

  this.$textarea.on('input', function () {
    self.updateView();
  });

  this.$textarea.on('scroll', function () {
    self.$highlight.scrollTop($(this).scrollTop());
    self.$highlight.scrollLeft($(this).scrollLeft());
    self.$lines.scrollTop($(this).scrollTop());
  });
};

CodeViewPlugin.prototype.formatHtml = function (html) {
  var escaped = html.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  // Regex que busca tudo que estiver entre &lt; e &gt; para pintar de amarelo
  return escaped.replace(/(&lt;(?:(?!&lt;)[\s\S])*?&gt;)/gi, '<span class="html-tag">$1</span>');
};

CodeViewPlugin.prototype.updateView = function () {
  var code = this.$textarea.val();
  
  // Atualiza o destaque de sintaxe
  var highlighted = this.formatHtml(code);
  // Corrige problema de renderização onde quebra de linha final em DIV não ocupa espaço
  if (code && code.charAt(code.length - 1) === '\n') {
    highlighted += ' ';
  }
  this.$highlight.html(highlighted);

  // Atualiza os números das linhas
  var linesCount = code.split('\n').length;
  var linesText = '';
  for (var i = 1; i <= linesCount; i++) {
    linesText += i + '\n';
  }
  this.$lines.text(linesText);
};

CodeViewPlugin.prototype.toggle = function () {
  this.active = !this.active;
  var $codeViewBtn = this.editor.$toolbar.find('[data-name="codeview"]');

  if (this.active) {
    var html = this.editor.getContent();
    
    // Aplica uma formatação básica para evitar que tudo fique numa linha só
    html = html.replace(/(<\/?(?:div|p|h[1-6]|ul|ol|li|blockquote|table|tr|td|th|tbody|thead|tfoot|style|script|iframe)[^>]*>)/gi, '\n$1\n');
    html = html.replace(/\n+/g, '\n').replace(/^\n|\n$/g, '');

    this.$textarea.val(html);
    this.updateView();

    this.editor.$content.hide();
    this.$wrapper.show();
    
    this.editor.$toolbar.find('button').not($codeViewBtn).prop('disabled', true);
    $codeViewBtn.addClass('active');
  } else {
    var val = this.$textarea.val();
    this.editor.setContent(val);
    this.$wrapper.hide();
    this.editor.$content.show();
    
    this.editor.$toolbar.find('button').prop('disabled', false);
    $codeViewBtn.removeClass('active');
  }
};

window.CodeViewPlugin = CodeViewPlugin;