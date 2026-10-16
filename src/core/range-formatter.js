/**
 * RangeFormatter - Motor robusto de formatação usando Selection/Range APIs
 * Substitui document.execCommand por controle preciso do DOM
 */
function RangeFormatter(editor) {
  this.editor = editor;
}

/**
 * Insere HTML no ponto de seleção atual
 * @param {string} htmlString - HTML a ser inserido
 * @param {boolean} preserveCaret - Se deve posicionar cursor após o conteúdo
 */
RangeFormatter.prototype.insertHTML = function (htmlString, preserveCaret) {
  preserveCaret = preserveCaret !== false; // true por padrão
  
  var sel = window.getSelection();
  
  if (!sel.rangeCount) return false;
  
  var range = sel.getRangeAt(0).cloneRange();

  // Nunca usar range.createContextualFragment: ele EXECUTA <script>.
  // O fragmento vem sanitizado de um documento inerte.
  var fragment = this._sanitizer().toFragment(htmlString);
  if (!fragment.firstChild) return false;

  var lastNode = fragment.lastChild;

  // Remove a seleção atual
  range.deleteContents();

  // Conteúdo de bloco (tabela, vídeo, listas) no meio de um parágrafo:
  // divide o parágrafo no cursor em vez de gerar <p><table>, que o
  // navegador quebraria ao recarregar o HTML.
  var host = this._hasBlock(fragment) ? this._textBlockAt(range.startContainer) : null;

  if (host) {
    this._insertSplittingBlock(range, host, fragment, preserveCaret);
    return true;
  }
  
  // Insere o novo conteúdo
  range.insertNode(fragment);
  
  if (preserveCaret) {
    // Move o cursor para após o conteúdo inserido
    if (lastNode && lastNode.parentNode) {
      range.setStartAfter(lastNode);
      range.collapse(true);
    } else {
      range.collapse(false);
    }
  }
  
  sel.removeAllRanges();
  sel.addRange(range);
  
  return true;
};

RangeFormatter.TEXT_BLOCK_SELECTOR = 'p, h1, h2, h3, h4, h5, h6, pre';

/** @private */
RangeFormatter.prototype._hasBlock = function (fragment) {
  for (var node = fragment.firstChild; node; node = node.nextSibling) {
    if (SelectionManager.isBlock(node)) return true;
  }
  return false;
};

/**
 * Parágrafo/título (dentro do editor) que contém o nó.
 * @private
 */
RangeFormatter.prototype._textBlockAt = function (node) {
  var root = this.editor && this.editor.$content ? this.editor.$content[0] : null;
  var el = node && node.nodeType !== 1 ? node.parentNode : node;

  while (el && el !== root && el.nodeType === 1) {
    if (SelectionManager.matches(el, RangeFormatter.TEXT_BLOCK_SELECTOR)) return el;
    if (SelectionManager.isBlock(el)) return null; // li, td, blockquote aceitam blocos
    el = el.parentNode;
  }
  return null;
};

RangeFormatter.isEmptyBlock = function (el) {
  return !/\S/.test(el.textContent) && !el.querySelector('img, iframe, video, audio, table, hr');
};

