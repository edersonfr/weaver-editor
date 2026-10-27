/**
 * Testes de segurança do Weaver Editor (navegador real via Playwright).
 *
 * Cada teste reproduz uma falha encontrada na análise de segurança e garante
 * que ela não volta. Rode depois de `npx gulp` (os testes usam dist/).
 *
 * Instalação (uma vez):
 *   npm install --no-save playwright jquery@3.6.0
 *   npx playwright install chromium
 *
 * Execução:
 *   npm test
 *
 * Variáveis opcionais: JQUERY_PATH (caminho do jquery.min.js), WEAVER_DIST.
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

/** Abre uma página isolada (sem rede) com o editor inicializado. */
async function setup(initialHtml, options) {
  var page = await browser.newPage();
  await page.route('**/*', function (route) { return route.abort(); });
  await page.setContent('<form><textarea id="t"></textarea></form>');
  await page.evaluate(function (html) { document.getElementById('t').value = html || ''; }, initialHtml || '');
  await page.addScriptTag({ content: JQUERY });
  await page.addScriptTag({ content: EDITOR });
  await page.evaluate(function (opts) { window.$('#t').weaver(opts || {}); }, options || null);
  return page;
}

/** Coloca o cursor no fim do conteúdo do editor. */
function caretAtEnd() {
  var ed = window.$('#t').data('weaver');
  if (!ed.$content[0].lastChild) ed.$content[0].innerHTML = '<p>x</p>';
  ed.$content.focus();
  var r = document.createRange();
  r.selectNodeContents(ed.$content[0].lastChild);
  r.collapse(false);
  var s = window.getSelection();
  s.removeAllRanges();
  s.addRange(r);
}

function content(page) {
  return page.evaluate(function () { return window.$('#t').data('weaver').getContent(); });
}

function flag(page, name) {
  return page.evaluate(function (n) { return window[n] || 0; }, name);
}

async function paste(page, html) {
  await page.evaluate(caretAtEnd);
  await page.evaluate(function (h) {
    var ed = window.$('#t').data('weaver');
    var dt = new DataTransfer();
    dt.setData('text/html', h);
    ed.$content[0].dispatchEvent(new ClipboardEvent('paste', { clipboardData: dt, bubbles: true, cancelable: true }));
  }, html);
  await page.waitForTimeout(150);
}

// =========================
// S1 - colar
// =========================

test('S1: <script> colado não executa e é removido', async function () {
  var page = await setup();
  await paste(page, '<p>oi</p><script>window.__pwned=1<\/script>');
  assert.strictEqual(await flag(page, '__pwned'), 0);
  assert.ok(!/script/i.test(await content(page)));
});

test('S1: <style> colado é removido', async function () {
  var page = await setup();
  await paste(page, '<style>body{display:none}</style><p>oi</p>');
  assert.ok(!/<style/i.test(await content(page)));
});

test('S1: handlers e svg colados são removidos', async function () {
  var page = await setup();
  await paste(page, '<img src="x" onerror="window.__pwned=1"><svg><a><animate onbegin="window.__pwned=1"/></a></svg><p onclick="x">ok</p>');
  await page.waitForTimeout(200);
  assert.strictEqual(await flag(page, '__pwned'), 0);
  var html = await content(page);
  assert.ok(!/onerror|onclick|onbegin|<svg/i.test(html), html);
});

test('S1: texto puro colado não vira HTML', async function () {
  var page = await setup();
  await page.evaluate(caretAtEnd);
  await page.evaluate(function () {
    var ed = window.$('#t').data('weaver');
    var dt = new DataTransfer();
    dt.setData('text/plain', '<img src=x onerror=window.__pwned=1>');
    ed.$content[0].dispatchEvent(new ClipboardEvent('paste', { clipboardData: dt, bubbles: true, cancelable: true }));
  });
  await page.waitForTimeout(150);
  assert.strictEqual(await flag(page, '__pwned'), 0);
  assert.ok((await content(page)).indexOf('&lt;img') !== -1);
});

// =========================
// S2 - conteúdo inicial / setContent / code view
// =========================

