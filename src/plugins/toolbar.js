window.ToolbarPlugin = ToolbarPlugin;

function ToolbarPlugin(editor) {
  this.editor = editor;
}

ToolbarPlugin.prototype.init = function () {
  this.render();
};

ToolbarPlugin.prototype.render = function () {
  var editor = this.editor;

  var buttons = [
    { name: 'bold', label: '<b>B</b>' },
    { name: 'italic', label: '<i>I</i>' }
  ];

  for (var i = 0; i < buttons.length; i++) {
    (function (btn) {

      var $btn = $('<button type="button"/>')
        .html(btn.label)
        .on('click', function () {
          editor.exec(btn.name);
        });

      editor.$toolbar.append($btn);

    })(buttons[i]);
  }
};