/** @private */
RangeFormatter.prototype._insertSplittingBlock = function (range, host, fragment, preserveCaret) {
  // Tudo do cursor até o fim do bloco vai para um novo bloco igual
  var tailRange = document.createRange();
  tailRange.setStart(range.startContainer, range.startOffset);
  tailRange.setEnd(host, host.childNodes.length);

  var tail = host.cloneNode(false);
  tail.appendChild(tailRange.extractContents());

  var parent = host.parentNode;
  var lastInserted = fragment.lastChild;

  parent.insertBefore(tail, host.nextSibling);
  parent.insertBefore(fragment, tail);

  if (RangeFormatter.isEmptyBlock(host)) parent.removeChild(host);

  // O conteúdo inserido já traz um <p> no fim (tabela, vídeo)? Então o
  // pedaço final vazio é descartado para não sobrar linha em branco.
  var tailIsEmpty = RangeFormatter.isEmptyBlock(tail);
  var insertedEndsWithParagraph = lastInserted && lastInserted.nodeType === 1 && lastInserted.tagName === 'P';
  if (tailIsEmpty && insertedEndsWithParagraph) {
    parent.removeChild(tail);
  } else if (!tailIsEmpty && insertedEndsWithParagraph && RangeFormatter.isEmptyBlock(lastInserted) && lastInserted.parentNode) {
    // Já existe texto depois: o <p> vazio que acompanha a tabela/vídeo sobra
    parent.removeChild(lastInserted);
    lastInserted = null;
  } else if (tailIsEmpty) {
    while (tail.firstChild) tail.removeChild(tail.firstChild);
    tail.appendChild(document.createElement('br'));
  }

  if (!preserveCaret) return;

  var caretHost = tail.parentNode ? tail : lastInserted;
  if (!caretHost) return;
  var caret = document.createRange();
  if (caretHost && caretHost.nodeType === 1) {
    caret.selectNodeContents(caretHost);
    caret.collapse(caretHost === tail);
  } else {
    caret.setStartAfter(lastInserted);
    caret.collapse(true);
  }

  var sel = window.getSelection();
  sel.removeAllRanges();
  sel.addRange(caret);
};

/**
 * Sanitizador do editor (ou um padrão, se o RangeFormatter for usado sozinho)
 * @private
 */
RangeFormatter.prototype._sanitizer = function () {
  if (this.editor && this.editor.sanitizer) return this.editor.sanitizer;
  if (!this._fallbackSanitizer) this._fallbackSanitizer = new HtmlSanitizer();
  return this._fallbackSanitizer;
};

/**
 * Insere um node DOM no ponto de seleção
 * @param {Node} node - Node a ser inserido
 * @param {boolean} selectNode - Se deve manter o node selecionado
 */
RangeFormatter.prototype.insertNode = function (node, selectNode) {
  var sel = window.getSelection();
  
  if (!sel.rangeCount) return false;
  
  var range = sel.getRangeAt(0);
  
  // Remove conteúdo selecionado (se houver)
  range.deleteContents();
  
  // Insere o node
  range.insertNode(node);
  
  if (selectNode) {
    // Seleciona o node inserido
    range.selectNode(node);
    sel.removeAllRanges();
    sel.addRange(range);
  } else {
    // Move cursor após o node
    range.setStartAfter(node);
    range.collapse(true);
    sel.removeAllRanges();
    sel.addRange(range);
  }
  
  return true;
};

/**
 * Remove a formatação de link de uma seleção ou link ativo
 * Substitui document.execCommand('unlink')
 */
RangeFormatter.prototype.unwrapLink = function () {
  var sel = window.getSelection();
  
  if (!sel.rangeCount) return false;
  
  var range = sel.getRangeAt(0);
  var container = range.commonAncestorContainer;
  
  // Se container é text node, pega o elemento pai
  var element = container.nodeType === 3 ? container.parentElement : container;
  
  // Procura por <a> na árvore
  var linkNode = element.closest ? element.closest('a') : this._closest(element, 'a');
  
  if (!linkNode) return false;
  
  // Preserva o conteúdo da tag
  while (linkNode.firstChild) {
    linkNode.parentNode.insertBefore(linkNode.firstChild, linkNode);
  }
  
  // Remove a tag <a>
  linkNode.parentNode.removeChild(linkNode);
  
  return true;
};

/**
 * Aplica formatação inline (bold, italic, etc.) em texto selecionado
 * @param {string} tagName - Nome da tag ('strong', 'em', 'u', etc.)
 * @param {object} attributes - Atributos opcionais para a tag
 */
RangeFormatter.prototype.applyInlineFormat = function (tagName, attributes) {
  var sel = window.getSelection();
  
  if (!sel.rangeCount || sel.isCollapsed) return false;
  
  var range = sel.getRangeAt(0);
  var contents = range.extractContents();
  
  var element = document.createElement(tagName);
  
  // Aplica atributos se fornecidos
  if (attributes) {
    for (var attr in attributes) {
      if (attributes.hasOwnProperty(attr)) {
        element.setAttribute(attr, attributes[attr]);
      }
    }
  }
  
  element.appendChild(contents);
  range.insertNode(element);
  
  // Seleciona o elemento formatado
  range.selectNode(element);
  sel.removeAllRanges();
  sel.addRange(range);
  
  return true;
};

