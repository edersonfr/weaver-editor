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
  var text = await page.evaluate(function () { return window.$('#t').data('weaver').$content.text().replace(/\s+/g, ' ').trim(); });
  assert.strictEqual(text, 'palavra outra item');
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
