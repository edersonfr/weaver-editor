/**
 * Testes funcionais do Weaver Editor (navegador real via Playwright).
 *
 * Cada teste reproduz um bug da análise (B1 a B12) e garante que ele não volta.
 * Instalação e execução: veja tests/security.test.js ou o README.
 */
var assert = require('assert');
var fs = require('fs');
var path = require('path');

var playwright;
try {
  playwright = require('playwright');
} catch (e) {
  console.error('Playwright não encontrado. Rode: npm install --no-save playwright jquery@3.6.0 && npx playwright install chromium');
  process.exit(1);
}

function resolveJquery() {
  if (process.env.JQUERY_PATH) return process.env.JQUERY_PATH;
  try {
    return require.resolve('jquery/dist/jquery.min.js');
  } catch (e) {
    console.error('jQuery não encontrado. Rode: npm install --no-save jquery@3.6.0 (ou defina JQUERY_PATH).');
    process.exit(1);
  }
}

var JQUERY = fs.readFileSync(resolveJquery(), 'utf8');
var EDITOR = fs.readFileSync(process.env.WEAVER_DIST || path.join(__dirname, '..', 'dist', 'weaver-editor.js'), 'utf8');

var browser;
var tests = [];

function test(name, fn) {
  tests.push({ name: name, fn: fn });
}

async function setup(initialHtml, options) {
  var page = await browser.newPage();
  page.errors = [];
  page.on('pageerror', function (err) { page.errors.push(err.message); });
  await page.route('**/*', function (route) { return route.abort(); });
  await page.setContent('<form><textarea id="t"></textarea></form>');
  await page.evaluate(function (html) { document.getElementById('t').value = html || ''; }, initialHtml || '');
  await page.addScriptTag({ content: JQUERY });
  await page.addScriptTag({ content: EDITOR });
  await page.evaluate(function (opts) { window.$('#t').weaver(opts || {}); }, options || null);
  return page;
}

/** Define o conteúdo cru (sem passar pelo editor) e posiciona a seleção. */
async function state(page, html, select) {
  await page.evaluate(function (args) {
    var ed = window.$('#t').data('weaver');
    var root = ed.$content[0];
    root.innerHTML = args.html;
    ed.$content.focus();

    // select: { from: [texto, offset], to: [texto, offset] } localiza nós de texto pelo conteúdo
    function find(text) {
      var walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, null, false);
      var n;
      while ((n = walker.nextNode())) {
        if (n.nodeValue.indexOf(text) !== -1) return n;
      }
      throw new Error('texto não encontrado: ' + text);
    }

    var range = document.createRange();
    var from = find(args.select.from[0]);
    range.setStart(from, from.nodeValue.indexOf(args.select.from[0]) + args.select.from[1]);
    var toSpec = args.select.to || args.select.from;
    var to = find(toSpec[0]);
    range.setEnd(to, to.nodeValue.indexOf(toSpec[0]) + toSpec[1]);
    var sel = window.getSelection();
    sel.removeAllRanges();
    sel.addRange(range);
  }, { html: html, select: select });
}

function exec(page, name, value) {
  return page.evaluate(function (args) { window.$('#t').data('weaver').exec(args[0], args[1]); }, [name, value]);
}

function content(page) {
  return page.evaluate(function () { return window.$('#t').data('weaver').$content.html(); });
}

// =========================
// B1 - blocos limitados ao editor
// =========================

test('B1: título em texto solto não apaga o editor', async function () {
  var page = await setup();
  await state(page, 'Texto solto', { from: ['Texto', 3] });
  await exec(page, 'formatBlock', 'H1');
  var alive = await page.evaluate(function () { return document.body.contains(window.$('#t').data('weaver').$content[0]); });
  assert.strictEqual(alive, true);
  assert.strictEqual(await content(page), '<h1>Texto solto</h1>');
});

test('B1: lista em texto solto não apaga o editor', async function () {
  var page = await setup();
  await state(page, 'Texto solto', { from: ['Texto', 3] });
  await exec(page, 'ul');
  assert.strictEqual(await content(page), '<ul><li>Texto solto</li></ul>');
});

test('B1: alinhar texto solto não estiliza o editor inteiro', async function () {
  var page = await setup();
  await state(page, 'Texto solto', { from: ['Texto', 3] });
  await exec(page, 'alignCenter');
  var rootStyle = await page.evaluate(function () { return window.$('#t').data('weaver').$content[0].style.textAlign; });
  assert.strictEqual(rootStyle, '');
  assert.strictEqual(await content(page), '<p style="text-align: center;">Texto solto</p>');
});

test('B1: título aplicado a vários parágrafos selecionados', async function () {
  var page = await setup();
  await state(page, '<p>um</p><p>dois</p><p>três</p>', { from: ['um', 1], to: ['dois', 2] });
  await exec(page, 'formatBlock', 'H2');
  assert.strictEqual(await content(page), '<h2>um</h2><h2>dois</h2><p>três</p>');
});

test('B1/B12: desfazer lista aninhada não duplica itens', async function () {
  var page = await setup();
  await state(page, '<ul><li>a<ul><li>a1</li></ul></li><li>b</li></ul>', { from: ['b', 0] });
  await exec(page, 'ul');
  var html = await content(page);
  assert.strictEqual((html.match(/a1/g) || []).length, 1, html);
  assert.ok(html.indexOf('<p>a</p><ul><li>a1</li></ul><p>b</p>') !== -1, html);
});

// =========================
// B2 - toolbar
// =========================

test('B2: toolbar personalizada não herda botões padrão', async function () {
  var page = await setup('', { toolbar: [['font', ['bold']]] });
  var names = await page.evaluate(function () {
    return window.$('.editor-toolbar .standard-btn').map(function () { return window.$(this).attr('data-name') || window.$(this).find('[data-name]').attr('data-name'); }).get();
  });
  assert.deepStrictEqual(names, ['bold']);
});

test('B2: grupo sem lista usa o nome do grupo como alias', async function () {
  var page = await setup('', { toolbar: [['color']] });
  var names = await page.evaluate(function () {
    return window.$('.editor-toolbar .standard-btn').map(function () { return window.$(this).attr('data-name'); }).get();
  });
  assert.deepStrictEqual(names, ['foreColor', 'backColor']);
});

// =========================
// B3 - code view
// =========================

test('B3: code view não junta palavras e é estável em idas e voltas', async function () {
  var page = await setup('<p>palavra\noutra</p><ul><li>item</li></ul>');
  await exec(page, 'codeview');
  var first = await page.evaluate(function () { return window.$('#t').data('weaver').getPlugin('CodeViewPlugin').$textarea.val(); });
  await exec(page, 'codeview');
  await exec(page, 'codeview');
  var second = await page.evaluate(function () { return window.$('#t').data('weaver').getPlugin('CodeViewPlugin').$textarea.val(); });
  await exec(page, 'codeview');
  assert.ok(/palavra outra/.test(first), first);
  assert.strictEqual(second, first);
  var text = await page.evaluate(function () { return window.$('#t').data('weaver').$content.find('p').text().replace(/\s+/g, ' ').trim(); });
  assert.strictEqual(text, 'palavra outra');
  // Code view aberto e fechado sem alterar o código não muda o conteúdo
  assert.strictEqual(await content(page), '<p>palavra\noutra</p><ul><li>item</li></ul>');
});

test('B3: alterar o código no code view aplica a mudança', async function () {
  var page = await setup('<p>a</p>');
  await page.evaluate(function () {
    var ed = window.$('#t').data('weaver');
    ed.exec('codeview');
    ed.getPlugin('CodeViewPlugin').$textarea.val('<p>b</p>');
    ed.exec('codeview');
  });
  assert.strictEqual(await content(page), '<p>b</p>');
});

test('B3: enviar o formulário com o code view aberto salva as edições', async function () {
  var page = await setup('<p>original</p>');
  await page.evaluate(function () {
    var ed = window.$('#t').data('weaver');
    ed.exec('codeview');
    ed.getPlugin('CodeViewPlugin').$textarea.val('<p>EDITADO</p>');
    window.$('form').on('submit', function (e) { e.preventDefault(); });
    window.$('form').trigger('submit');
  });
  assert.strictEqual(await page.evaluate(function () { return window.$('#t').val(); }), '<p>EDITADO</p>');
});

// =========================
// B4 - sem Tailwind
// =========================

test('B4: sem Tailwind, popovers e menus começam fechados', async function () {
  var page = await setup();
  var visible = await page.evaluate(function () {
    return window.$('.editor-link-popover,.editor-video-popover,.editor-ai-popover,.editor-table-grid,.editor-dropdown-menu,.editor-image-toolbar,.editor-table-context-menu').filter(':visible').length;
  });
  assert.strictEqual(visible, 0);
  var toolbarFlex = await page.evaluate(function () { return getComputedStyle(window.$('.editor-toolbar')[0]).display; });
  assert.strictEqual(toolbarFlex, 'flex');
});

