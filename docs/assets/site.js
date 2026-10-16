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

  if (window.jQuery && jQuery.fn.weaver) {
    jQuery('#weaver-demo').weaver({
      height: 380,
      placeholder: 'Escreva algo...',
      onAiGenerate: function (prompt, done) {
        setTimeout(function () { done(aiDemoResponse(prompt)); }, 700);
      }
    });
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
