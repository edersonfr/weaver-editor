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

  // Tab indenta em vez de tirar o foco do código
  this.$textarea.on('keydown', function (e) {
    if (e.key !== 'Tab' || e.ctrlKey || e.metaKey || e.altKey) return;
    e.preventDefault();
    var el = this;
    var start = el.selectionStart;
    var end = el.selectionEnd;
    el.value = el.value.substring(0, start) + '  ' + el.value.substring(end);
    el.selectionStart = el.selectionEnd = start + 2;
    self.updateView();
  });

  // O editor lê daqui enquanto o code view estiver aberto (ex.: envio do formulário)
  this.editor.codeView = this;

  this.$textarea.on('scroll', function () {
    self.$highlight.scrollTop($(this).scrollTop());
    self.$highlight.scrollLeft($(this).scrollLeft());
    self.$lines.scrollTop($(this).scrollTop());
  });
};

/** Indica se o código foi alterado desde que o code view foi aberto. */
CodeViewPlugin.prototype.isModified = function () {
  return this.$textarea.val() !== this.shownCode;
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

CodeViewPlugin.prototype.beautifyHtml = function (html) {
  var tab = '  '; // 2 espaços para a indentação
  var result = '';
  var indent = '';

  // Extrai os blocos <pre>, <style> e <script> para preservá-los intactos e substitui por um placeholder
  var preBlocks = [];
  html = html.replace(/(<(pre|style|script)[^>]*>[\s\S]*?<\/\2>)/gi, function(match) {
    preBlocks.push(match);
    return '<pre-placeholder id="' + (preBlocks.length - 1) + '"/>';
  });

  // Padroniza do zero: quebras de linha viram UM espaço. Antes elas eram
  // apagadas e "palavra\noutra" virava "palavraoutra".
  html = html.replace(/[ \t]*[\r\n]+[ \t]*/g, ' ');

  var tags = html.split(/(<[^>]+>)/g);
  var inlineTags = ['a', 'span', 'b', 'i', 'u', 'strong', 'em', 'strike', 's', 'sub', 'sup', 'code', 'font'];

  for (var i = 0; i < tags.length; i++) {
    var tag = tags[i];
    if (!tag) continue;

    // Se não for uma tag (for apenas um nó de texto solto)
    if (tag.charAt(0) !== '<') {
      // Logo após uma tag de bloco, o texto começa na linha indentada
      if (result.length && result.charAt(result.length - 1) === '\n') {
        tag = tag.replace(/^\s+/, '');
        if (!tag) continue;
        result += indent;
      }
      result += tag;
      continue;
    }

    var isClosingTag = tag.match(/^<\//);
    var isSelfClosingTag = tag.match(/.*\/>$/) || tag.match(/^<(br|hr|img|input|meta|link|area|base|col|embed|param|source|track|wbr)[^>]*>$/i);
    var isOpeningTag = tag.match(/^<\w/) && !isClosingTag && !isSelfClosingTag;
    
    // Descobre o nome da tag
    var tagNameMatch = tag.match(/^<\/?([a-zA-Z0-9]+)/);
    var tagName = tagNameMatch ? tagNameMatch[1].toLowerCase() : '';
    
    var isInline = inlineTags.indexOf(tagName) !== -1;

    if (isClosingTag && !isInline) {
      indent = indent.substring(tab.length);
      result = result.replace(/[ \t]+$/, '');
      if (result.length > 0 && result.charAt(result.length - 1) !== '\n') result += '\n';
      result += indent + tag + '\n';
    } else if (isOpeningTag && !isInline) {
      result = result.replace(/[ \t]+$/, '');
      if (result.length > 0 && result.charAt(result.length - 1) !== '\n') result += '\n';
      result += indent + tag + '\n';
      indent += tab;
    } else if (isSelfClosingTag && !isInline) {
      result = result.replace(/[ \t]+$/, '');
      if (result.length > 0 && result.charAt(result.length - 1) !== '\n') result += '\n';
      result += indent + tag + '\n';
    } else {
      // Tags inline e de formatação simples
      result += tag;
    }
  }

  result = result.trim();

  // Devolve os blocos <pre> para seus lugares originais preservando toda formatação e espaços nativos
  for (var j = 0; j < preBlocks.length; j++) {
    result = result.replace('<pre-placeholder id="' + j + '"/>', function() { 
      return preBlocks[j]; 
    });
  }

  return result;
};

CodeViewPlugin.prototype.toggle = function () {
  this.active = !this.active;
  var $codeViewBtn = this.editor.$toolbar.find('[data-name="codeview"]');

  if (this.active) {
    // Lê do conteúdo com o código protegido (<weaver-raw>) já restaurado
    var html = WysiwygEditor.cleanOutput(this.editor.$content.html());

    // Aplica a formatação em cascata inteligente no HTML
    html = this.beautifyHtml(html);

    this.$textarea.val(html);
    this.shownCode = this.$textarea.val();
    this.updateView();

    this.editor.$content.hide();
    this.$wrapper.show();
    
    this.editor.$toolbar.find('button').not($codeViewBtn).prop('disabled', true);
    $codeViewBtn.addClass('active');
  } else {
    // Código não alterado: o conteúdo fica como estava (e o HTML original
    // continua valendo no getContent)
    if (this.isModified()) {
      this.editor.history.save();
      this.editor._loadContent(this.$textarea.val()); // sanitiza
      this.editor.history.save();
      this.editor.trigger('change');
    }
    this.$wrapper.hide();
    this.editor.$content.show();
    
    this.editor.$toolbar.find('button').prop('disabled', false);
    $codeViewBtn.removeClass('active');
  }
};

window.CodeViewPlugin = CodeViewPlugin;