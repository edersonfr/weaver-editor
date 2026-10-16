window.BasicCommandsPlugin = BasicCommandsPlugin;

function BasicCommandsPlugin(editor) {
  this.editor = editor;
}

BasicCommandsPlugin.prototype.init = function () {
  var editor = this.editor;

  // --- Funções Auxiliares baseadas em Selection e Range ---

  /**
   * Aplica um estilo (cor, fonte, tamanho) a cada trecho de texto selecionado.
   * Trabalha nó a nó, então nunca coloca parágrafos dentro de <span>, e
   * reaproveita o <span> quando ele envolve exatamente o trecho (evita
   * <span><span><span> ao trocar a cor várias vezes).
   */
  function applySpanStyle(styleProp, value) {
    // Força o foco no editor para recuperar a seleção após usar o color picker
    editor.$content.focus();

    var range = editor.selection.getRange();
    if (!range || range.collapsed || !editor.selection.isInsideEditor()) return;

    var texts = editor.selection._textNodesInRange(range);
    if (!texts.length) return;

    for (var i = 0; i < texts.length; i++) {
      var text = texts[i];
      var parent = text.parentNode;

      if (parent.tagName === 'SPAN' && parent.childNodes.length === 1) {
        parent.style[styleProp] = value;
        continue;
      }

      var span = document.createElement('span');
      span.style[styleProp] = value;
      parent.insertBefore(span, text);
      span.appendChild(text);
    }

    var first = texts[0];
    var last = texts[texts.length - 1];
    var newRange = document.createRange();
    newRange.setStart(first, 0);
    newRange.setEnd(last, last.nodeValue.length);
    editor.selection.setRange(newRange);

    editor.trigger('change');
    editor.updateToolbar();
  }

  // Blocos que recebem alinhamento, recuo e troca de formato.
  // A busca é limitada ao conteúdo do editor (SelectionManager.closest):
  // antes, .closest('div') encontrava a própria div do editor e a substituía.
  var ALIGNABLE_BLOCKS = 'p, div, h1, h2, h3, h4, h5, h6, blockquote, li, td, th, pre';
  var TEXT_BLOCKS = 'p, div, h1, h2, h3, h4, h5, h6, blockquote, pre';

  /**
   * Troca a tag de um elemento movendo os filhos (sem reinterpretar HTML)
   * e preservando alinhamento, classes e direção.
   */
  function replaceTag(el, newTag) {
    var replacement = document.createElement(newTag);
    var keep = ['style', 'class', 'dir', 'lang'];
    for (var i = 0; i < keep.length; i++) {
      if (el.hasAttribute(keep[i])) replacement.setAttribute(keep[i], el.getAttribute(keep[i]));
    }
    while (el.firstChild) replacement.appendChild(el.firstChild);
    el.parentNode.replaceChild(replacement, el);
    return replacement;
  }

  function selectAcross(first, last) {
    var range = document.createRange();
    range.selectNodeContents(first);
    var end = document.createRange();
    end.selectNodeContents(last);
    range.setEnd(end.endContainer, end.endOffset);
    editor.selection.setRange(range);
  }

  function emptyParagraph() {
    var p = document.createElement('p');
    p.appendChild(document.createElement('br'));
    return p;
  }

  /** Garante um bloco para formatar mesmo com o editor vazio. */
  function blocksOrNew(selector) {
    var blocks = editor.selection.getSelectedBlocks(selector);
    if (blocks.length) return blocks;

    var root = editor.$content[0];
    if (!root.firstChild || !/\S/.test(root.textContent) && !root.querySelector('img,iframe,video,table,hr')) {
      var p = emptyParagraph();
      root.innerHTML = '';
      root.appendChild(p);
      editor.selection.restoreSelection(p);
      return [p];
    }
    return [];
  }

  function applyAlignment(align) {
    if (!editor.selection || !editor.selection.isInsideEditor()) return;

    var blocks = blocksOrNew(ALIGNABLE_BLOCKS);
    for (var i = 0; i < blocks.length; i++) {
      blocks[i].style.textAlign = align === 'left' ? '' : align;
      if (!blocks[i].getAttribute('style')) blocks[i].removeAttribute('style');
    }

    editor.trigger('change');
    editor.updateToolbar();
  }

  function changeIndent(delta) {
    if (!editor.selection || !editor.selection.isInsideEditor()) return;

    var blocks = editor.selection.getSelectedBlocks(ALIGNABLE_BLOCKS);
    var changed = false;

    for (var i = 0; i < blocks.length; i++) {
      var current = parseInt(blocks[i].style.marginLeft, 10) || 0;
      var next = Math.max(0, current + delta);
      if (next === current) continue;
      blocks[i].style.marginLeft = next ? next + 'px' : '';
      if (!blocks[i].getAttribute('style')) blocks[i].removeAttribute('style');
      changed = true;
    }

    if (changed) editor.trigger('change');
  }

  function formatBlock(value) {
    if (!editor.selection || !editor.selection.isInsideEditor()) return;

    var tagName = String(value || '').toLowerCase();
    if (!/^(p|h[1-6]|blockquote|pre)$/.test(tagName)) return;

    var blocks = blocksOrNew(TEXT_BLOCKS);
    if (!blocks.length) return;

    var replaced = [];
    for (var i = 0; i < blocks.length; i++) {
      replaced.push(blocks[i].tagName.toLowerCase() === tagName ? blocks[i] : replaceTag(blocks[i], tagName));
    }

    selectAcross(replaced[0], replaced[replaced.length - 1]);
    editor.trigger('change');
    editor.updateToolbar();
  }

  function toggleList(listTag) {
    if (!editor.selection || !editor.selection.isInsideEditor()) return;

    editor.selection.ensureBlock();
    var range = editor.selection.getRange();
    if (!range) return;

    var currentList = editor.selection.closest(range.startContainer, 'ul, ol');

    if (currentList) {
      if (currentList.tagName.toLowerCase() !== listTag) {
        // Troca ul <-> ol mantendo itens e sublistas
        var swapped = replaceTag(currentList, listTag);
        selectAcross(swapped, swapped);
      } else {
        // Desfaz a lista: cada item DIRETO vira um parágrafo; sublistas
        // ficam logo depois do parágrafo do item (antes eram duplicadas)
        var fragment = document.createDocumentFragment();
        var items = Array.prototype.slice.call(currentList.children);
        var firstP = null;
        var lastP = null;

        for (var i = 0; i < items.length; i++) {
          var item = items[i];
          if (item.tagName !== 'LI') {
            fragment.appendChild(item);
            continue;
          }
          var p = document.createElement('p');
          var nested = [];
          while (item.firstChild) {
            var child = item.firstChild;
            if (child.nodeType === 1 && (child.tagName === 'UL' || child.tagName === 'OL')) {
              nested.push(child);
              item.removeChild(child);
            } else {
              p.appendChild(child);
            }
          }
          if (!p.firstChild) p.appendChild(document.createElement('br'));
          fragment.appendChild(p);
          for (var n = 0; n < nested.length; n++) fragment.appendChild(nested[n]);
          if (!firstP) firstP = p;
          lastP = p;
        }

        currentList.parentNode.replaceChild(fragment, currentList);
        if (firstP) selectAcross(firstP, lastP);
      }
    } else {
      var blocks = blocksOrNew(TEXT_BLOCKS);
      if (!blocks.length) return;

      var list = document.createElement(listTag);
      blocks[0].parentNode.insertBefore(list, blocks[0]);

      for (var b = 0; b < blocks.length; b++) {
        var li = document.createElement('li');
        while (blocks[b].firstChild) li.appendChild(blocks[b].firstChild);
        if (!li.firstChild) li.appendChild(document.createElement('br'));
        list.appendChild(li);
        blocks[b].parentNode.removeChild(blocks[b]);
      }

      selectAcross(list.firstChild, list.lastChild);
    }

    editor.trigger('change');
    editor.updateToolbar();
  }

  // --- Registro de Comandos Nativos Customizados ---

  editor.registerCommand('bold', function (editor) {
    if (!editor.selection || !editor.selection.isInsideEditor()) return;
    editor.selection.toggle('b');
    editor.trigger('change');
    editor.updateToolbar();
  });

  editor.registerCommand('italic', function (editor) {
    if (!editor.selection || !editor.selection.isInsideEditor()) return;
    editor.selection.toggle('i');
    editor.trigger('change');
    editor.updateToolbar();
  });

  editor.registerCommand('underline', function (editor) {
    if (!editor.selection || !editor.selection.isInsideEditor()) return;
    editor.selection.toggle('u');
    editor.trigger('change');
    editor.updateToolbar();
  });

  editor.registerCommand('strikethrough', function (editor) {
    if (!editor.selection || !editor.selection.isInsideEditor()) return;
    editor.selection.toggle('s');
    editor.trigger('change');
    editor.updateToolbar();
  });

  editor.registerCommand('subscript', function (editor) {
    if (!editor.selection || !editor.selection.isInsideEditor()) return;
    editor.selection.toggle('sub');
    editor.trigger('change');
    editor.updateToolbar();
  });

  editor.registerCommand('superscript', function (editor) {
    if (!editor.selection || !editor.selection.isInsideEditor()) return;
    editor.selection.toggle('sup');
    editor.trigger('change');
    editor.updateToolbar();
  });

  editor.registerCommand('hr', function (editor) {
    if (!editor.selection || !editor.selection.isInsideEditor()) return;

    // Inserção ciente de blocos: divide o parágrafo em vez de pôr <hr> dentro dele
    new RangeFormatter(editor).insertHTML('<hr><p><br></p>');

    editor.trigger('change');
    editor.updateToolbar();
  });

  editor.registerCommand('ul', function (editor) { toggleList('ul'); });
  editor.registerCommand('ol', function (editor) { toggleList('ol'); });

  editor.registerCommand('alignLeft', function (editor) { applyAlignment('left'); });
  editor.registerCommand('alignCenter', function (editor) { applyAlignment('center'); });
  editor.registerCommand('alignRight', function (editor) { applyAlignment('right'); });
  editor.registerCommand('justifyFull', function (editor) { applyAlignment('justify'); });

  editor.registerCommand('indent', function () { changeIndent(20); });
  editor.registerCommand('outdent', function () { changeIndent(-20); });

  editor.registerCommand('removeFormat', function (editor) {
    if (!editor.selection || !editor.selection.isInsideEditor()) return;
    var range = editor.selection.getRange();
    if (!range || range.collapsed) return;

    // Remove só do trecho selecionado, dividindo a formatação nas bordas.
    // Links são mantidos (remover formatação não deveria apagar links).
    var tags = ['b', 'i', 'u', 's', 'sub', 'sup', 'span', 'font', 'mark', 'code'];
    for (var i = 0; i < tags.length; i++) {
      editor.selection.unwrap(tags[i]);
    }

    editor.trigger('change');
    editor.updateToolbar();
  });

  editor.registerCommand('formatBlock', function (editor, value) { formatBlock(value); });

  editor.registerCommand('foreColor', function (editor, value) {
    applySpanStyle('color', value);
  });

  editor.registerCommand('backColor', function (editor, value) {
    applySpanStyle('backgroundColor', value);
  });

  editor.registerCommand('fontName', function (editor, value) {
    applySpanStyle('fontFamily', value);
  });

  editor.registerCommand('fontSize', function (editor, value) {
    var remValue = (parseInt(value, 10) / 16) + 'rem';
    applySpanStyle('fontSize', remValue);
  });

  editor.registerCommand('showBlocks', function (editor) {
    editor.$content.toggleClass('editor-show-blocks');
  });

  // Atalhos de teclado
  editor.$content.on('keydown' + editor.ns, function (e) {
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