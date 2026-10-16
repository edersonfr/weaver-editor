/**
 * Teste da página de demonstração (docs/index.html, publicada no GitHub Pages).
 *
 * Abre a página num Chromium real, sem rede: o README é servido do arquivo
 * local, no lugar do raw.githubusercontent.com. Verifica que não há erros de
 * JavaScript, que a demonstração inicia, que a IA simulada responde, que a
 * documentação é montada a partir do README sem âncoras quebradas e que não
 * há rolagem horizontal no celular.
 */
var assert = require('assert');
var fs = require('fs');
var path = require('path');

var playwright;
try {
  playwright = require('playwright');
} catch (e) {
  console.error('Playwright não encontrado. Rode: npm install --no-save playwright && npx playwright install chromium');
  process.exit(1);
}

var ROOT = path.join(__dirname, '..');
var PAGE = 'file://' + path.join(ROOT, 'docs', 'index.html');
var README = fs.readFileSync(path.join(ROOT, 'README.md'), 'utf8');

(async function run() {
  var browser = await playwright.chromium.launch();
  var failed = 0;

  async function open(viewport) {
    var page = await browser.newPage({ viewport: viewport });
    page.errors = [];
    page.on('pageerror', function (err) { page.errors.push(err.message); });
    await page.route('**/*', function (route) {
      var url = route.request().url();
      if (url.indexOf('file://') === 0) return route.continue();
      if (url.indexOf('raw.githubusercontent.com') !== -1) {
        return route.fulfill({ status: 200, contentType: 'text/plain; charset=utf-8', headers: { 'access-control-allow-origin': '*' }, body: README });
      }
      return route.abort(); // CDNs externos (ícones, fontes) ficam de fora
    });
    await page.goto(PAGE);
    await page.waitForFunction(function () { return document.querySelectorAll('#docs-toc a').length > 0; }, null, { timeout: 10000 });
    return page;
  }

  async function check(name, fn) {
    try {
      await fn();
      console.log('  ok   ' + name);
    } catch (err) {
      failed++;
      console.log('  FALHOU ' + name + '\n         ' + String(err && err.message || err));
    }
  }

  var desktop = await open({ width: 1366, height: 900 });

  await check('Página carrega sem erros de JavaScript e com a demonstração ativa', async function () {
    assert.deepStrictEqual(desktop.errors, []);
    assert.strictEqual(await desktop.locator('#demonstracao .wysiwyg-editor .editor-content').count(), 1);
  });

  await check('Documentação montada a partir do README, sem âncoras quebradas', async function () {
    var info = await desktop.evaluate(function () {
      return {
        sections: document.querySelectorAll('#docs-body h2').length,
        toc: document.querySelectorAll('#docs-toc a').length,
        broken: Array.prototype.map.call(document.querySelectorAll('#docs-body a[href^="#"], #docs-toc a'), function (a) { return a.getAttribute('href'); })
          .filter(function (h) { return !document.getElementById(decodeURIComponent(h.slice(1))); })
      };
    });
    assert.ok(info.sections >= 8, 'poucas seções: ' + info.sections);
    assert.strictEqual(info.toc, info.sections);
    assert.deepStrictEqual(info.broken, []);
  });

  await check('Assistente de IA da demonstração responde (simulado)', async function () {
    await desktop.click('#demonstracao .editor-content p');
    await desktop.click('#demonstracao [data-name="ai"]');
    await desktop.fill('.editor-ai-popover textarea', 'Descrição de uma caneca');
    await desktop.keyboard.press('Control+Enter');
    await desktop.waitForFunction(function () { return document.querySelector('#demonstracao .editor-content').innerHTML.indexOf('Texto gerado para') !== -1; }, null, { timeout: 5000 });
  });

  await check('Metadados de compartilhamento e favicon presentes', async function () {
    var meta = await desktop.evaluate(function () {
      var get = function (sel) { var el = document.querySelector(sel); return el ? (el.content || el.href) : null; };
      return { desc: get('meta[name="description"]'), ogImage: get('meta[property="og:image"]'), icon: get('link[rel="icon"]') };
    });
    assert.ok(meta.desc && meta.ogImage && meta.icon, JSON.stringify(meta));
    assert.ok(fs.existsSync(path.join(ROOT, 'docs', 'assets', 'og-image.png')));
    assert.ok(fs.existsSync(path.join(ROOT, 'docs', 'favicon.svg')));
  });

  var mobile = await open({ width: 390, height: 844 });

  await check('Sem rolagem horizontal no celular e menu acessível', async function () {
    assert.strictEqual(await mobile.evaluate(function () { return document.documentElement.scrollWidth <= window.innerWidth; }), true);
    await mobile.click('.menu-toggle');
    assert.strictEqual(await mobile.getAttribute('.menu-toggle', 'aria-expanded'), 'true');
    assert.strictEqual(await mobile.isVisible('#site-nav a[href="#documentacao"]'), true);
  });

  await browser.close();
  console.log('\n' + (5 - failed) + '/5 testes passaram');
  process.exit(failed ? 1 : 0);
})();