/**
 * Remove formatação inline de texto selecionado
 * @param {string} tagName - Nome da tag a remover
 */
RangeFormatter.prototype.removeInlineFormat = function (tagName) {
  var sel = window.getSelection();
  
  if (!sel.rangeCount) return false;
  
  var range = sel.getRangeAt(0);
  var container = range.commonAncestorContainer;
  var element = container.nodeType === 3 ? container.parentElement : container;
  
  // Procura pela tag
  var targetNode = element.closest ? element.closest(tagName) : this._closest(element, tagName);
  
  if (!targetNode) return false;
  
  // Remove a tag mantendo o conteúdo
  while (targetNode.firstChild) {
    targetNode.parentNode.insertBefore(targetNode.firstChild, targetNode);
  }
  targetNode.parentNode.removeChild(targetNode);
  
  return true;
};

/**
 * Retorna o texto atualmente selecionado
 */
RangeFormatter.prototype.getSelectedText = function () {
  var sel = window.getSelection();
  return sel.toString();
};

/**
 * Retorna o elemento pai mais próximo de um tipo específico
 * Polyfill para browsers antigos sem Element.closest()
 * @private
 */
RangeFormatter.prototype._closest = function (element, selector) {
  var el = element;
  while (el && el !== document) {
    if (this._matches(el, selector)) {
      return el;
    }
    el = el.parentElement;
  }
  return null;
};

/**
 * Verifica se elemento faz match com selector
 * @private
 */
RangeFormatter.prototype._matches = function (element, selector) {
  var matches = element.matches || element.msMatchesSelector || element.webkitMatchesSelector;
  if (matches) {
    return matches.call(element, selector);
  }
  
  // Fallback para seletor simples por tag name
  return element.tagName.toLowerCase() === selector.toLowerCase();
};

/**
 * Preserva a seleção atual para restaurar depois
 * Útil quando focus é perdido temporariamente
 */
RangeFormatter.prototype.saveSelection = function () {
  var sel = window.getSelection();
  if (sel.rangeCount === 0) return null;
  
  // Cópia: o range vivo muda junto com o DOM
  return sel.getRangeAt(0).cloneRange();
};

/**
 * Restaura uma seleção anteriormente salva
 * @param {Range} savedRange - Range previamente salvo
 */
RangeFormatter.prototype.restoreSelection = function (savedRange) {
  if (!savedRange) return false;
  
  var sel = window.getSelection();
  sel.removeAllRanges();
  sel.addRange(savedRange);
  
  return true;
};

/**
 * Cria um wrapper em volta do conteúdo selecionado
 * @param {string} tagName - Tag do wrapper
 * @param {object} attributes - Atributos opcionais
 */
RangeFormatter.prototype.wrapSelection = function (tagName, attributes) {
  var sel = window.getSelection();
  
  if (!sel.rangeCount || sel.isCollapsed) return false;
  
  var range = sel.getRangeAt(0);
  var contents = range.extractContents();
  
  var wrapper = document.createElement(tagName);
  
  if (attributes) {
    for (var attr in attributes) {
      if (attributes.hasOwnProperty(attr)) {
        wrapper.setAttribute(attr, attributes[attr]);
      }
    }
  }
  
  wrapper.appendChild(contents);
  range.insertNode(wrapper);
  
  // Seleciona o wrapper
  range.selectNode(wrapper);
  sel.removeAllRanges();
  sel.addRange(range);
  
  return true;
};

/**
 * Remove a seleção sem deletar conteúdo
 */
RangeFormatter.prototype.deselect = function () {
  var sel = window.getSelection();
  sel.removeAllRanges();
  return true;
};

window.RangeFormatter = RangeFormatter;