test('B4: popover de link abre posicionado sobre o editor', async function () {
  var page = await setup();
  await state(page, '<p>texto</p>', { from: ['texto', 2] });
  await exec(page, 'link');
  var info = await page.evaluate(function () {
    var el = window.$('.editor-link-popover')[0];
    return { visible: window.$(el).is(':visible'), position: getComputedStyle(el).position };
  });
  assert.deepStrictEqual(info, { visible: true, position: 'absolute' });
});

// =========================
// B5 - normalizador
// =========================

test('B5: <source> de vídeo sobrevive ao blur', async function () {
  var page = await setup('<video controls><source src="a.mp4" type="video/mp4"></video><p>x</p>');
  await page.evaluate(function () {
    var ed = window.$('#t').data('weaver');
    ed.$content.focus();
    ed.$content.trigger('blur');
  });
  assert.ok((await content(page)).indexOf('<source src="a.mp4"') !== -1);
});

// =========================
// B6 / B7 - formatação
// =========================

test('B6: negrito reconhece e remove <strong>', async function () {
  var page = await setup();
  await state(page, '<p><strong>negrito</strong></p>', { from: ['negrito', 0], to: ['negrito', 7] });
  await exec(page, 'bold');
  assert.strictEqual(await content(page), '<p>negrito</p>');
});

test('B7: negrito entre parágrafos não coloca <p> dentro de <b>', async function () {
  var page = await setup();
  await state(page, '<p>um</p><p>dois</p>', { from: ['um', 1], to: ['dois', 2] });
  await exec(page, 'bold');
  assert.strictEqual(await content(page), '<p>u<b>m</b></p><p><b>do</b>is</p>');
});

test('B7: tirar negrito de parte do texto mantém o resto negrito', async function () {
  var page = await setup();
  await state(page, '<p><b>abc def ghi</b></p>', { from: ['abc def ghi', 4], to: ['abc def ghi', 7] });
  await exec(page, 'bold');
  assert.strictEqual(await content(page), '<p><b>abc </b>def<b> ghi</b></p>');
});

test('B7: cor entre parágrafos e troca de cor sem acumular spans', async function () {
  var page = await setup();
  await state(page, '<p>um</p><p>dois</p>', { from: ['um', 0], to: ['dois', 4] });
  await exec(page, 'foreColor', '#ff0000');
  await exec(page, 'foreColor', '#0000ff');
  var html = await content(page);
  assert.strictEqual(html, '<p><span style="color: rgb(0, 0, 255);">um</span></p><p><span style="color: rgb(0, 0, 255);">dois</span></p>');
});

test('B7: remover formatação só do trecho selecionado', async function () {
  var page = await setup();
  await state(page, '<p><b>abc <i>def</i> ghi</b></p>', { from: ['def', 0], to: ['def', 3] });
  await exec(page, 'removeFormat');
  assert.strictEqual(await content(page), '<p><b>abc </b>def<b> ghi</b></p>');
});

// =========================
// B8 - arrastar e soltar
// =========================

test('B8: soltar HTML de fora insere conteúdo sanitizado', async function () {
  var page = await setup('<p>alvo</p>');
  await page.evaluate(function () {
    var ed = window.$('#t').data('weaver');
    var p = ed.$content.find('p')[0];
    var rect = p.getBoundingClientRect();
    var dt = new DataTransfer();
    dt.setData('text/html', '<b>solto</b><img src="x" onerror="window.__pwned=1">');
    dt.setData('text/plain', 'solto');
    var ev = new DragEvent('drop', { dataTransfer: dt, bubbles: true, cancelable: true, clientX: rect.right - 1, clientY: rect.top + rect.height / 2 });
    p.dispatchEvent(ev);
  });
  await page.waitForTimeout(200);
  var html = await content(page);
  assert.ok(html.indexOf('<b>solto</b>') !== -1, html);
  assert.ok(html.indexOf('onerror') === -1, html);
  assert.strictEqual(await page.evaluate(function () { return window.__pwned || 0; }), 0);
});

test('B8: arrastar texto sem arquivos não é bloqueado no dragover', async function () {
  var page = await setup('<p>alvo</p>');
  var prevented = await page.evaluate(function () {
    var ed = window.$('#t').data('weaver');
    var dt = new DataTransfer();
    dt.setData('text/plain', 'x');
    var ev = new DragEvent('dragover', { dataTransfer: dt, bubbles: true, cancelable: true });
    ed.$content[0].dispatchEvent(ev);
    return ev.defaultPrevented;
  });
  assert.strictEqual(prevented, false);
});

// =========================
// B9 - inserção de blocos
// =========================

test('B9: tabela no meio do parágrafo divide o parágrafo', async function () {
  var page = await setup();
  await state(page, '<p>abcd</p>', { from: ['abcd', 2] });
  await page.evaluate(function () {
    var ed = window.$('#t').data('weaver');
    ed.exec('table');
    ed.getPlugin('TablePlugin').insertTable(1, 1);
  });
  var html = await content(page);
  assert.ok(/^<p>ab<\/p><table[^>]*><tbody><tr><td[^>]*>&nbsp;<\/td><\/tr><\/tbody><\/table><p>cd<\/p>$/.test(html), html);
  var synced = await page.evaluate(function () { return window.$('#t').val().indexOf('<table') !== -1; });
  assert.strictEqual(synced, true, 'textarea não sincronizado');
});

test('B9: linha horizontal não fica dentro do parágrafo', async function () {
  var page = await setup();
  await state(page, '<p>abcd</p>', { from: ['abcd', 4] });
  await exec(page, 'hr');
  assert.strictEqual(await content(page), '<p>abcd</p><hr><p><br></p>');
});

// =========================
// B10 - seleção e histórico
// =========================

test('B10: desfazer devolve o cursor para onde estava', async function () {
  var page = await setup();
  await state(page, '<p>abc</p><p>def</p>', { from: ['def', 1], to: ['def', 2] });
  await exec(page, 'bold');
  await exec(page, 'undo');
  var caret = await page.evaluate(function () {
    var sel = window.getSelection();
    return { text: sel.anchorNode && sel.anchorNode.textContent, html: window.$('#t').data('weaver').$content.html() };
  });
  assert.strictEqual(caret.html, '<p>abc</p><p>def</p>');
  assert.strictEqual(caret.text, 'def');
});

test('B10: getRange devolve cópia, não o range vivo', async function () {
  var page = await setup();
  await state(page, '<p>abc</p>', { from: ['abc', 1] });
  var same = await page.evaluate(function () {
    var ed = window.$('#t').data('weaver');
    return ed.selection.getRange() === window.getSelection().getRangeAt(0);
  });
  assert.strictEqual(same, false);
});

// =========================
// B11 - eventos e destroy
// =========================

test('B11: destroy remove o editor, os eventos de document e devolve o textarea', async function () {
  var page = await setup('<p>conteúdo</p>');
  var result = await page.evaluate(function () {
    var countDocEvents = function () {
      var events = window.$._data(document, 'events') || {};
      var total = 0;
      for (var k in events) total += events[k].length;
      return total;
    };
    var withEditor = countDocEvents();
    window.$('#t').weaver('destroy');
    return {
      withEditor: withEditor,
      after: countDocEvents(),
      containers: window.$('.wysiwyg-editor').length,
      textareaVisible: window.$('#t').is(':visible'),
      value: window.$('#t').val()
    };
  });
  assert.ok(result.withEditor > 0);
  assert.strictEqual(result.after, 0);
  assert.strictEqual(result.containers, 0);
  assert.strictEqual(result.textareaVisible, true);
  assert.strictEqual(result.value, '<p>conteúdo</p>');
});

test('B11: inicializar duas vezes não cria dois editores', async function () {
  var page = await setup();
  await page.evaluate(function () { window.$('#t').weaver(); });
  assert.strictEqual(await page.evaluate(function () { return window.$('.wysiwyg-editor').length; }), 1);
});

test('B11: abrir um menu não fecha os menus de outro editor', async function () {
  var page = await setup();
  var result = await page.evaluate(function () {
    window.$('form').append('<textarea id="t2"></textarea>');
    window.$('#t2').weaver();
    var menus = window.$('.editor-dropdown-menu');
    var first = window.$('.wysiwyg-editor').eq(0);
    var second = window.$('.wysiwyg-editor').eq(1);
    first.find('.editor-dropdown-btn').first().trigger('click');
    var firstOpen = first.find('.editor-dropdown-menu:visible').length;
    second.find('.editor-dropdown-btn').first().trigger('click');
    return { firstStillOpen: first.find('.editor-dropdown-menu:visible').length, firstOpen: firstOpen, total: menus.length };
  });
  assert.strictEqual(result.firstOpen, 1);
  assert.strictEqual(result.firstStillOpen, 1);
});

// =========================
// B12 - detalhes
// =========================

test('B12: getPlugin funciona por nome', async function () {
  var page = await setup();
  var names = await page.evaluate(function () {
    var ed = window.$('#t').data('weaver');
    return ['LinkPlugin', 'CodeViewPlugin', 'TablePlugin'].map(function (n) { return !!ed.getPlugin(n); });
  });
  assert.deepStrictEqual(names, [true, true, true]);
});

