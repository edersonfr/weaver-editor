window.BasicCommandsPlugin = BasicCommandsPlugin;

function BasicCommandsPlugin(editor) {
  this.editor = editor;
}

BasicCommandsPlugin.prototype.init = function () {
  var editor = this.editor;

  // --- Funções Auxiliares baseadas em Selection e Range ---

  function applySpanStyle(styleProp, value) {
    // Força o foco no editor para recuperar corretamente a seleção após usar o color picker
    editor.$content.focus();
    
    var sel = window.getSelection();
    if (!sel.rangeCount) return;

    var range = sel.getRangeAt(0);
    if (range.collapsed) return;

    var fragment = range.extractContents();

    // Caminha inteligentemente pelos nós para não quebrar blocos HTML com Spans
    function styleNodes(node) {
      if (node.nodeType === 3) {
        if (node.nodeValue.length > 0) {
          var span = document.createElement('span');
          span.style[styleProp] = value;
          node.parentNode.insertBefore(span, node);
          span.appendChild(node);
        }
      } else if (node.nodeType === 1) {
        var blockTags = ['P', 'DIV', 'H1', 'H2', 'H3', 'H4', 'H5', 'H6', 'BLOCKQUOTE', 'LI', 'UL', 'OL', 'TD', 'TH', 'TR', 'TBODY', 'THEAD', 'TABLE'];
        if (blockTags.indexOf(node.tagName.toUpperCase()) !== -1) {
          var children = Array.prototype.slice.call(node.childNodes);
          for (var i = 0; i < children.length; i++) {
            styleNodes(children[i]);
          }
        } else {
          node.style[styleProp] = value;
          var childrenElements = node.querySelectorAll('*');
          for (var j = 0; j < childrenElements.length; j++) {
            childrenElements[j].style[styleProp] = '';
          }
        }
      }
    }

    var tempDiv = document.createElement('div');
    tempDiv.appendChild(fragment);

    var children = Array.prototype.slice.call(tempDiv.childNodes);
    for (var i = 0; i < children.length; i++) {
      styleNodes(children[i]);
    }

    range.insertNode(tempDiv);

    var lastNode = null;
    var firstNode = tempDiv.firstChild;

    while (tempDiv.firstChild) {
      lastNode = tempDiv.firstChild;
      tempDiv.parentNode.insertBefore(lastNode, tempDiv);
    }
    tempDiv.parentNode.removeChild(tempDiv);

    if (firstNode && lastNode) {
      var newRange = document.createRange();
      newRange.setStartBefore(firstNode);
      newRange.setEndAfter(lastNode);
      sel.removeAllRanges();
      sel.addRange(newRange);
    }

    editor.trigger('change');
    editor.updateToolbar();
  }

  function applyAlignment(align) {
    if (!editor.selection || !editor.selection.isInsideEditor()) return;
    var range = editor.selection.getRange();
    if (!range) return;
    
    var block = $(range.commonAncestorContainer).closest('p, div, h1, h2, h3, h4, h5, h6, blockquote, li, td');
    if (block.length) {
        block.css('text-align', align);
    } else {
        var wrapper = $('<p>').css('text-align', align);
        if (!range.collapsed) {
            wrapper.append(range.extractContents());
            range.insertNode(wrapper[0]);
        } else {
            wrapper.html('<br>');
            range.insertNode(wrapper[0]);
        }
    }

    editor.trigger('change');
    editor.updateToolbar();
  }

  function toggleList(listTag) {
    if (!editor.selection || !editor.selection.isInsideEditor()) return;
    var range = editor.selection.getRange();
    if (!range) return;

    var block = $(range.commonAncestorContainer).closest('p, div, h1, h2, h3, h4, h5, h6');
    var currentList = $(range.commonAncestorContainer).closest('ul, ol');

    if (currentList.length) {
        if (currentList[0].tagName.toLowerCase() !== listTag) {
            var newList = $('<' + listTag + '>').html(currentList.html());
            currentList.replaceWith(newList);
        } else {
            // Remove a lista (unwrap)
            var items = currentList.find('li');
            var fragment = document.createDocumentFragment();
            items.each(function() {
                var p = $('<p>').html($(this).html() || '<br>');
                fragment.appendChild(p[0]);
            });
            currentList.replaceWith(fragment);
        }
    } else if (block.length) {
        var list = $('<' + listTag + '>');
        var li = $('<li>').html(block.html());
        list.append(li);
        block.replaceWith(list);
    } else if (!range.collapsed) {
        var list = $('<' + listTag + '>');
        var li = $('<li>').append(range.extractContents());
        list.append(li);
        range.insertNode(list[0]);
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
    var range = editor.selection.getRange();
    if (!range) return;
    
    var hr = document.createElement('hr');
    range.deleteContents();
    range.insertNode(hr);
    
    var p = document.createElement('p');
    p.innerHTML = '<br>';
    $(hr).after(p);
    
    editor.selection.restoreSelection(p);

    editor.trigger('change');
    editor.updateToolbar();
  });

  editor.registerCommand('ul', function (editor) { toggleList('ul'); });
  editor.registerCommand('ol', function (editor) { toggleList('ol'); });

  editor.registerCommand('alignLeft', function (editor) { applyAlignment('left'); });
  editor.registerCommand('alignCenter', function (editor) { applyAlignment('center'); });
  editor.registerCommand('alignRight', function (editor) { applyAlignment('right'); });
  editor.registerCommand('justifyFull', function (editor) { applyAlignment('justify'); });

  editor.registerCommand('indent', function (editor) {
    if (!editor.selection || !editor.selection.isInsideEditor()) return;
    var range = editor.selection.getRange();
    if (!range) return;
    var block = $(range.commonAncestorContainer).closest('p, div, h1, h2, h3, h4, h5, h6, blockquote, li');
    if (block.length) {
        var currentMargin = parseInt(block.css('margin-left')) || 0;
        block.css('margin-left', (currentMargin + 20) + 'px');
        
        editor.trigger('change');
    }
  });

  editor.registerCommand('outdent', function (editor) {
    if (!editor.selection || !editor.selection.isInsideEditor()) return;
    var range = editor.selection.getRange();
    if (!range) return;
    var block = $(range.commonAncestorContainer).closest('p, div, h1, h2, h3, h4, h5, h6, blockquote, li');
    if (block.length) {
        var currentMargin = parseInt(block.css('margin-left')) || 0;
        if (currentMargin > 0) {
            block.css('margin-left', Math.max(0, currentMargin - 20) + 'px');
            
            editor.trigger('change');
        }
    }
  });

  editor.registerCommand('removeFormat', function (editor) {
    if (!editor.selection || !editor.selection.isInsideEditor()) return;
    var range = editor.selection.getRange();
    if (!range || range.collapsed) return;

    var fragment = range.extractContents();
    var tempDiv = document.createElement('div');
    tempDiv.appendChild(fragment);

    var inlineTags = ['b', 'i', 'u', 's', 'strike', 'em', 'strong', 'span', 'font', 'sub', 'sup', 'a'];
    $(tempDiv).find(inlineTags.join(',')).each(function() {
        $(this).contents().unwrap();
    });

    $(tempDiv).find('*').removeAttr('style').removeAttr('class').removeAttr('color').removeAttr('face').removeAttr('size');

    range.insertNode(tempDiv);
    $(tempDiv).contents().unwrap();

    editor.trigger('change');
    editor.updateToolbar();
  });

  editor.registerCommand('formatBlock', function (editor, value) {
    if (!editor.selection || !editor.selection.isInsideEditor()) return;
    var range = editor.selection.getRange();
    if (!range) return;
    
    var tagName = value.toLowerCase();
    var block = $(range.commonAncestorContainer).closest('p, div, h1, h2, h3, h4, h5, h6, blockquote, pre');
    
    if (block.length) {
        var newBlock = $('<' + tagName + '>').html(block.html());
        block.replaceWith(newBlock);
        
        editor.trigger('change');
        editor.updateToolbar();
    } else if (!range.collapsed) {
        var newBlock = $('<' + tagName + '>').append(range.extractContents());
        range.insertNode(newBlock[0]);
        
        editor.trigger('change');
        editor.updateToolbar();
    }
  });

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