test('S2: onerror no conteúdo inicial do textarea não executa', async function () {
  var page = await setup('<p>a</p><img src="x" onerror="window.__pwned=1">');
  await page.waitForTimeout(300);
  assert.strictEqual(await flag(page, '__pwned'), 0);
  assert.ok(!/onerror/i.test(await content(page)));
});

test('S2: setContent (code view) sanitiza', async function () {
  var page = await setup();
  await page.evaluate(function () {
    var ed = window.$('#t').data('weaver');
    ed.exec('codeview');
    ed.getPlugin('CodeViewPlugin').$textarea.val('<img src=x onerror="window.__pwned=1"><script>window.__pwned=2<\/script>');
    ed.exec('codeview');
  });
  await page.waitForTimeout(300);
  assert.strictEqual(await flag(page, '__pwned'), 0);
});

// =========================
// S3 - vídeo
// =========================

test('S3: vídeo com javascript: é recusado', async function () {
  var page = await setup();
  await page.evaluate(caretAtEnd);
  var inserted = await page.evaluate(function () {
    var ed = window.$('#t').data('weaver');
    ed.exec('video');
    var vp = ed.getPlugin('VideoPlugin');
    vp.$urlInput.val('javascript:parent.__pwned=1');
    return vp.insertVideo();
  });
  await page.waitForTimeout(300);
  assert.strictEqual(inserted, false);
  assert.strictEqual(await flag(page, '__pwned'), 0);
  assert.ok(!/iframe/i.test(await content(page)));
});

test('S3: vídeo com injeção de atributo é recusado', async function () {
  var page = await setup();
  await page.evaluate(caretAtEnd);
  await page.evaluate(function () {
    var ed = window.$('#t').data('weaver');
    ed.exec('video');
    var vp = ed.getPlugin('VideoPlugin');
    vp.$urlInput.val('https://youtube.com/watch?v=x" onload="window.__pwned=1');
    vp.insertVideo();
  });
  await page.waitForTimeout(300);
  assert.strictEqual(await flag(page, '__pwned'), 0);
});

test('S3: links legítimos do YouTube e Vimeo continuam funcionando', async function () {
  var page = await setup();
  await page.evaluate(caretAtEnd);
  await page.evaluate(function () {
    var ed = window.$('#t').data('weaver');
    var vp = ed.getPlugin('VideoPlugin');
    ed.exec('video');
    vp.$urlInput.val('https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=10s');
    vp.insertVideo();
    ed.exec('video');
    vp.$urlInput.val('https://vimeo.com/76979871');
    vp.insertVideo();
  });
  var html = await content(page);
  assert.ok(html.indexOf('https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ') !== -1, html);
  assert.ok(html.indexOf('https://player.vimeo.com/video/76979871') !== -1, html);
  assert.ok(/sandbox=/.test(html));
});

test('S3: iframe de outro domínio colado é removido', async function () {
  var page = await setup();
  await paste(page, '<iframe src="https://evil.example/login"></iframe><iframe src="data:image/svg+xml,<svg/>"></iframe><p>ok</p>');
  assert.ok(!/iframe/i.test(await content(page)));
});

// =========================
// S4 - link
// =========================

test('S4: link com javascript: é recusado', async function () {
  var page = await setup();
  await page.evaluate(caretAtEnd);
  var result = await page.evaluate(function () {
    var ed = window.$('#t').data('weaver');
    ed.exec('link');
    var lp = ed.getPlugin('LinkPlugin');
    lp.$urlInput.val('javascript:window.__pwned=1');
    lp.$textInput.val('clique');
    return lp.insertLink();
  });
  assert.strictEqual(result, false);
  assert.ok(!/javascript:/i.test(await content(page)));
});