test('Nenhum erro de JavaScript durante o uso básico', async function () {
  var page = await setup('<p>Olá</p>');
  await page.click('.editor-content');
  await page.keyboard.press('End');
  await page.keyboard.type(' mundo');
  await page.keyboard.press('Shift+Home');
  await page.keyboard.press('Control+b');
  await page.keyboard.press('Control+z');
  await page.keyboard.press('Control+y');
  assert.deepStrictEqual(page.errors, []);
  assert.strictEqual(await content(page), '<p><b>Olá mundo</b></p>');
});

// =========================
// S9 - dependências externas
// =========================

test('S9: ícones carregados de versão fixa, com crossorigin', async function () {
  var page = await setup();
  var script = await page.evaluate(function () {
    var el = document.getElementById('lucide-script');
    return { src: el.src, crossOrigin: el.crossOrigin };
  });
  assert.ok(!/@latest/.test(script.src), script.src);
  assert.ok(/lucide@\d+\.\d+\.\d+\//.test(script.src), script.src);
  assert.strictEqual(script.crossOrigin, 'anonymous');
});

test('S9: iconsIntegrity vai para o atributo integrity', async function () {
  var page = await setup('', { iconsIntegrity: 'sha384-abc' });
  var integrity = await page.evaluate(function () { return document.getElementById('lucide-script').integrity; });
  assert.strictEqual(integrity, 'sha384-abc');
});

test('S9: sem acesso ao CDN, a barra mostra o nome dos botões', async function () {
  var page = await setup();
  await page.waitForTimeout(300);
  var result = await page.evaluate(function () {
    var toolbar = window.$('.editor-toolbar');
    return {
      icons: toolbar.find('i[data-lucide]').length,
      bold: toolbar.find('[data-name="bold"]').text().trim()
    };
  });
  assert.strictEqual(result.icons, 0);
  assert.strictEqual(result.bold, 'Negrito');
});

test('S9: iconsUrl e googleFonts desligados não carregam nada externo', async function () {
  var page = await setup('<p>x</p>', { iconsUrl: false, googleFonts: false });
  var result = await page.evaluate(function () {
    var ed = window.$('#t').data('weaver');
    ed.exec('preview');
    return {
      script: !!document.getElementById('lucide-script'),
      fonts: !!document.getElementById('weaver-google-fonts'),
      previewFonts: /fonts\.googleapis/.test(window.$('.editor-preview-frame').attr('srcdoc'))
    };
  });
  assert.deepStrictEqual(result, { script: false, fonts: false, previewFonts: false });
});

test('S9: ícones desenhados só dentro do editor', async function () {
  var page = await browser.newPage();
  await page.route('**/*', function (route) { return route.abort(); });
  await page.setContent('<i data-lucide="star" id="host-icon"></i><form><textarea id="t"></textarea></form>');
  await page.evaluate(function () {
    window.__calls = [];
    window.lucide = { createIcons: function (opts) { window.__calls.push(opts && opts.root ? 'root' : 'global'); } };
  });
  await page.addScriptTag({ content: JQUERY });
  await page.addScriptTag({ content: EDITOR });
  await page.evaluate(function () { window.$('#t').weaver(); });
  var calls = await page.evaluate(function () { return window.__calls; });
  assert.ok(calls.length > 0);
  assert.ok(calls.every(function (c) { return c === 'root'; }), calls.join(','));
  assert.strictEqual(await page.evaluate(function () { return !!document.getElementById('lucide-script'); }), false);
});

// =========================
// Melhorias: colar, atalhos e imagens
// =========================

async function pasteHtml(page, html, plainFirst) {
  await page.evaluate(function (args) {
    var ed = window.$('#t').data('weaver');
    var target = ed.$content[0];
    if (args.plainFirst) {
      target.dispatchEvent(new KeyboardEvent('keydown', { key: 'v', ctrlKey: true, shiftKey: true, bubbles: true }));
    }
    var dt = new DataTransfer();
    dt.setData('text/html', args.html);
    dt.setData('text/plain', args.text);
    target.dispatchEvent(new ClipboardEvent('paste', { clipboardData: dt, bubbles: true, cancelable: true }));
  }, { html: html, text: html.replace(/<[^>]+>/g, ''), plainFirst: !!plainFirst });
}

test('Ctrl+Shift+V cola sem formatação', async function () {
  var page = await setup();
  await state(page, '<p>x</p>', { from: ['x', 1] });
  await pasteHtml(page, '<b>negrito</b> <i>itálico</i>', true);
  assert.strictEqual(await content(page), '<p>xnegrito itálico</p>');
});

test('Colar do Word: listas reais, sem classes e estilos Mso', async function () {
  var word = '<html xmlns:o="urn:schemas-microsoft-com:office:office"><body>' +
    '<p class="MsoNormal" style="margin:0cm;font-family:Calibri">Intro <b>forte</b><o:p></o:p></p>' +
    '<p class="MsoListParagraphCxSpFirst" style="text-indent:-18pt;mso-list:l0 level1 lfo1"><span style="font-family:Symbol;mso-fareast-font-family:Symbol"><span style="mso-list:Ignore">·<span style="font:7.0pt Times">&nbsp;&nbsp; </span></span></span>Um<o:p></o:p></p>' +
    '<p class="MsoListParagraphCxSpMiddle" style="mso-list:l0 level2 lfo1"><span style="mso-list:Ignore">o&nbsp; </span>Um.a</p>' +
    '<p class="MsoListParagraphCxSpLast" style="mso-list:l0 level1 lfo1"><span style="mso-list:Ignore">·&nbsp; </span>Dois</p>' +
    '<p class="MsoNormal">Meio</p>' +
    '<p class="MsoListParagraph" style="mso-list:l1 level1 lfo2"><span style="mso-list:Ignore">1.&nbsp; </span>Primeiro</p>' +
    '</body></html>';
  var page = await setup();
  await state(page, '<p>x</p>', { from: ['x', 1] });
  await pasteHtml(page, word);
  var html = await content(page);
  assert.ok(html.indexOf('<ul><li>Um<ul><li>Um.a</li></ul></li><li>Dois</li></ul>') !== -1, html);
  assert.ok(html.indexOf('<ol><li>Primeiro</li></ol>') !== -1, html);
  assert.ok(!/class=|mso-|Calibri|·/.test(html), html);
});

test('Colar do Google Docs não deixa tudo em negrito', async function () {
  var gdocs = '<meta charset="utf-8"><b style="font-weight:normal;" id="docs-internal-guid-1234"><p dir="ltr" style="line-height:1.38;margin-top:0pt;margin-bottom:0pt;"><span style="font-size:11pt;font-family:Arial;color:#000000;background-color:transparent;font-weight:700;font-style:normal;">Forte</span><span style="font-size:11pt;font-family:Arial;color:#000000;font-weight:400;"> comum</span></p></b>';
  var page = await setup();
  await state(page, '<p>x</p>', { from: ['x', 1] });
  await pasteHtml(page, gdocs);
  var html = await content(page);
  assert.ok(html.indexOf('<span style="font-weight: 700">Forte</span> comum') !== -1, html);
  assert.ok(html.indexOf('<b') === -1 && html.indexOf('font-family') === -1, html);
});

test('Ctrl+K abre o popover de link', async function () {
  var page = await setup('<p>texto</p>');
  await page.click('.editor-content p');
  await page.keyboard.press('Control+k');
  assert.strictEqual(await page.evaluate(function () { return window.$('.editor-link-popover').is(':visible'); }), true);
});

test('Tab e Shift+Tab aninham itens de lista', async function () {
  var page = await setup();
  await state(page, '<ul><li>a</li><li>b</li><li>c</li></ul>', { from: ['b', 1] });
  await page.keyboard.press('Tab');
  assert.strictEqual(await content(page), '<ul><li>a<ul><li>b</li></ul></li><li>c</li></ul>');
  await page.keyboard.type('!');
  assert.strictEqual(await content(page), '<ul><li>a<ul><li>b!</li></ul></li><li>c</li></ul>', 'cursor perdido');
  await page.keyboard.press('Shift+Tab');
  assert.strictEqual(await content(page), '<ul><li>a</li><li>b!</li><li>c</li></ul>');
  await page.keyboard.press('Shift+Tab');
  assert.strictEqual(await content(page), '<ul><li>a</li></ul><p>b!</p><ul><li>c</li></ul>');
});

test('Tab na última célula cria uma linha nova', async function () {
  var page = await setup();
  await state(page, '<table><tbody><tr><td>1</td><td>2</td></tr></tbody></table>', { from: ['1', 1] });
  await page.keyboard.press('Tab');
  await page.keyboard.type('X');
  await page.keyboard.press('Tab');
  await page.keyboard.type('Y');
  var html = await content(page);
  assert.strictEqual(html, '<table><tbody><tr><td>1</td><td>X</td></tr><tr><td>Y</td><td>&nbsp;</td></tr></tbody></table>');
});

/** Gera uma imagem PNG (File) de largura x altura dentro da página. */
async function makeImageFile(page, width, height, type, size) {
  await page.evaluate(function (args) {
    var canvas = document.createElement('canvas');
    canvas.width = args.width;
    canvas.height = args.height;
    var ctx = canvas.getContext('2d');
    ctx.fillStyle = '#3366cc';
    ctx.fillRect(0, 0, args.width, args.height);
    var data = atob(canvas.toDataURL('image/png').split(',')[1]);
    var bytes = new Uint8Array(args.size || data.length);
    for (var i = 0; i < data.length && i < bytes.length; i++) bytes[i] = data.charCodeAt(i);
    window.__file = new File([bytes], 'foto.png', { type: args.type || 'image/png' });
  }, { width: width, height: height, type: type, size: size });
}

test('Imagem: formato e tamanho inválidos mostram aviso no editor', async function () {
  var page = await setup();
  await state(page, '<p>x</p>', { from: ['x', 1] });
  await makeImageFile(page, 10, 10, 'image/svg+xml');
  await page.evaluate(function () { window.$('#t').data('weaver').getPlugin('ImagePlugin').insertImage(window.__file); });
  var notice = await page.evaluate(function () { return { text: window.$('.editor-notice').text(), role: window.$('.editor-notice').attr('role') }; });
  assert.ok(/Formato de imagem não suportado/.test(notice.text), notice.text);
  assert.strictEqual(notice.role, 'alert');

  await makeImageFile(page, 10, 10, 'image/png', 6 * 1024 * 1024);
  await page.evaluate(function () { window.$('#t').data('weaver').getPlugin('ImagePlugin').insertImage(window.__file); });
  assert.ok(/O máximo é 5 MB/.test(await page.evaluate(function () { return window.$('.editor-notice').text(); })));
  assert.ok((await content(page)).indexOf('<img') === -1);
});

test('Imagem: erro do upload aparece no editor; sucesso insere a URL', async function () {
  var page = await setup();
  await page.evaluate(function () {
    var ed = window.$('#t').data('weaver');
    ed.options.uploadImage = function (file, done) {
      if (window.__fail) done(null, 'Servidor fora do ar');
      else done('uploads/foto.png');
    };
  });
  await state(page, '<p>x</p>', { from: ['x', 1] });
  await makeImageFile(page, 10, 10);
  await page.evaluate(function () { window.__fail = true; window.$('#t').data('weaver').getPlugin('ImagePlugin').insertImage(window.__file); });
  assert.strictEqual(await page.evaluate(function () { return window.$('.editor-notice').text(); }), 'Servidor fora do ar');
  await page.evaluate(function () { window.__fail = false; window.$('#t').data('weaver').getPlugin('ImagePlugin').insertImage(window.__file); });
  assert.ok((await content(page)).indexOf('src="uploads/foto.png"') !== -1);
});

test('Imagem: sem upload, fotos grandes são reduzidas antes de embutir', async function () {
  var page = await setup('', { imageMaxWidth: 800 });
  await state(page, '<p>x</p>', { from: ['x', 1] });
  await makeImageFile(page, 2000, 1000);
  await page.evaluate(function () { window.$('#t').data('weaver').getPlugin('ImagePlugin').insertImage(window.__file); });
  await page.waitForFunction(function () { var img = document.querySelector('.editor-content img'); return img && img.complete && img.naturalWidth > 0; });
  var size = await page.evaluate(function () { var img = document.querySelector('.editor-content img'); return [img.naturalWidth, img.naturalHeight]; });
  assert.deepStrictEqual(size, [800, 400]);
});

test('Imagem: redimensionar arrastando a alça e texto alternativo', async function () {
  var page = await setup();
  await state(page, '<p>x</p>', { from: ['x', 1] });
  await makeImageFile(page, 200, 100);
  await page.evaluate(function () {
    var reader = new FileReader();
    reader.onload = function (e) { window.$('#t').data('weaver').setContent('<p><img src="' + e.target.result + '" style="width: 200px"></p>'); };
    reader.readAsDataURL(window.__file);
  });
  await page.waitForFunction(function () { var img = document.querySelector('.editor-content img'); return img && img.complete && img.naturalWidth > 0; });
  await page.click('.editor-content img');

  var handle = await page.$('.editor-image-resize');
  var box = await handle.boundingBox();
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width / 2 + 100, box.y + box.height / 2, { steps: 5 });
  await page.mouse.up();
  var width = await page.evaluate(function () { return document.querySelector('.editor-content img').style.width; });
  assert.strictEqual(width, '300px');

  await page.click('[data-name="image-alt"]');
  await page.keyboard.type('Quadrado azul');
  await page.keyboard.press('Enter');
  var html = await page.evaluate(function () { return window.$('#t').data('weaver').getContent(); });
  assert.ok(html.indexOf('alt="Quadrado azul"') !== -1, html);
  assert.ok(html.indexOf('weaver-selected') === -1, 'estado visual vazou para o HTML salvo');
});

