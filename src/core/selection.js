function SelectionManager(editor) {
  this.editor = editor;
}

/**
 * Tags consideradas equivalentes ao aplicar ou remover uma formatação.
 * Ex.: o botão Negrito reconhece e remove tanto <b> quanto <strong>.
 */
SelectionManager.EQUIVALENT_TAGS = {
  b: ['b', 'strong'],
  i: ['i', 'em'],
  u: ['u', 'ins'],
  s: ['s', 'strike', 'del'],
  sub: ['sub'],
  sup: ['sup']
};

/** Elementos de bloco (usados para agrupar texto solto e achar o bloco atual). */
SelectionManager.BLOCK_TAGS = [
  'P', 'DIV', 'H1', 'H2', 'H3', 'H4', 'H5', 'H6', 'UL', 'OL', 'LI', 'BLOCKQUOTE', 'PRE',
  'TABLE', 'THEAD', 'TBODY', 'TFOOT', 'TR', 'TD', 'TH', 'HR', 'FIGURE', 'FIGCAPTION',
  'IFRAME', 'VIDEO', 'AUDIO', 'SECTION', 'ARTICLE', 'HEADER', 'FOOTER', 'ASIDE', 'NAV'
];

/** Contêineres cujo texto "solto" é só espaço entre tags (não deve ser formatado). */
SelectionManager.STRUCTURAL_TAGS = ['UL', 'OL', 'TABLE', 'THEAD', 'TBODY', 'TFOOT', 'TR', 'COLGROUP'];

SelectionManager.isBlock = function (node) {
  return !!node && node.nodeType === 1 && SelectionManager.BLOCK_TAGS.indexOf(node.tagName) !== -1;
};

SelectionManager.prototype.root = function () {
  return this.editor.$content[0];
};

SelectionManager.prototype.getSelection = function () {
  return window.getSelection();
};

/**
 * Retorna uma CÓPIA do range atual. O range vivo de getRangeAt muda junto
 * com o DOM; guardá-lo para restaurar depois desloca o ponto de inserção.
 */
SelectionManager.prototype.getRange = function () {
  var sel = this.getSelection();
  if (sel.rangeCount === 0) return null;
  return sel.getRangeAt(0).cloneRange();
};

SelectionManager.prototype.setRange = function (range) {
  if (!range) return;
  var sel = this.getSelection();
  sel.removeAllRanges();
  sel.addRange(range);
};

SelectionManager.prototype.isInsideEditor = function () {
  var sel = this.getSelection();
  if (!sel.anchorNode) return false;

  return this.root().contains(sel.anchorNode);
};

/**
 * Como Element.closest, mas NUNCA sobe além do conteúdo do editor.
 * Antes, .closest('div') encontrava a própria div do editor e a substituía.
 */
SelectionManager.prototype.closest = function (node, selector) {
  var root = this.root();
  var el = node && node.nodeType !== 1 ? node.parentNode : node;

  while (el && el !== root && el.nodeType === 1) {
    if (SelectionManager.matches(el, selector)) return el;
    el = el.parentNode;
  }

  return null;
};

SelectionManager.matches = function (el, selector) {
  var fn = el.matches || el.msMatchesSelector || el.webkitMatchesSelector;
  return fn ? fn.call(el, selector) : false;
};

/**
 * Garante que o cursor esteja dentro de um bloco. Texto solto direto na raiz
 * do editor (comum na primeira linha digitada no Chrome) é envolvido num <p>.
 * @returns {Element|null} o bloco de nível superior que contém o cursor
 */
SelectionManager.prototype.ensureBlock = function () {
  var range = this.getRange();
  var root = this.root();
  if (!range || !root.contains(range.startContainer)) return null;

  var node = range.startContainer;
  if (node === root) {
    node = root.childNodes[range.startOffset] || root.childNodes[range.startOffset - 1];
  }
  if (!node) return null;

  while (node.parentNode && node.parentNode !== root) {
    node = node.parentNode;
  }
  if (node.parentNode !== root) return null;
  if (SelectionManager.isBlock(node)) return node;

  // Agrupa a sequência de nós inline vizinhos num único parágrafo
  var start = node;
  var end = node;
  while (start.previousSibling && !SelectionManager.isBlock(start.previousSibling)) start = start.previousSibling;
  while (end.nextSibling && !SelectionManager.isBlock(end.nextSibling)) end = end.nextSibling;

  var sc = range.startContainer, so = range.startOffset;
  var ec = range.endContainer, eo = range.endOffset;

  var p = document.createElement('p');
  root.insertBefore(p, start);

  var stop = end.nextSibling;
  var current = start;
  while (current && current !== stop) {
    var next = current.nextSibling;
    p.appendChild(current);
    current = next;
  }

  // Mover nós reposiciona ranges; restaura a seleção original quando possível
  var restored = document.createRange();
  try {
    if (sc === root || ec === root) throw new Error('raiz');
    restored.setStart(sc, so);
    restored.setEnd(ec, eo);
  } catch (e) {
    restored.selectNodeContents(p);
    restored.collapse(false);
  }
  this.setRange(restored);

  return p;
};

