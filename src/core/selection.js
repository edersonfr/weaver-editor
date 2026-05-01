function SelectionManager(editor) {
  this.editor = editor;
}

SelectionManager.prototype.getSelection = function () {
  return window.getSelection();
};

SelectionManager.prototype.getRange = function () {
  var sel = this.getSelection();
  if (sel.rangeCount === 0) return null;
  return sel.getRangeAt(0);
};

SelectionManager.prototype.wrap = function (tag) {
  var range = this.getRange();
  if (!range || range.collapsed) return;

  var wrapper = document.createElement(tag);
  wrapper.appendChild(range.extractContents());
  range.insertNode(wrapper);

  this.restoreSelection(wrapper);
};

SelectionManager.prototype.isWrapped = function (tag) {
  var range = this.getRange();
  if (!range) return false;

  var node = range.commonAncestorContainer;

  while (node && node !== this.editor.$content[0]) {
    if (node.nodeType === 1 && node.tagName.toLowerCase() === tag) {
      return true;
    }
    node = node.parentNode;
  }

  return false;
};

SelectionManager.prototype.unwrap = function (tag) {
  var range = this.getRange();
  if (!range) return;

  var node = range.commonAncestorContainer;

  while (node && node !== this.editor.$content[0]) {
    if (node.nodeType === 1 && node.tagName.toLowerCase() === tag) {
      var parent = node.parentNode;

      while (node.firstChild) {
        parent.insertBefore(node.firstChild, node);
      }

      parent.removeChild(node);
      return;
    }

    node = node.parentNode;
  }
};

SelectionManager.prototype.restoreSelection = function (node) {
  var range = document.createRange();
  range.selectNodeContents(node);

  var sel = window.getSelection();
  sel.removeAllRanges();
  sel.addRange(range);
};

SelectionManager.prototype.isInsideEditor = function () {
  var sel = this.getSelection();
  if (!sel.anchorNode) return false;

  return this.editor.$content[0].contains(sel.anchorNode);
};

SelectionManager.prototype.toggle = function (tag) {
  if (this.isWrapped(tag)) {
    this.unwrap(tag);
  } else {
    this.wrap(tag);
  }
};

window.SelectionManager = SelectionManager;