// =========================
// Acessibilidade (teclado e leitores de tela)
// =========================

function activeInfo(page) {
  return page.evaluate(function () {
    var el = document.activeElement;
    return {
      name: el.getAttribute('data-name') || '',
      role: el.getAttribute('role') || '',
      tag: el.tagName,
      inContent: !!(el.closest && el.closest('.editor-content')),
      text: (el.textContent || '').trim()
    };
  });
}

test('A11y: Alt+F10 vai para a barra, setas andam e Esc volta ao texto', async function () {
  var page = await setup('<p>texto</p>');
  await page.click('.editor-content p');
  await page.keyboard.press('Alt+F10');
  assert.strictEqual((await activeInfo(page)).name, 'undo');
  await page.keyboard.press('ArrowRight');
  assert.strictEqual((await activeInfo(page)).name, 'redo');
  await page.keyboard.press('ArrowLeft');
  await page.keyboard.press('ArrowLeft');
  assert.strictEqual((await activeInfo(page)).name, 'codeview', 'seta para a esquerda no primeiro deveria ir ao último');
  await page.keyboard.press('Escape');
  assert.strictEqual((await activeInfo(page)).tag, 'DIV');
  assert.strictEqual(await page.evaluate(function () { return document.activeElement.classList.contains('editor-content'); }), true);
});

test('A11y: menu de formatos operável pelo teclado', async function () {
  var page = await setup();
  await state(page, '<p>Título</p>', { from: ['Título', 2] });
  await page.focus('[data-name="formatBlock"]');
  await page.keyboard.press('Enter');
  var info = await activeInfo(page);
  assert.strictEqual(info.role, 'menuitem');
  assert.strictEqual(info.text, 'Parágrafo');
  assert.strictEqual(await page.getAttribute('[data-name="formatBlock"]', 'aria-expanded'), 'true');
  await page.keyboard.press('ArrowDown');
  assert.strictEqual((await activeInfo(page)).text, 'Título 1');
  await page.keyboard.press('Enter');
  assert.strictEqual(await content(page), '<h1>Título</h1>');
  assert.strictEqual(await page.getAttribute('[data-name="formatBlock"]', 'aria-expanded'), 'false');
  assert.strictEqual((await activeInfo(page)).inContent || (await page.evaluate(function () { return document.activeElement.classList.contains('editor-content'); })), true);
});

test('A11y: Esc fecha o menu e devolve o foco ao botão', async function () {
  var page = await setup();
  await state(page, '<p>x</p>', { from: ['x', 1] });
  await page.focus('[data-name="fontSize"]');
  await page.keyboard.press('ArrowDown');
  assert.strictEqual((await activeInfo(page)).role, 'menuitem');
  await page.keyboard.press('Escape');
  assert.strictEqual((await activeInfo(page)).name, 'fontSize');
  assert.strictEqual(await page.evaluate(function () { return window.$('.editor-dropdown-menu:visible').length; }), 0);
});

test('A11y: popover de link é um diálogo com rótulos, Tab preso e Esc', async function () {
  var page = await setup('<p>texto</p>');
  await page.click('.editor-content p');
  await page.keyboard.press('Control+k');
  var dialog = await page.evaluate(function () {
    var pop = window.$('.editor-link-popover')[0];
    var labels = Array.prototype.map.call(pop.querySelectorAll('label[for]'), function (l) {
      var field = document.getElementById(l.htmlFor);
      return !!field && pop.contains(field);
    });
    return { role: pop.getAttribute('role'), name: pop.getAttribute('aria-label'), labels: labels };
  });
  assert.deepStrictEqual(dialog, { role: 'dialog', name: 'Inserir link', labels: [true, true] });

  for (var i = 0; i < 8; i++) await page.keyboard.press('Tab');
  assert.strictEqual(await page.evaluate(function () { return window.$('.editor-link-popover')[0].contains(document.activeElement); }), true, 'foco escapou do diálogo');

  await page.keyboard.press('Escape');
  assert.strictEqual(await page.evaluate(function () { return window.$('.editor-link-popover').is(':visible'); }), false);
  assert.strictEqual((await activeInfo(page)).name, 'link');
});

