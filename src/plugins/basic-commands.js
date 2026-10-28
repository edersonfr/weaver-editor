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
    if (!range || range.collapsed || !editor.selection.isInsideEditor()) return false;

    var texts = editor.selection._textNodesInRange(range);
    if (!texts.length) return false;

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
    return true;
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
    editor.loadFont(value);
    if (applySpanStyle('fontFamily', value) && typeof editor.options.onFontApply === 'function') {
      try { editor.options.onFontApply(value, editor); } catch (e) { /* erro do integrador */ }
    }
  });

  editor.registerCommand('fontSize', function (editor, value) {
    var remValue = (parseInt(value, 10) / 16) + 'rem';
    applySpanStyle('fontSize', remValue);
  });

  editor.registerCommand('showBlocks', function (editor) {
    editor.$content.toggleClass('editor-show-blocks');
  });

  // --- Tab em listas e tabelas ---

  /** Executa fn preservando a seleção (mover nós no DOM reseta ranges). */
  function keepSelection(fn) {
    var range = editor.selection.getRange();
    var saved = range ? [range.startContainer, range.startOffset, range.endContainer, range.endOffset] : null;
    fn();
    if (!saved) return;
    try {
      var restored = document.createRange();
      restored.setStart(saved[0], saved[1]);
      restored.setEnd(saved[2], saved[3]);
      editor.selection.setRange(restored);
    } catch (e) { /* nós removidos */ }
  }

  /** Tab num item: vira subitem do item anterior. */
  function indentListItem(li) {
    var prev = li.previousElementSibling;
    if (!prev || prev.tagName !== 'LI') return false;

    keepSelection(function () {
      var listTag = li.parentNode.tagName.toLowerCase();
      var sub = prev.lastElementChild;
      if (!sub || (sub.tagName !== 'UL' && sub.tagName !== 'OL')) {
        sub = document.createElement(listTag);
        prev.appendChild(sub);
      }
      sub.appendChild(li);
    });
    return true;
  }

  /** Shift+Tab num item: sobe um nível (ou sai da lista no primeiro nível). */
  function outdentListItem(li) {
    var list = li.parentNode;
    var parentItem = list.parentNode;

    keepSelection(function () {
      // Itens depois deste viram subitens dele, como nos editores de texto
      var following = [];
      for (var next = li.nextElementSibling; next; next = next.nextElementSibling) following.push(next);

      if (parentItem && parentItem.tagName === 'LI') {
        if (following.length) {
          var sub = document.createElement(list.tagName.toLowerCase());
          for (var i = 0; i < following.length; i++) sub.appendChild(following[i]);
          li.appendChild(sub);
        }
        parentItem.parentNode.insertBefore(li, parentItem.nextSibling);
        if (!list.children.length) list.parentNode.removeChild(list);
      } else {
        // Primeiro nível: o item vira parágrafo, dividindo a lista
        var p = document.createElement('p');
        while (li.firstChild) p.appendChild(li.firstChild);
        if (!p.firstChild) p.appendChild(document.createElement('br'));
        list.parentNode.insertBefore(p, list.nextSibling);
        if (following.length) {
          var rest = document.createElement(list.tagName.toLowerCase());
          for (var j = 0; j < following.length; j++) rest.appendChild(following[j]);
          list.parentNode.insertBefore(rest, p.nextSibling);
        }
        list.removeChild(li);
        if (!list.children.length) list.parentNode.removeChild(list);
      }
    });
    return true;
  }

  /** Tab numa célula: vai para a próxima (cria linha nova no fim da tabela). */
  function moveCell(cell, backwards) {
    var table = editor.selection.closest(cell, 'table');
    if (!table) return false;

    var cells = Array.prototype.slice.call(table.querySelectorAll('td, th')).filter(function (c) {
      return editor.selection.closest(c, 'table') === table;
    });
    var index = cells.indexOf(cell);
    var target = cells[index + (backwards ? -1 : 1)];

    if (!target && !backwards) {
      var lastRow = cell.parentNode;
      var row = document.createElement('tr');
      for (var i = 0; i < lastRow.children.length; i++) {
        var newCell = document.createElement(lastRow.children[i].tagName === 'TH' ? 'td' : lastRow.children[i].tagName.toLowerCase());
        var style = lastRow.children[i].getAttribute('style');
        if (style) newCell.setAttribute('style', style);
        newCell.innerHTML = '&nbsp;';
        row.appendChild(newCell);
      }
      lastRow.parentNode.insertBefore(row, lastRow.nextSibling);
      target = row.firstChild;
    }

    if (!target) return true; // primeira célula com Shift+Tab: fica onde está

    // Seleciona o conteúdo da célula para digitar por cima
    var range = document.createRange();
    range.selectNodeContents(target);
    editor.selection.setRange(range);
    return true;
  }

  function handleTab(e) {
    var range = editor.selection.getRange();
    if (!range) return false;

    var li = editor.selection.closest(range.startContainer, 'li');
    var cell = editor.selection.closest(range.startContainer, 'td, th');

    // O elemento mais próximo do cursor decide (lista dentro de célula etc.)
    if (li && (!cell || cell.contains(li))) {
      editor.history.save();
      var changed = e.shiftKey ? outdentListItem(li) : indentListItem(li);
      if (changed) {
        editor.history.save();
        editor.trigger('change');
      }
      return true; // dentro de lista, Tab nunca sai do editor
    }

    if (cell) {
      editor.history.save();
      moveCell(cell, e.shiftKey);
      editor.history.save();
      editor.trigger('change');
      return true;
    }

    return false; // fora de listas e tabelas, Tab mantém o comportamento normal (foco)
  }

  // Atalhos de teclado
  editor.$content.on('keydown' + editor.ns, function (e) {
    if (e.key === 'Tab' && !e.ctrlKey && !e.metaKey && !e.altKey) {
      if (handleTab(e)) e.preventDefault();
      return;
    }

    // Atalhos que usam Ctrl (Windows/Linux) ou Cmd (Mac)
    if (e.ctrlKey || e.metaKey) {
      var key = (e.key || '').toLowerCase();
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
        case 'k':
          // Ctrl+K: inserir/editar link (se o plugin de link estiver ativo)
          if (editor.commandRegistry.commands.link) {
            editor.exec('link');
            prevent = true;
          }
          break;
        case 'v':
          // Ctrl+Shift+V: colar sem formatação (o paste vem logo em seguida)
          if (e.shiftKey) {
            editor._plainPaste = true;
            setTimeout(function () { editor._plainPaste = false; }, 1000);
          }
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