/**
 * Blocos (que casam com o seletor) tocados pela seleção atual, só os mais
 * internos. Com o cursor recolhido, devolve o bloco que contém o cursor.
 * @param {string} selector
 * @returns {Element[]}
 */
SelectionManager.prototype.getSelectedBlocks = function (selector) {
  this.ensureBlock();

  var range = this.getRange();
  if (!range) return [];

  var root = this.root();
  var blocks = [];

  if (range.collapsed || !range.intersectsNode) {
    var single = this.closest(range.startContainer, selector);
    return single ? [single] : [];
  }

  var candidates = root.querySelectorAll(selector);
  for (var i = 0; i < candidates.length; i++) {
    if (range.intersectsNode(candidates[i]) && this._hasSelectedContent(candidates[i], range)) {
      blocks.push(candidates[i]);
    }
  }

  // Mantém só os mais internos (um <div> que envolve vários <p> sai da lista)
  var deepest = [];
  for (var j = 0; j < blocks.length; j++) {
    var containsOther = false;
    for (var k = 0; k < blocks.length; k++) {
      if (j !== k && blocks[j].contains(blocks[k])) {
        containsOther = true;
        break;
      }
    }
    if (!containsOther) deepest.push(blocks[j]);
  }

  if (!deepest.length) {
    var fallback = this.closest(range.startContainer, selector);
    if (fallback) deepest.push(fallback);
  }

  return deepest;
};

/**
 * Evita incluir um bloco só porque a seleção termina na posição 0 dele
 * (ex.: selecionar um parágrafo inteiro com triplo clique).
 * @private
 */
SelectionManager.prototype._hasSelectedContent = function (block, range) {
  if (range.endContainer === block && range.endOffset === 0) return false;

  var probe = document.createRange();
  probe.selectNodeContents(block);

  if (range.compareBoundaryPoints(Range.START_TO_END, probe) <= 0) return false; // seleção termina antes
  if (range.compareBoundaryPoints(Range.END_TO_START, probe) >= 0) return false; // seleção começa depois

  // Seleção termina no início do bloco
  var startOfBlock = document.createRange();
  startOfBlock.setStart(block, 0);
  startOfBlock.collapse(true);
  if (range.compareBoundaryPoints(Range.END_TO_END, startOfBlock) <= 0) return false;

  var textNode = this._firstTextNode(block);
  if (textNode && range.endContainer === textNode && range.endOffset === 0 && !block.contains(range.startContainer)) {
    return false;
  }

  return true;
};

SelectionManager.prototype._firstTextNode = function (node) {
  var walker = document.createTreeWalker(node, NodeFilter.SHOW_TEXT, null, false);
  return walker.nextNode();
};

/**
 * Nós de texto (não vazios) dentro do range, já divididos nas bordas da seleção.
 * @private
 */
SelectionManager.prototype._textNodesInRange = function (range) {
  var root = this.root();
  var container = range.commonAncestorContainer;
  var nodes = [];

  if (container.nodeType === 3) {
    nodes.push(container);
  } else {
    var walker = document.createTreeWalker(container, NodeFilter.SHOW_TEXT, null, false);
    var n;
    while ((n = walker.nextNode())) {
      if (range.intersectsNode(n)) nodes.push(n);
    }
  }

  var result = [];
  for (var i = 0; i < nodes.length; i++) {
    var text = nodes[i];
    if (!root.contains(text)) continue;

    var startOffset = text === range.startContainer ? range.startOffset : 0;
    var endOffset = text === range.endContainer ? range.endOffset : text.nodeValue.length;
    if (endOffset <= startOffset) continue;

    // Espaço entre tags estruturais (<tr>, <ul>...) não é conteúdo
    var parent = text.parentNode;
    if (!/\S/.test(text.nodeValue) && (parent === root || SelectionManager.STRUCTURAL_TAGS.indexOf(parent.tagName) !== -1)) {
      continue;
    }

    if (endOffset < text.nodeValue.length) text.splitText(endOffset);
    if (startOffset > 0) text = text.splitText(startOffset);

    result.push(text);
  }

  return result;
};