test('A11y: erro da IA aparece no popover, sem alert()', async function () {
  var page = await setup('<p>x</p>');
  var dialogs = 0;
  page.on('dialog', function (d) { dialogs++; d.dismiss(); });
  await page.evaluate(function () {
    window.$('#t').data('weaver').options.onAiGenerate = function (prompt, done) { done(null, 'cota esgotada'); };
  });
  await state(page, '<p>x</p>', { from: ['x', 1] });
  await exec(page, 'ai');
  await page.fill('.editor-ai-popover textarea', 'Escreva algo');
  await page.keyboard.press('Control+Enter');
  var err = await page.evaluate(function () { var e = window.$('.editor-ai-error'); return { visible: e.is(':visible'), role: e.attr('role'), text: e.text() }; });
  assert.strictEqual(dialogs, 0);
  assert.deepStrictEqual(err, { visible: true, role: 'alert', text: 'Não foi possível gerar o conteúdo: cota esgotada' });
});

test('A11y: grade de tabela pelo teclado', async function () {
  var page = await setup();
  await state(page, '<p>x</p>', { from: ['x', 1] });
  await page.focus('[data-name="table"]');
  await page.keyboard.press('Enter');
  assert.strictEqual(await page.evaluate(function () { return document.activeElement.classList.contains('editor-table-grid'); }), true);
  await page.keyboard.press('ArrowRight');
  await page.keyboard.press('ArrowRight');
  await page.keyboard.press('ArrowDown');
  assert.strictEqual(await page.evaluate(function () { return window.$('.grid-label').text(); }), '3 x 2');
  await page.keyboard.press('Enter');
  var html = await content(page);
  assert.strictEqual((html.match(/<tr>/g) || []).length, 2, html);
  assert.strictEqual((html.match(/<td/g) || []).length, 6, html);
});

test('A11y: menu da tabela pelo teclado (tecla de menu)', async function () {
  var page = await setup('<table><tbody><tr><td>1</td></tr></tbody></table>');
  await page.evaluate(function () {
    var td = document.querySelector('.editor-content td');
    td.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true }));
  });
  assert.strictEqual((await activeInfo(page)).role, 'menuitem');
  await page.keyboard.press('ArrowDown'); // Inserir Linha Abaixo
  await page.keyboard.press('Enter');
  var rows = await page.evaluate(function () { return document.querySelectorAll('.editor-content tr').length; });
  assert.strictEqual(rows, 2);
  assert.strictEqual(await page.evaluate(function () { return window.$('.editor-table-context-menu').is(':visible'); }), false);
});

test('A11y: <label for> da página nomeia a área de edição', async function () {
  var page = await browser.newPage();
  await page.route('**/*', function (route) { return route.abort(); });
  await page.setContent('<form><label for="t">Corpo do artigo</label><textarea id="t"></textarea></form>');
  await page.addScriptTag({ content: JQUERY });
  await page.addScriptTag({ content: EDITOR });
  await page.evaluate(function () { window.$('#t').weaver(); });
  var info = await page.evaluate(function () {
    var content = document.querySelector('.editor-content');
    var labelId = content.getAttribute('aria-labelledby');
    return { label: labelId && document.getElementById(labelId).textContent, ariaLabel: content.getAttribute('aria-label') };
  });
  assert.deepStrictEqual(info, { label: 'Corpo do artigo', ariaLabel: null });
  await page.click('label');
  assert.strictEqual(await page.evaluate(function () { return document.activeElement.classList.contains('editor-content'); }), true);
});

test('A11y: botões ativos expõem aria-pressed', async function () {
  var page = await setup();
  await state(page, '<p><b>forte</b></p>', { from: ['forte', 2] });
  await page.evaluate(function () { window.$('#t').data('weaver').updateToolbar(); });
  assert.strictEqual(await page.getAttribute('[data-name="bold"]', 'aria-pressed'), 'true');
  assert.strictEqual(await page.getAttribute('[data-name="italic"]', 'aria-pressed'), null);
});

// =========================
// APS: HTML original e modo confiável
// =========================

function getContent(page) {
  return page.evaluate(function () { return window.$('#t').data('weaver').getContent(); });
}

/** Opções do modo confiável usadas no APS. */
var TRUSTED = {
  forbiddenTags: [],
  allowedTags: '*',
  allowedAttributes: { '*': '*' },
  allowedStyles: '*',
  allowCssUrls: true,
  keepComments: true,
  iframeAttributes: false,
  allowedIframeSources: '*'
};

var APS_HTML = '<!-- banner -->\n' +
  '<section data-id="1" style="background-image:url(https://img.irroba.com.br/a.jpg);display:grid;gap:8px">\n' +
  '  <style>.x{color:red}</style>\n' +
  '  <font face="Arial">texto</font>\n' +
  '  <iframe src="https://www.google.com/maps/embed?pb=1"></iframe>\n' +
  '  <script>window.__ran = 1<\/script>\n' +
  '</section>';

test('APS: modo confiável devolve o HTML idêntico sem edição', async function () {
  var page = await setup(APS_HTML, TRUSTED);
  assert.strictEqual(await getContent(page), APS_HTML);
  assert.strictEqual(await page.evaluate(function () { return window.__ran || 0; }), 0);
});

test('APS: modo confiável preserva tudo também depois de editar', async function () {
  var page = await setup(APS_HTML, TRUSTED);
  await page.evaluate(function () {
    var ed = window.$('#t').data('weaver');
    ed.$content.find('font').append(' mais');
    ed.trigger('change');
  });
  var html = await getContent(page);
  ['<!-- banner -->', 'data-id="1"', 'style="background-image:url(https://img.irroba.com.br/a.jpg);display:grid;gap:8px"',
    '<style>.x{color:red}</style>', '<font face="Arial">texto mais</font>', 'src="https://www.google.com/maps/embed?pb=1"', '<script>window.__ran = 1</script>'
  ].forEach(function (piece) {
    assert.ok(html.indexOf(piece) !== -1, 'faltou ' + piece + ' em ' + html);
  });
  assert.ok(html.indexOf('sandbox') === -1, html);
  assert.ok(html.indexOf('weaver') === -1, html);
});

test('APS: <script> e <style> viram marcador inerte no editor', async function () {
  var page = await setup(APS_HTML, TRUSTED);
  var live = await page.evaluate(function () {
    var c = window.$('#t').data('weaver').$content;
    return { script: c.find('script').length, style: c.find('style').length, raw: c.find('weaver-raw').length };
  });
  assert.deepStrictEqual(live, { script: 0, style: 0, raw: 2 });
});

test('APS: modo padrão devolve o HTML original quando nada foi removido', async function () {
  var original = '<p style="color:red;text-align:center">Olá &amp; <b>mundo</b></p>\n<p class=\'x\'>dois</p>';
  var page = await setup(original);
  assert.strictEqual(await getContent(page), original);
  // E é isso que vai no submit do formulário
  var submitted = await page.evaluate(function () {
    window.$('form').on('submit', function (e) { e.preventDefault(); });
    window.$('form').trigger('submit');
    return window.$('#t').val();
  });
  assert.strictEqual(submitted, original);
});

test('APS: modo padrão não devolve o original se a sanitização removeu algo', async function () {
  var page = await setup('<p onclick="x()">a</p><section>b</section>');
  assert.strictEqual(await getContent(page), '<p>a</p>b');
});

test('APS: depois de editar vale o conteúdo novo; desfazer volta ao original', async function () {
  var original = '<p style="color:red">a</p>';
  var page = await setup(original);
  await state(page, '<p style="color:red">a</p>', { from: ['a', 1] });
  await page.evaluate(function () {
    var ed = window.$('#t').data('weaver');
    ed.history.save();
    ed.$content.find('p').append('b');
    ed.history.save();
  });
  assert.strictEqual(await getContent(page), '<p style="color:red">ab</p>');
  await exec(page, 'undo');
  assert.strictEqual(await getContent(page), original);
});

test('APS: focar e sair sem editar não normaliza o conteúdo', async function () {
  var original = '<div class="clearfix"></div><p><b><b>x</b></b></p><p></p>';
  var page = await setup(original);
  await page.evaluate(function () {
    var ed = window.$('#t').data('weaver');
    ed.$content.focus();
    ed.$content.blur();
  });
  assert.strictEqual(await getContent(page), original);
});

test('APS: normalizador mantém elementos vazios com atributos', async function () {
  var page = await setup('<div class="clearfix"></div><p>a<b></b></p>');
  await page.evaluate(function () {
    var ed = window.$('#t').data('weaver');
    ed.$content.find('p').append('b');
    ed.$content.focus();
    ed.$content.blur();
  });
  assert.strictEqual(await getContent(page), '<div class="clearfix"></div><p>ab</p>');
});

