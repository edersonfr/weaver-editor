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

window.SelectionManager = SelectionManager;