/**
 * Elemento ancestral (dentro do editor) com uma das tags equivalentes.
 * @private
 */
SelectionManager.prototype._formatAncestor = function (node, tag) {
  var tags = SelectionManager.EQUIVALENT_TAGS[tag] || [tag];
  return this.closest(node, tags.join(','));
};

/**
 * Aplica a tag inline em cada trecho de texto selecionado, sem quebrar blocos.
 * Antes, um negrito entre dois parágrafos gerava <b><p>…</p><p>…</p></b>.
 */
SelectionManager.prototype.wrap = function (tag) {
  var range = this.getRange();
  if (!range || range.collapsed) return;

  var texts = this._textNodesInRange(range);
  if (!texts.length) return;

  for (var i = 0; i < texts.length; i++) {
    var text = texts[i];
    if (this._formatAncestor(text, tag)) continue;

    var wrapper = document.createElement(tag);
    text.parentNode.insertBefore(wrapper, text);
    wrapper.appendChild(text);
  }

  this._mergeAdjacent(tag);

  // Os nós de texto sobrevivem às fusões: servem de âncora para a seleção
  var first = texts[0];
  var last = texts[texts.length - 1];
  var newRange = document.createRange();
  newRange.setStart(first, 0);
  newRange.setEnd(last, last.nodeValue.length);
  this.setRange(newRange);
  this.root().normalize();
};

/**
 * Indica se TODO o texto selecionado já tem a formatação (ou equivalente).
 */
SelectionManager.prototype.isWrapped = function (tag) {
  var range = this.getRange();
  if (!range) return false;

  if (range.collapsed) {
    return !!this._formatAncestor(range.startContainer, tag);
  }

  var probe = range.cloneRange();
  var texts = this._textNodesWithoutSplitting(probe);
  if (!texts.length) return !!this._formatAncestor(range.commonAncestorContainer, tag);

  for (var i = 0; i < texts.length; i++) {
    if (!this._formatAncestor(texts[i], tag)) return false;
  }
  return true;
};

/** @private Versão de leitura de _textNodesInRange, sem alterar o DOM. */
SelectionManager.prototype._textNodesWithoutSplitting = function (range) {
  var root = this.root();
  var container = range.commonAncestorContainer;
  var nodes = [];

  if (container.nodeType === 3) return [container];

  var walker = document.createTreeWalker(container, NodeFilter.SHOW_TEXT, null, false);
  var n;
  while ((n = walker.nextNode())) {
    if (!range.intersectsNode(n) || !root.contains(n)) continue;
    if (n === range.endContainer && range.endOffset === 0) continue;
    if (n === range.startContainer && range.startOffset === n.nodeValue.length) continue;
    if (!/\S/.test(n.nodeValue) && (n.parentNode === root || SelectionManager.STRUCTURAL_TAGS.indexOf(n.parentNode.tagName) !== -1)) continue;
    nodes.push(n);
  }
  return nodes;
};

/**
 * Remove a formatação SOMENTE do trecho selecionado. Se o negrito cobre a
 * frase inteira e só uma palavra foi selecionada, o resto continua negrito.
 */