test('APS: rel="nofollow" é mantido em links com target _blank', async function () {
  var page = await setup('<p><a href="https://x.com" target="_blank" rel="nofollow">x</a> <a href="/y" rel="sponsored">y</a></p>');
  var html = await page.evaluate(function () { return window.$('#t').data('weaver').$content.html(); });
  assert.ok(html.indexOf('rel="nofollow noopener noreferrer"') !== -1, html);
  assert.ok(html.indexOf('rel="sponsored"') !== -1, html);
});

test('APS: data-* e aria-* liberados por RegExp', async function () {
  var page = await setup('<p data-a="1" aria-label="r" data-x-y="2" foo="3">a</p>', {
    allowedAttributes: { '*': ['class', /^data-[\w-]+$/, /^aria-[\w-]+$/] }
  });
  assert.strictEqual(await getContent(page), '<p data-a="1" aria-label="r" data-x-y="2">a</p>');
});

test('APS: allowedTags "*" mantém tags HTML desconhecidas pela lista padrão', async function () {
  var html = '<section><article><header>h</header><details><summary>s</summary>d</details><dl><dt>t</dt><dd>d</dd></dl></article></section>';
  var page = await setup(html, { allowedTags: '*' });
  assert.strictEqual(await getContent(page), html);
});

test('APS: code view mostra o código protegido restaurado', async function () {
  var page = await setup('<p>a</p><style>.x{}</style>', TRUSTED);
  var code = await page.evaluate(function () {
    var ed = window.$('#t').data('weaver');
    ed.exec('codeview');
    return ed.getPlugin('CodeViewPlugin').$textarea.val();
  });
  assert.ok(code.indexOf('<style>.x{}</style>') !== -1, code);
  assert.ok(code.indexOf('weaver-raw') === -1, code);
});

// =========================
// APS: botões customizados e API de inserção
// =========================

/** Recria o editor dentro da página (funções não passam pelo Playwright). */
async function setupWith(page, html, factory) {
  await page.evaluate(function (args) {
    window.$('#t').weaver('destroy');
    window.$('#t').val(args.html);
    window.$('#t').weaver(new Function('return ' + args.factory)()());
  }, { html: html, factory: factory.toString() });
}

test('APS: botão customizado aparece no grupo e recebe o editor', async function () {
  var page = await setup();
  page.warnings = [];
  page.on('console', function (m) { if (m.type() === 'warning') page.warnings.push(m.text()); });
  await setupWith(page, '<p>a</p>', function () {
    return {
      buttons: {
        imageManager: {
          icon: 'images',
          title: 'Gerenciar imagens',
          action: function (editor, $button) { window.__action = [editor === window.$('#t').data('weaver'), $button.attr('data-name')]; },
          isActive: function () { return true; }
        }
      },
      toolbar: [['insert', ['link', 'imageManager', 'naoExiste']]]
    };
  });
  var info = await page.evaluate(function () {
    var ed = window.$('#t').data('weaver');
    var $btns = ed.$toolbar.find('.editor-toolbar-group').first().children('button');
    ed.$toolbar.find('[data-name="imageManager"]').trigger('click');
    return { names: $btns.map(function () { return this.getAttribute('data-name'); }).get(), title: $btns.eq(1).attr('aria-label'), pressed: $btns.eq(1).attr('aria-pressed'), action: window.__action, link: !!ed.getPlugin('LinkPlugin') };
  });
  assert.deepStrictEqual(info.names, ['link', 'imageManager']);
  assert.strictEqual(info.title, 'Gerenciar imagens');
  assert.strictEqual(info.pressed, 'true');
  assert.deepStrictEqual(info.action, [true, 'imageManager']);
  assert.strictEqual(info.link, true);
  assert.ok(page.warnings.some(function (w) { return w.indexOf('naoExiste') !== -1; }), page.warnings.join('|'));
});

test('APS: botão customizado entra na navegação por setas da barra', async function () {
  var page = await setup();
  await setupWith(page, '<p>a</p>', function () {
    return { buttons: { meu: { text: 'Meu', action: function () {} } }, toolbar: [['g', ['bold', 'meu', 'italic']]] };
  });
  var focused = await page.evaluate(function () {
    var ed = window.$('#t').data('weaver');
    ed.$toolbar.find('[data-name="bold"]')[0].focus();
    ed.$toolbar.find('[data-name="bold"]').trigger(window.$.Event('keydown', { key: 'ArrowRight' }));
    return document.activeElement.getAttribute('data-name');
  });
  assert.strictEqual(focused, 'meu');
});

test('APS: botão dropdown customizado chama action com o valor', async function () {
  var page = await setup();
  await setupWith(page, '<p>a</p>', function () {
    return { buttons: { modelo: { type: 'dropdown', text: 'Modelos', options: ['A', { label: 'Bê', value: 'B' }], action: function (ed, value) { window.__value = value; } } }, toolbar: [['g', ['modelo']]] };
  });
  var value = await page.evaluate(function () {
    window.$('#t').data('weaver').$toolbar.find('[data-value="B"]').trigger('click');
    return window.__value;
  });
  assert.strictEqual(value, 'B');
});

test('APS: registerButton vale para todos os editores', async function () {
  var page = await setup();
  await page.evaluate(function () {
    window.WysiwygEditor.registerButton('global', { text: 'G', action: function () {} });
  });
  await setupWith(page, '', function () { return { toolbar: [['g', ['global']]] }; });
  assert.strictEqual(await page.evaluate(function () { return window.$('#t').data('weaver').$toolbar.find('[data-name="global"]').length; }), 1);
});

test('APS: extraPlugins soma aos plugins automáticos', async function () {
  var page = await setup();
  await setupWith(page, '', function () {
    function MeuPlugin(editor) { this.editor = editor; }
    MeuPlugin.pluginName = 'MeuPlugin';
    MeuPlugin.prototype.init = function () { window.__extra = true; };
    return { extraPlugins: [MeuPlugin], toolbar: [['g', ['link', 'table']]] };
  });
  var info = await page.evaluate(function () {
    var ed = window.$('#t').data('weaver');
    return [window.__extra, !!ed.getPlugin('MeuPlugin'), !!ed.getPlugin('LinkPlugin'), !!ed.getPlugin('TablePlugin'), !!ed.getPlugin('HistoryPlugin')];
  });
  assert.deepStrictEqual(info, [true, true, true, true, true]);
});

test('APS: insertHTML insere na seleção salva depois de um modal roubar o foco', async function () {
  var page = await setup();
  await state(page, '<p>início fim</p>', { from: ['início', 6] });
  var html = await page.evaluate(function () {
    var ed = window.$('#t').data('weaver');
    ed.saveSelection();
    var input = document.createElement('input');
    document.body.appendChild(input);
    input.focus();
    ed.insertHTML('<b>MEIO</b>');
    return ed.$content.html();
  });
  assert.strictEqual(html, '<p>início<b>MEIO</b> fim</p>');
});

test('APS: insertHTML usa a posição de antes do blur sem saveSelection', async function () {
  var page = await setup();
  await state(page, '<p>ab</p>', { from: ['ab', 1] });
  var html = await page.evaluate(function () {
    var ed = window.$('#t').data('weaver');
    var input = document.createElement('input');
    document.body.appendChild(input);
    input.focus();
    ed.insertHTML('X');
    return ed.$content.html();
  });
  assert.strictEqual(html, '<p>aXb</p>');
});

test('APS: desfazer remove a inserção em um passo', async function () {
  var page = await setup('<p>ab</p>');
  await state(page, '<p>ab</p>', { from: ['ab', 1] });
  await page.evaluate(function () {
    var ed = window.$('#t').data('weaver');
    ed.saveSelection();
    ed.insertHTML('<i>1</i><i>2</i>');
  });
  assert.strictEqual(await content(page), '<p>a<i>1</i><i>2</i>b</p>');
  await exec(page, 'undo');
  assert.strictEqual(await content(page), '<p>ab</p>');
});

test('APS: insertImage valida a URL e aplica atributos e imageDefaults', async function () {
  var page = await setup('', { imageDefaults: { style: 'max-width:100%' } });
  var result = await page.evaluate(function () {
    var ed = window.$('#t').data('weaver');
    var ok = ed.insertImage('https://img.irroba.com.br/a.jpg', { alt: 'A "x"', width: 300 });
    var bad = ed.insertImage('javascript:alert(1)');
    return { ok: ok, bad: bad, html: ed.$content.html() };
  });
  assert.strictEqual(result.ok, true);
  assert.strictEqual(result.bad, false);
  assert.strictEqual(result.html, '<img style="max-width:100%" alt="A &quot;x&quot;" width="300" src="https://img.irroba.com.br/a.jpg">');
});

test('APS: insertHTML sanitiza o conteúdo', async function () {
  var page = await setup();
  var html = await page.evaluate(function () {
    var ed = window.$('#t').data('weaver');
    ed.insertHTML('<img src="x" onerror="window.__pwned=1"><p>ok</p>');
    return ed.$content.html();
  });
  assert.ok(!/onerror/.test(html) && /ok/.test(html), html);
});

// =========================
// APS: colar imagens e barra da imagem
// =========================