test('S4: texto do link nunca vira HTML', async function () {
  var page = await setup();
  await page.evaluate(caretAtEnd);
  await page.evaluate(function () {
    var ed = window.$('#t').data('weaver');
    ed.exec('link');
    var lp = ed.getPlugin('LinkPlugin');
    lp.$urlInput.val('https://example.com/" onmouseover="window.__pwned=1');
    lp.$textInput.val('<img src=x onerror="window.__pwned=1">');
    lp.insertLink();
  });
  await page.waitForTimeout(300);
  assert.strictEqual(await flag(page, '__pwned'), 0);
  var html = await content(page);
  assert.ok(html.indexOf('&lt;img') !== -1, html);
  // As aspas da URL ficam dentro do valor do href, sem criar atributo novo
  var attrs = await page.evaluate(function () {
    var a = window.$('#t').data('weaver').$content.find('a')[0];
    return Array.prototype.map.call(a.attributes, function (at) { return at.name; });
  });
  assert.deepStrictEqual(attrs.sort(), ['href', 'rel', 'target'], attrs.join(','));
  assert.strictEqual(await page.evaluate(function () { return window.$('#t').data('weaver').$content.find('img').length; }), 0);
});

test('S4: link legítimo é inserido com rel seguro', async function () {
  var page = await setup();
  await page.evaluate(caretAtEnd);
  await page.evaluate(function () {
    var ed = window.$('#t').data('weaver');
    ed.exec('link');
    var lp = ed.getPlugin('LinkPlugin');
    lp.$urlInput.val('www.example.com');
    lp.$textInput.val('Exemplo');
    lp.insertLink();
  });
  var html = await content(page);
  assert.ok(html.indexOf('href="https://www.example.com"') !== -1, html);
  assert.ok(html.indexOf('rel="noopener noreferrer"') !== -1, html);
});

// =========================
// S5 - preview
// =========================

test('S5: preview não executa código nem acessa a página', async function () {
  var page = await setup();
  await page.evaluate(function () {
    var ed = window.$('#t').data('weaver');
    // Simula conteúdo malicioso já presente no DOM (ex.: extensão do navegador)
    ed.$content[0].innerHTML = '<p>a</p>';
    ed.$content[0].firstChild.setAttribute('onclick', 'parent.__pwned=1');
    var img = document.createElement('img');
    img.setAttribute('src', 'x');
    ed.$content[0].appendChild(img);
    ed.exec('preview');
  });
  await page.waitForTimeout(500);
  assert.strictEqual(await flag(page, '__pwned'), 0);
  var sandbox = await page.evaluate(function () { return window.$('.editor-preview-frame').attr('sandbox'); });
  assert.ok(sandbox !== undefined && sandbox.indexOf('allow-same-origin') === -1 && sandbox.indexOf('allow-scripts') === -1, sandbox);
});

// =========================
// S7 - URLs ofuscadas e CSS
// =========================

test('S7: javascript: com espaço, tab ou quebra de linha é removido', async function () {
  var page = await setup();
  await paste(page, '<a id="a1" href=" javascript:window.__pwned=1">a</a><a id="a2" href="java&#9;script:window.__pwned=2">b</a><a id="a3" href="jav&#x0A;ascript:window.__pwned=3">c</a><a id="a4" href="JaVaScRiPt:window.__pwned=4">d</a>');
  var html = await content(page);
  assert.ok(!/href=/i.test(html), html);
});

test('S7: data: só em imagens raster', async function () {
  var page = await setup();
  await paste(page, '<a href="data:text/html,<script>alert(1)</script>">a</a><img id="ok" src="data:image/png;base64,iVBORw0KGgo="><img id="svg" src="data:image/svg+xml,<svg/>">');
  var html = await content(page);
  assert.ok(html.indexOf('data:image/png') !== -1, html);
  assert.ok(html.indexOf('data:text/html') === -1, html);
  assert.ok(html.indexOf('data:image/svg') === -1, html);
});