SelectionManager.prototype.unwrap = function (tag) {
  var range = this.getRange();
  if (!range) return;

  var root = this.root();
  var tags = SelectionManager.EQUIVALENT_TAGS[tag] || [tag];
  var selector = tags.join(',');

  // Cursor sem seleção: remove a formatação da palavra/elemento inteiro
  if (range.collapsed) {
    var whole = this._formatAncestor(range.startContainer, tag);
    if (whole) this._unwrapElement(whole);
    return;
  }

  // Marcadores preservam as bordas da seleção enquanto o DOM é reorganizado
  // Elemento próprio (não <span>), para não ser confundido com a formatação
  // que está sendo removida (ex.: Remover Formatação tira <span>)
  var startMarker = document.createElement('weaver-marker');
  var endMarker = document.createElement('weaver-marker');
  startMarker.setAttribute('data-weaver-marker', 'start');
  endMarker.setAttribute('data-weaver-marker', 'end');

  var endRange = range.cloneRange();
  endRange.collapse(false);
  endRange.insertNode(endMarker);
  var startRange = range.cloneRange();
  startRange.collapse(true);
  startRange.insertNode(startMarker);

  var between = document.createRange();
  between.setStartAfter(startMarker);
  between.setEndBefore(endMarker);

  // Elementos de formatação tocados pela seleção
  var targets = [];
  var addTarget = function (el) {
    if (el && targets.indexOf(el) === -1) targets.push(el);
  };
  var self = this;
  var collectAncestors = function (node) {
    var el = self.closest(node, selector);
    while (el) {
      addTarget(el);
      el = self.closest(el.parentNode, selector);
    }
  };
  collectAncestors(startMarker);
  collectAncestors(endMarker);

  var inner = root.querySelectorAll(selector);
  for (var i = 0; i < inner.length; i++) {
    if (between.intersectsNode(inner[i])) addTarget(inner[i]);
  }

  for (var t = 0; t < targets.length; t++) {
    var el = targets[t];
    if (!el.parentNode) continue;

    // Parte antes da seleção continua formatada
    if (el.contains(startMarker)) {
      var before = document.createRange();
      before.setStart(el, 0);
      before.setEndBefore(startMarker);
      var beforeFragment = SelectionManager.pruneEmpty(before.extractContents());
      if (/\S/.test(beforeFragment.textContent) || beforeFragment.querySelector && beforeFragment.querySelector('img,br')) {
        var beforeShell = el.cloneNode(false);
        beforeShell.appendChild(beforeFragment);
        el.parentNode.insertBefore(beforeShell, el);
      } else if (beforeFragment.childNodes.length) {
        el.parentNode.insertBefore(beforeFragment, el);
      }
    }

    // Parte depois da seleção continua formatada
    if (el.contains(endMarker)) {
      var after = document.createRange();
      after.setStartAfter(endMarker);
      after.setEnd(el, el.childNodes.length);
      var afterFragment = SelectionManager.pruneEmpty(after.extractContents());
      if (/\S/.test(afterFragment.textContent) || afterFragment.querySelector && afterFragment.querySelector('img,br')) {
        var afterShell = el.cloneNode(false);
        afterShell.appendChild(afterFragment);
        el.parentNode.insertBefore(afterShell, el.nextSibling);
      } else if (afterFragment.childNodes.length) {
        el.parentNode.insertBefore(afterFragment, el.nextSibling);
      }
    }

    this._unwrapElement(el);
  }

  // Restaura a seleção onde estavam os marcadores e remove-os
  var startParent = startMarker.parentNode;
  var endParent = endMarker.parentNode;
  var startIndex = this._indexOf(startMarker);
  var endIndex = this._indexOf(endMarker);

  startParent.removeChild(startMarker);
  if (startParent === endParent && startIndex < endIndex) endIndex--;
  endParent.removeChild(endMarker);

  var restored = document.createRange();
  try {
    restored.setStart(startParent, Math.min(startIndex, startParent.childNodes.length));
    restored.setEnd(endParent, Math.min(endIndex, endParent.childNodes.length));
  } catch (e) {
    restored.selectNodeContents(startParent);
  }
  this.setRange(restored);

  // O range da seleção é vivo: normalize() junta textos sem perder a posição
  this._mergeAdjacent(tag);
  this.root().normalize();
};

/**
 * Remove elementos inline que ficaram vazios ao dividir a formatação
 * (extractContents clona os ancestrais parcialmente selecionados).
 */
SelectionManager.pruneEmpty = function (fragment) {
  var elements = fragment.querySelectorAll ? fragment.querySelectorAll('*') : [];
  for (var i = elements.length - 1; i >= 0; i--) {
    var el = elements[i];
    if (!el.parentNode || el.tagName === 'BR' || el.tagName === 'IMG' || el.tagName === 'WEAVER-MARKER') continue;
    // Sem texto (nem espaço) e sem imagem/quebra dentro: casca vazia
    if (el.textContent === '' && !el.querySelector('img, br, weaver-marker')) {
      el.parentNode.removeChild(el);
    }
  }
  return fragment;
};