var PNG_1PX = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=';

/** Editor com uploadImage que conta as chamadas e devolve URLs previsíveis. */
function uploadingEditor(extra) {
  return function () {
    var opts = {
      uploadPastedImages: true,
      toolbar: [['font', ['bold']]],
      uploadImage: function (file, done) {
        window.__uploads = (window.__uploads || []).concat([file.name + '|' + file.type]);
        done('https://cdn.example/' + window.__uploads.length + '.png', { alt: 'up' });
      }
    };
    return opts;
  };
}

async function pasteData(page, spec) {
  await page.evaluate(function (spec) {
    var ed = window.$('#t').data('weaver');
    ed.$content.focus();
    var r = document.createRange();
    r.selectNodeContents(ed.$content[0]);
    r.collapse(false);
    window.getSelection().removeAllRanges();
    window.getSelection().addRange(r);
    var dt = new DataTransfer();
    if (spec.html) dt.setData('text/html', spec.html);
    if (spec.text) dt.setData('text/plain', spec.text);
    for (var i = 0; i < (spec.files || 0); i++) {
      var bin = atob(spec.png.split(',')[1]);
      var bytes = new Uint8Array(bin.length);
      for (var b = 0; b < bin.length; b++) bytes[b] = bin.charCodeAt(b);
      dt.items.add(new File([bytes], 'print' + i + '.png', { type: 'image/png' }));
    }
    ed.$content[0].dispatchEvent(new ClipboardEvent('paste', { clipboardData: dt, bubbles: true, cancelable: true }));
  }, spec);
  await page.waitForTimeout(150);
}

test('APS: colar um print chama uploadImage uma vez e insere a URL', async function () {
  var page = await setup();
  await setupWith(page, '<p>a</p>', uploadingEditor());
  await pasteData(page, { files: 1, png: PNG_1PX });
  assert.deepStrictEqual(await page.evaluate(function () { return window.__uploads; }), ['print0.png|image/png']);
  var html = await content(page);
  assert.ok(html.indexOf('<img alt="up" src="https://cdn.example/1.png">') !== -1, html);
});

test('APS: colar HTML com duas imagens base64 envia as duas e tira o data:', async function () {
  var page = await setup();
  await setupWith(page, '', uploadingEditor());
  var png2 = PNG_1PX.replace('YII=', 'YIA=');
  await pasteData(page, { html: '<p>texto <img src="' + PNG_1PX + '"> e <img src="' + png2 + '"></p>' });
  await page.waitForTimeout(150);
  assert.strictEqual((await page.evaluate(function () { return window.__uploads; })).length, 2);
  var html = await page.evaluate(function () { return window.$('#t').data('weaver').getContent(); });
  assert.ok(html.indexOf('data:') === -1, html);
  assert.ok(html.indexOf('https://cdn.example/1.png') !== -1 && html.indexOf('https://cdn.example/2.png') !== -1, html);
});

test('APS: colar do Excel (HTML com tabela + PNG) cola a tabela, não o print', async function () {
  var page = await setup();
  await setupWith(page, '', uploadingEditor());
  await pasteData(page, { html: '<table><tr><td>1</td></tr></table>', text: '1', files: 1, png: PNG_1PX });
  assert.strictEqual(await page.evaluate(function () { return window.__uploads; }), undefined);
  assert.ok((await content(page)).indexOf('<td>1</td>') !== -1);
});

test('APS: sem uploadPastedImages, data: colado fica como está', async function () {
  var page = await setup();
  await pasteData(page, { html: '<p><img src="' + PNG_1PX + '"></p>' });
  assert.ok((await content(page)).indexOf('data:image/png') !== -1);
});

test('APS: botão extra na barra da imagem troca o src com replaceImage', async function () {
  var page = await setup();
  await setupWith(page, '<p><img src="https://a.com/1.jpg" alt="Foto" style="width: 50%; float: left"></p>', function () {
    return {
      toolbar: [['insert', ['image']]],
      imageToolbar: { add: [{ name: 'trocar', icon: 'replace', title: 'Trocar imagem', action: function (editor, img) {
        window.__same = img === editor.getSelectedImage();
        editor.replaceImage(img, 'https://a.com/2.jpg', { 'data-x': null });
      } }], remove: ['w25'] }
    };
  });
  var info = await page.evaluate(function () {
    var ed = window.$('#t').data('weaver');
    var img = ed.$content.find('img')[0];
    window.$(img).trigger('click');
    var $tb = ed.getPlugin('ImagePlugin').$toolbar;
    var hasW25 = $tb.find('[title="Largura 25%"]').length;
    $tb.find('[title="Trocar imagem"]').trigger('click');
    return { same: window.__same, hasW25: hasW25, html: ed.getContent() };
  });
  assert.strictEqual(info.same, true);
  assert.strictEqual(info.hasW25, 0);
  assert.strictEqual(info.html, '<p><img src="https://a.com/2.jpg" alt="Foto" style="width: 50%; float: left"></p>');
  await exec(page, 'undo');
  assert.ok((await page.evaluate(function () { return window.$('#t').data('weaver').getContent(); })).indexOf('https://a.com/1.jpg') !== -1);
});

test('APS: replaceImage recusa URL insegura', async function () {
  var page = await setup('<p><img src="https://a.com/1.jpg"></p>');
  var ok = await page.evaluate(function () {
    var ed = window.$('#t').data('weaver');
    return ed.replaceImage(ed.$content.find('img')[0], 'javascript:alert(1)');
  });
  assert.strictEqual(ok, false);
});

test('APS: uploadImage carrega o plugin de imagem sem o botão image', async function () {
  var page = await setup();
  await setupWith(page, '', function () { return { toolbar: [['font', ['bold']]], uploadImage: function () {} }; });
  assert.strictEqual(await page.evaluate(function () { return !!window.$('#t').data('weaver').getPlugin('ImagePlugin'); }), true);
});

// =========================
// APS: FONTES DINÂMICAS
// =========================

function manyFonts() {
  return function () {
    var names = ['Lobster', 'Pacifico', 'Arial'];
    for (var i = 0; i < 1500; i++) names.push('Fonte ' + i);
    window.__fontApplied = [];
    return {
      fontNames: names,
      onFontApply: function (name, editor) { window.__fontApplied.push([name, editor === window.$('#t').data('weaver')]); }
    };
  };
}

function fontLinks(page) {
  return page.evaluate(function () {
    return window.$('link[data-weaver-font]').map(function () { return this.getAttribute('data-weaver-font'); }).get();
  });
}

test('APS: 1.500 fontes só montam o menu ao abrir e carregam as visíveis', async function () {
  var page = await setup();
  await setupWith(page, '<p>a</p>', manyFonts());
  assert.strictEqual(await page.evaluate(function () { return window.$('[data-name="fontName"]').next().find('.editor-dropdown-item').length; }), 0);

  var ms = await page.evaluate(function () {
    var t = performance.now();
    window.$('[data-name="fontName"]').trigger('click');
    return performance.now() - t;
  });
  assert.ok(ms < 500, 'abrir levou ' + ms + 'ms');

  var info = await page.evaluate(function () {
    var $menu = window.$('[data-name="fontName"]').next();
    return { items: $menu.find('.editor-dropdown-item').length, search: $menu.find('input[type="search"]').length };
  });
  assert.deepStrictEqual(info, { items: 1503, search: 1 });

  await page.waitForTimeout(100);
  var links = await fontLinks(page);
  assert.ok(links.indexOf('Lobster') !== -1, links.join());
  assert.ok(links.indexOf('Arial') === -1, 'fonte do sistema não vai ao Google');
  assert.ok(links.length < 60, 'carregou ' + links.length + ' fontes');
});

test('APS: busca filtra as fontes e avisa quando não encontra', async function () {
  var page = await setup();
  await setupWith(page, '<p>a</p>', manyFonts());
  await page.click('[data-name="fontName"]');
  var menu = '.editor-dropdown-menu:has(input[type="search"])';

  await page.fill(menu + ' input[type="search"]', 'lob');
  assert.deepStrictEqual(await page.$$eval(menu + ' .editor-dropdown-item', function (els) {
    return els.filter(function (el) { return el.style.display !== 'none'; }).map(function (el) { return el.getAttribute('data-value'); });
  }), ['Lobster']);

  await page.fill(menu + ' input[type="search"]', 'zzz');
  assert.strictEqual(await page.isVisible('text=Nenhuma fonte encontrada'), true);
});

test('APS: escolher Lobster pela busca aplica na seleção, carrega e chama onFontApply', async function () {
  var page = await setup();
  await setupWith(page, '<p>texto aqui</p>', manyFonts());
  await state(page, '<p>texto aqui</p>', { from: ['texto', 0], to: ['texto', 5] });
  await page.click('[data-name="fontName"]');
  await page.keyboard.type('lobs'); // a busca recebe o foco ao abrir
  await page.keyboard.press('Enter');

  var html = await content(page);
  assert.ok(/<span style="font-family: Lobster;">texto<\/span> aqui/.test(html), html);
  assert.ok((await fontLinks(page)).indexOf('Lobster') !== -1);
  assert.deepStrictEqual(await page.evaluate(function () { return window.__fontApplied; }), [['Lobster', true]]);
});