test('S7: CSS perigoso é removido e o seguro é mantido', async function () {
  var page = await setup();
  await paste(page, '<p style="position:fixed; top:0; color: red; background: url(https://evil.example/t.png); font-family: \'Open Sans\'; padding: 8px">x</p>');
  var html = await content(page);
  assert.ok(!/position|url\(/i.test(html), html);
  assert.ok(/color: red/.test(html) && /font-family: 'Open Sans'/.test(html) && /padding: 8px/.test(html), html);
});

// =========================
// S8 - desfazer / refazer
// =========================

test('S8: restaurar histórico não executa scripts', async function () {
  var page = await setup();
  await page.evaluate(function () {
    window.$('#t').data('weaver').history.restore('<script>window.__pwned=1<\/script><p>a</p>');
  });
  await page.waitForTimeout(200);
  assert.strictEqual(await flag(page, '__pwned'), 0);
});

// =========================
// IA
// =========================

test('IA: HTML devolvido pela IA é sanitizado', async function () {
  var page = await setup('', {
    onAiGenerate: null
  });
  await page.evaluate(function () {
    var ed = window.$('#t').data('weaver');
    ed.options.onAiGenerate = function (prompt, done) {
      done('<p>Texto</p><script>window.__pwned=1<\/script><img src=x onerror="window.__pwned=2">');
    };
  });
  await page.evaluate(caretAtEnd);
  await page.evaluate(function () {
    var ed = window.$('#t').data('weaver');
    ed.exec('ai');
    var ai = ed.getPlugin('AiPlugin');
    ai.$promptInput.val('teste');
    ai.generateDescription();
  });
  await page.waitForTimeout(300);
  assert.strictEqual(await flag(page, '__pwned'), 0);
  assert.ok((await content(page)).indexOf('<p>Texto</p>') !== -1);
});

// =========================
// Regressões: conteúdo legítimo continua intacto
// =========================

test('Conteúdo legítimo atravessa o sanitizador sem perdas', async function () {
  var legit = '<h2>Título</h2><p style="text-align: center">Texto <b>negrito</b>, <i>itálico</i> e <a href="https://example.com" target="_blank" rel="noopener noreferrer">link</a>.</p>' +
    '<ul><li>um</li><li>dois</li></ul><table style="width: 100%; border-collapse: collapse"><tbody><tr><td style="padding: 8px; border: 1px solid #ccc" colspan="2">c</td></tr></tbody></table>' +
    '<p><img src="uploads/foto.jpg" alt="Foto" style="width: 50%; height: auto; float: left; margin: 0 15px 15px 0"></p>';
  var page = await setup(legit);
  var html = await content(page);
  ['<h2>Título</h2>', 'text-align: center', '<b>negrito</b>', 'href="https://example.com"', '<li>dois</li>', 'border-collapse: collapse', 'colspan="2"', 'src="uploads/foto.jpg"', 'float: left'].forEach(function (piece) {
    assert.ok(html.indexOf(piece) !== -1, 'faltou ' + piece + ' em ' + html);
  });
});

test('Tabela inserida pela grade mantém estilos', async function () {
  var page = await setup();
  await page.evaluate(caretAtEnd);
  await page.evaluate(function () {
    var ed = window.$('#t').data('weaver');
    ed.exec('table');
    ed.getPlugin('TablePlugin').insertTable(2, 3);
  });
  var html = await content(page);
  assert.strictEqual((html.match(/<td/g) || []).length, 6, html);
  assert.ok(/border-collapse: collapse/.test(html), html);
});

// =========================
// S9 - modo confiável e código protegido
// =========================

var TRUSTED = { forbiddenTags: [], allowedTags: '*', allowedAttributes: { '*': '*' }, allowedStyles: '*' };

test('S9: marcador <weaver-raw> forjado não burla o modo padrão', async function () {
  var page = await setup();
  await paste(page, '<weaver-raw data-raw="&lt;script&gt;window.__pwned=1&lt;/script&gt;&lt;img src=x onerror=window.__pwned=1&gt;">x</weaver-raw><p data-weaver-attr-onclick="window.__pwned=1">ok</p>');
  await page.waitForTimeout(200);
  assert.strictEqual(await flag(page, '__pwned'), 0);
  var html = await content(page);
  assert.ok(!/script|onerror|onclick|weaver/i.test(html), html);
});

test('S9: modo confiável preserva <script> sem executar', async function () {
  var page = await setup('<p>a</p><script>window.__pwned=1<\/script>', TRUSTED);
  await page.waitForTimeout(200);
  assert.strictEqual(await flag(page, '__pwned'), 0);
  assert.ok((await content(page)).indexOf('<script>window.__pwned=1</script>') !== -1);
});

test('S9: sanitize:false não executa handlers, srcdoc nem javascript: no editor', async function () {
  var page = await setup('<img src="x" onerror="window.__pwned=1"><iframe srcdoc="<script>parent.__pwned=1<\/script>"></iframe><iframe src="javascript:parent.__pwned=1"></iframe>', { sanitize: false });
  await page.waitForTimeout(400);
  assert.strictEqual(await flag(page, '__pwned'), 0);
  var html = await content(page);
  assert.ok(html.indexOf('onerror="window.__pwned=1"') !== -1, html);
  assert.ok(html.indexOf('srcdoc=') !== -1 && html.indexOf('src="javascript:') !== -1, html);
});

test('S9: sanitize:false não aplica <style> à página nem envia <input> no formulário', async function () {
  var page = await setup('<style>body{display:none}</style><input name="intruso" value="1"><p>a</p>', { sanitize: false });
  var result = await page.evaluate(function () {
    return {
      display: getComputedStyle(document.body).display,
      fields: window.$('form').serializeArray().map(function (f) { return f.name; })
    };
  });
  assert.strictEqual(result.display, 'block');
  assert.deepStrictEqual(result.fields, []);
  var html = await content(page);
  assert.ok(html.indexOf('<style>body{display:none}</style>') !== -1 && html.indexOf('name="intruso"') !== -1, html);
});

test('S9: sanitizer customizado substitui a allowlist', async function () {
  var page = await setup();
  await page.evaluate(function () {
    window.$('#t').weaver('destroy');
    window.$('#t').val('<p>a</p>').weaver({ sanitizer: function (html) { return html.replace(/a/g, 'b'); } });
  });
  assert.strictEqual(await content(page), '<p>b</p>');
});

test('S9: allowedStyles "*" ainda bloqueia expression() e escapes', async function () {
  var page = await setup('<p style="position: absolute; width: expression(alert(1)); color: \\72 ed; content: \'\\f101\'">a</p>', TRUSTED);
  var html = await content(page);
  assert.ok(/position: absolute/.test(html) && /content: '\\f101'/.test(html), html);
  assert.ok(!/expression|\\72/.test(html), html);
});

test('S9: allowCssUrls aceita http(s) e recusa javascript: e escapes', async function () {
  var page = await setup(
    '<p style="background: url(https://a.com/x.png)">1</p>' +
    '<p style="background: url(javascript:alert(1))">2</p>' +
    '<p style="background: url(\'java\\73 script:alert(1)\')">3</p>' +
    '<p style="background-image: url(data:image/svg+xml;base64,AAA)">4</p>',
    { allowCssUrls: true }
  );
  var html = await content(page);
  assert.ok(html.indexOf('url(https://a.com/x.png)') !== -1, html);
  assert.ok(!/javascript|java\\73|svg\+xml/.test(html), html);
});

test('S9: sem allowCssUrls, url() continua bloqueado mesmo com allowedStyles "*"', async function () {
  var page = await setup('<p style="background: url(https://evil.example/t.png); color: red">a</p>', { allowedStyles: '*' });
  var html = await content(page);
  assert.ok(!/url\(/.test(html) && /color: red/.test(html), html);
});

test('S9: iframe fora da allowlist continua removido no modo padrão', async function () {
  var page = await setup('<iframe src="https://evil.example/"></iframe><p>a</p>');
  assert.ok((await content(page)).indexOf('iframe') === -1);
});

test('S9: allowedIframeSources "*" aceita só http(s)', async function () {
  var page = await setup('<iframe src="https://www.google.com/maps/embed"></iframe><iframe src="data:text/html,x"></iframe>', { allowedIframeSources: '*' });
  var html = await content(page);
  assert.ok(html.indexOf('google.com/maps') !== -1, html);
  assert.ok(html.indexOf('data:text') === -1, html);
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