SelectionManager.prototype._indexOf = function (node) {
  var index = 0;
  while ((node = node.previousSibling)) index++;
  return index;
};

SelectionManager.prototype._unwrapElement = function (el) {
  var parent = el.parentNode;
  if (!parent) return;
  while (el.firstChild) {
    parent.insertBefore(el.firstChild, el);
  }
  parent.removeChild(el);
};

/**
 * Junta irmãos adjacentes com a mesma tag (<b>a</b><b>b</b> -> <b>ab</b>).
 * @private
 */
SelectionManager.prototype._mergeAdjacent = function (tag) {
  var root = this.root();
  var elements = root.querySelectorAll(tag);

  for (var i = elements.length - 1; i >= 0; i--) {
    var el = elements[i];
    var prev = el.previousSibling;
    if (prev && prev.nodeType === 1 && prev.tagName === el.tagName && !prev.attributes.length && !el.attributes.length) {
      while (el.firstChild) prev.appendChild(el.firstChild);
      el.parentNode.removeChild(el);
    }
  }
};

SelectionManager.prototype.restoreSelection = function (node) {
  var range = document.createRange();
  range.selectNodeContents(node);
  this.setRange(range);
};

SelectionManager.prototype.toggle = function (tag) {
  if (this.isWrapped(tag)) {
    this.unwrap(tag);
  } else {
    this.wrap(tag);
  }
};

SelectionManager.prototype.getActiveFormats = function () {
  var formats = {};
  var range = this.getRange();
  var node = range ? range.commonAncestorContainer : null;
  var root = this.root();

  if (!node || !root.contains(node)) return formats;

  while (node && node !== root) {
    if (node.nodeType === 1) {
      var tag = node.tagName.toLowerCase();

      if (tag === 'b' || tag === 'strong') formats.bold = true;
      if (tag === 'i' || tag === 'em') formats.italic = true;
      if (tag === 'u' || tag === 'ins') formats.underline = true;
      if (tag === 's' || tag === 'strike' || tag === 'del') formats.strikethrough = true;
      if (tag === 'sub') formats.subscript = true;
      if (tag === 'sup') formats.superscript = true;
      if (tag === 'a') formats.link = true;
      if (tag === 'ul') formats.ul = true;
      if (tag === 'ol') formats.ol = true;
    }
    node = node.parentNode;
  }

  return formats;
};

/**
 * Posição do cursor como caminho de índices a partir da raiz, para ser
 * guardada no histórico e restaurada depois de desfazer/refazer.
 * @returns {{start: number[], startOffset: number, end: number[], endOffset: number}|null}
 */
SelectionManager.prototype.serialize = function () {
  var range = this.getRange();
  var root = this.root();
  if (!range || !root.contains(range.startContainer) || !root.contains(range.endContainer)) return null;

  return {
    start: this._pathTo(range.startContainer),
    startOffset: range.startOffset,
    end: this._pathTo(range.endContainer),
    endOffset: range.endOffset
  };
};

SelectionManager.prototype.deserialize = function (saved) {
  if (!saved) return false;

  var start = this._nodeAt(saved.start);
  var end = this._nodeAt(saved.end);
  if (!start || !end) return false;

  try {
    var range = document.createRange();
    range.setStart(start, Math.min(saved.startOffset, this._maxOffset(start)));
    range.setEnd(end, Math.min(saved.endOffset, this._maxOffset(end)));
    this.setRange(range);
    return true;
  } catch (e) {
    return false;
  }
};

SelectionManager.prototype._pathTo = function (node) {
  var root = this.root();
  var path = [];
  while (node && node !== root) {
    var index = 0;
    var sibling = node.previousSibling;
    while (sibling) {
      index++;
      sibling = sibling.previousSibling;
    }
    path.unshift(index);
    node = node.parentNode;
  }
  return path;
};

SelectionManager.prototype._nodeAt = function (path) {
  var node = this.root();
  for (var i = 0; i < path.length; i++) {
    node = node.childNodes[path[i]];
    if (!node) return null;
  }
  return node;
};

SelectionManager.prototype._maxOffset = function (node) {
  return node.nodeType === 3 ? node.nodeValue.length : node.childNodes.length;
};

window.SelectionManager = SelectionManager;