test('APS: fontes usadas no conteúdo são carregadas ao abrir o editor', async function () {
  var page = await setup();
  await setupWith(page, '<p><span style="font-family: \'Pacifico\', cursive">a</span><span style="font-family: Pacifico">b</span>' +
    '<span style="font-family: Arial">c</span><span style="font-family: \'x&amp;family=Evil\'">d</span></p>', function () { return {}; });
  assert.deepStrictEqual(await fontLinks(page), ['Pacifico']);

  // <font face> (modo confiável) também conta
  await setupWith(page, '<p><font face="Lobster">b</font></p>', function () { return { allowedTags: '*', allowedAttributes: { '*': '*' } }; });
  assert.ok((await fontLinks(page)).indexOf('Lobster') !== -1);
});

test('APS: googleFonts false não carrega fontes do conteúdo nem do menu', async function () {
  var page = await setup('<p><span style="font-family: Pacifico">a</span></p>', { googleFonts: false });
  await page.click('[data-name="fontName"]');
  await page.waitForTimeout(100);
  assert.deepStrictEqual(await fontLinks(page), []);
});

/**
 * Cores calculadas da toolbar, de um item de menu, do conteúdo e do code view,
 * com o contraste (WCAG) entre texto e fundo de cada um.
 */
async function themeColors(page) {
  return page.evaluate(function () {
    function rgb(c) { var m = c.match(/[\d.]+/g).map(Number); return m; }
    function lum(c) {
      var v = rgb(c).slice(0, 3).map(function (x) { x /= 255; return x <= 0.03928 ? x / 12.92 : Math.pow((x + 0.055) / 1.055, 2.4); });
      return 0.2126 * v[0] + 0.7152 * v[1] + 0.0722 * v[2];
    }
    function contrast(fg, bg) {
      var a = lum(fg), b = lum(bg);
      return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
    }
    // Fundo efetivo: sobe até o primeiro ancestral com fundo opaco
    function backdrop(el) {
      for (; el && el.nodeType === 1; el = el.parentNode) {
        var bg = getComputedStyle(el).backgroundColor;
        if (bg !== 'rgba(0, 0, 0, 0)' && bg !== 'transparent') return bg;
      }
      return 'rgb(255, 255, 255)';
    }
    function info(el) {
      var cs = getComputedStyle(el);
      return { bg: cs.backgroundColor, fg: cs.color, border: cs.borderTopColor, contrast: contrast(cs.color, backdrop(el)) };
    }
    var ed = window.$('#t').data('weaver');
    var $menu = ed.$toolbar.find('[data-name="formatBlock"]').closest('.editor-dropdown-wrapper').find('.editor-dropdown-menu');
    $menu.css('display', 'flex');
    var item = $menu.find('[role="menuitem"]')[0];
    var codeview = ed.$container.find('.editor-codeview-wrapper')[0];
    codeview.style.display = 'block';
    var r = {
      toolbar: info(ed.$toolbar[0]),
      button: info(ed.$toolbar.find('[data-name="bold"]')[0]),
      menu: info($menu[0]),
      item: info(item),
      content: info(ed.$content[0]),
      code: info(ed.$container.find('.editor-codeview-highlight')[0]),
      codeBg: getComputedStyle(codeview).backgroundColor
    };
    r.code.contrast = contrast(r.code.fg, r.codeBg);
    codeview.style.display = '';
    $menu.css('display', '');
    return r;
  });
}

function assertReadable(c, label) {
  ['toolbar', 'button', 'item', 'content', 'code'].forEach(function (k) {
    assert.ok(c[k].contrast >= 4.5, label + ': ' + k + ' com contraste ' + c[k].contrast.toFixed(2) + ' ' + JSON.stringify(c[k]));
  });
}

test('APS: <html class="dark"> deixa toolbar, menus, conteúdo e code view escuros e legíveis', async function () {
  var page = await setup('<p>texto</p>');
  var light = await themeColors(page);
  assert.strictEqual(light.content.bg, 'rgb(255, 255, 255)');
  assert.strictEqual(light.toolbar.bg, 'rgb(249, 250, 251)');
  assertReadable(light, 'claro');

  await page.evaluate(function () { document.documentElement.classList.add('dark'); });
  var dark = await themeColors(page);
  assert.strictEqual(dark.content.bg, 'rgb(17, 24, 39)');
  assert.strictEqual(dark.toolbar.bg, 'rgb(31, 41, 55)');
  assert.strictEqual(dark.menu.bg, 'rgb(55, 65, 81)');
  assert.strictEqual(dark.codeBg, 'rgb(30, 30, 30)');
  assertReadable(dark, 'escuro');

  // O integrador redefine as variáveis com um seletor simples
  await page.addStyleTag({ content: '.wysiwyg-editor{--weaver-accent:#0f766e}.dark .wysiwyg-editor{--weaver-content-bg:#fff;--weaver-content-fg:#111}' });
  var custom = await themeColors(page);
  assert.strictEqual(custom.content.bg, 'rgb(255, 255, 255)');
  assert.strictEqual(custom.toolbar.bg, 'rgb(31, 41, 55)');
});

test('APS: opção theme fixa o tema, e setTheme troca depois', async function () {
  var page = await setup('<p>texto</p>', { theme: 'light' });
  await page.evaluate(function () { document.documentElement.classList.add('dark'); });
  assert.strictEqual((await themeColors(page)).content.bg, 'rgb(255, 255, 255)', 'light ignora .dark');

  await page.evaluate(function () {
    document.documentElement.classList.remove('dark');
    window.$('#t').data('weaver').setTheme('dark');
  });
  assert.strictEqual((await themeColors(page)).content.bg, 'rgb(17, 24, 39)', 'dark sem .dark na página');

  await page.evaluate(function () { window.$('#t').data('weaver').setTheme('auto'); });
  await page.emulateMedia({ colorScheme: 'light' });
  assert.strictEqual((await themeColors(page)).content.bg, 'rgb(255, 255, 255)', 'auto com sistema claro');
  await page.emulateMedia({ colorScheme: 'dark' });
  assert.strictEqual((await themeColors(page)).content.bg, 'rgb(17, 24, 39)', 'auto com sistema escuro');

  // Sem theme, o modo escuro do sistema não muda nada (comportamento anterior)
  await page.evaluate(function () { window.$('#t').data('weaver').setTheme(null); });
  assert.strictEqual((await themeColors(page)).content.bg, 'rgb(255, 255, 255)', 'sem theme ignora o sistema');
});

test('APS: Tailwind da página com outra paleta não muda a aparência do editor', async function () {
  var page = await setup('<h1>T</h1><ul><li>a</li></ul>');
  var before = await themeColors(page);

  // Utilitárias com as mesmas classes e outras cores, antes e depois do CSS do Weaver,
  // mais o preflight do Tailwind (listas sem marcador, títulos sem tamanho)
  await page.evaluate(function () {
    var css = '.bg-white{background-color:red}.bg-gray-50{background-color:#ff0}.border-gray-300{border-color:lime}' +
      '.border-gray-200{border-color:lime}.text-gray-700{color:pink}.text-gray-800{color:pink}.border{border-color:lime}' +
      '.prose{color:purple}ul,ol{list-style:none;margin:0;padding:0}h1{font-size:inherit;font-weight:inherit}';
    var head = document.createElement('style'); head.textContent = css;
    document.head.insertBefore(head, document.head.firstChild);
    var tail = document.createElement('style'); tail.textContent = css;
    document.body.appendChild(tail);
  });

  assert.deepStrictEqual(await themeColors(page), before);
  var content = await page.evaluate(function () {
    var c = window.$('#t').data('weaver').$content[0];
    return {
      list: getComputedStyle(c.querySelector('ul')).listStyleType,
      h1: getComputedStyle(c.querySelector('h1')).fontWeight,
      prose: c.classList.contains('prose')
    };
  });
  assert.deepStrictEqual(content, { list: 'disc', h1: '700', prose: false });
});

test('APS: WysiwygEditor.VERSION é a versão do package.json', async function () {
  var page = await setup();
  var version = await page.evaluate(function () { return window.WysiwygEditor.VERSION; });
  assert.strictEqual(version, require('../package.json').version);
});

// =========================
// RUNNER
// =========================

(async function run() {
  browser = await playwright.chromium.launch();
  var failed = 0;

  for (var i = 0; i < tests.length; i++) {
    try {
      await tests[i].fn();
      console.log('  ok   ' + tests[i].name);
    } catch (err) {
      failed++;
      console.log('  FALHOU ' + tests[i].name + '\n         ' + String(err && err.message || err).split('\n').join('\n         '));
    }
  }

  await browser.close();
  console.log('\n' + (tests.length - failed) + '/' + tests.length + ' testes passaram');
  process.exit(failed ? 1 : 0);
})();
