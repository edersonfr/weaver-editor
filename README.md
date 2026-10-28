# Weaver Editor

[![CI](https://github.com/edersonfr/weaver-editor/actions/workflows/ci.yml/badge.svg)](https://github.com/edersonfr/weaver-editor/actions/workflows/ci.yml)
[![Licença MIT](https://img.shields.io/badge/licen%C3%A7a-MIT-blue.svg)](LICENSE)

Editor HTML WYSIWYG leve para jQuery. Transforma qualquer `<textarea>` num editor completo, com um único arquivo JavaScript, sem build no seu projeto e sem depender de Tailwind.

**[Ver a demonstração ao vivo](https://edersonfr.github.io/weaver-editor/)**

## Sumário

- [Funcionalidades](#funcionalidades)
- [Instalação](#instalação)
- [Uso básico](#uso-básico)
- [Barra de ferramentas](#barra-de-ferramentas)
- [Opções](#opções)
- [API e eventos](#api-e-eventos)
- [Imagens](#imagens)
- [Assistente de IA](#assistente-de-ia)
- [Atalhos de teclado](#atalhos-de-teclado)
- [Acessibilidade](#acessibilidade)
- [Segurança](#segurança)
- [Desenvolvimento](#desenvolvimento)
- [Estrutura do projeto](#estrutura-do-projeto)
- [Licença](#licença)

## Funcionalidades

- **Substitui o `<textarea>`:** o conteúdo continua indo no envio do formulário, sem código extra.
- **Formatação completa:** títulos, citações, código, fontes, tamanhos, cores, listas, alinhamento e recuo.
- **Tabelas:** grade visual para escolher o tamanho, menu de linhas e colunas e `Tab` entre células.
- **Imagens:** envio pelo botão ou arrastando o arquivo, redimensionamento com a alça, alinhamento, texto alternativo e upload para o seu servidor.
- **Vídeos:** cole o link do YouTube ou do Vimeo e o player é incorporado.
- **Colar limpo:** conteúdo do Word e do Google Docs chega sem lixo, e listas viram listas de verdade.
- **Código-fonte:** edite o HTML com realce de sintaxe e formatação automática.
- **Pré-visualização:** veja o resultado em desktop, tablet e celular.
- **Assistente de IA (opcional):** gera texto em HTML com Gemini ou OpenAI.
- **Seguro por padrão:** todo HTML que entra passa por um sanitizador contra XSS.
- **Acessível:** tudo funciona pelo teclado e é anunciado por leitores de tela.
- **Desfazer e refazer:** histórico que guarda também a posição do cursor.

## Instalação

O editor é um único arquivo, que depende só do jQuery (testado com a versão 3.6). Ícones e estilos são carregados automaticamente.

**Baixando o arquivo:** copie [`dist/weaver-editor.min.js`](dist/weaver-editor.min.js) para o seu projeto.

```html
<script src="https://code.jquery.com/jquery-3.6.0.min.js"></script>
<script src="/js/weaver-editor.min.js"></script>
```

**Pelo CDN do jsDelivr**, direto deste repositório (troque `main` por um commit para fixar a versão):

```html
<script src="https://cdn.jsdelivr.net/gh/edersonfr/weaver-editor@main/dist/weaver-editor.min.js"></script>
```

Funciona nas versões atuais do Chrome, Edge, Firefox e Safari. O Internet Explorer não é suportado.

## Uso básico

```html
<form action="/salvar" method="POST">
  <label for="artigo">Artigo</label>
  <textarea id="artigo" name="conteudo_html"></textarea>
  <button type="submit">Salvar</button>
</form>

<script>
  $(function () {
    $('#artigo').weaver({
      height: 400,
      placeholder: 'Comece a escrever...'
    });
  });
</script>
```

O HTML do editor é copiado para o `textarea` a cada alteração e no envio do formulário. O conteúdo que já estiver no `textarea` é carregado ao iniciar.

## Barra de ferramentas

A barra é uma lista de grupos, cada um com seus botões. Os grupos aparecem separados por uma divisória:

```javascript
$('#artigo').weaver({
  toolbar: [
    ['history', ['undo', 'redo']],
    ['style', ['style', 'fontName', 'fontSize']],
    ['font', ['bold', 'italic', 'underline', 'strikethrough', 'clear']],
    ['color', ['color']],
    ['para', ['ul', 'ol', 'paragraph']],
    ['insert', ['link', 'table', 'picture', 'video', 'hr', 'ai']],
    ['view', ['preview', 'fullscreen', 'showBlocks', 'codeview']]
  ]
});
```

A lista que você passar substitui a padrão por inteiro. Um grupo sem lista, como `['color']`, usa o nome do grupo como botão.

**Botões disponíveis:**

| Botão | Função |
| --- | --- |
| `undo`, `redo` | Desfazer e refazer |
| `formatBlock` | Parágrafo, títulos H1 a H6, citação e bloco de código |
| `fontName`, `fontSize` | Fonte e tamanho do texto |
| `bold`, `italic`, `underline`, `strikethrough` | Negrito, itálico, sublinhado e tachado |
| `subscript`, `superscript` | Subscrito e sobrescrito |
| `removeFormat` | Remove a formatação do trecho selecionado |
| `foreColor`, `backColor` | Cor do texto e cor de destaque |
| `ul`, `ol` | Lista com marcadores e lista numerada |
| `paragraphGroup` | Alinhamentos e recuo, num menu |
| `link`, `table`, `image`, `video`, `hr` | Inserir link, tabela, imagem, vídeo e linha horizontal |
| `ai` | Assistente de IA |
| `preview`, `fullscreen`, `showBlocks`, `codeview` | Pré-visualizar, tela cheia, mostrar blocos e código-fonte |

**Apelidos** (compatíveis com o Summernote): `style` = `formatBlock`, `clear` = `removeFormat`, `picture` = `image`, `paragraph` = `paragraphGroup`, `color` = `foreColor` + `backColor`.

Os recursos de link, tabela, imagem, vídeo, código-fonte, pré-visualização, tela cheia e IA só são ativados quando o botão correspondente está na barra.

## Opções

| Opção | Padrão | Descrição |
| --- | --- | --- |
| `toolbar` | barra completa | Grupos e botões da barra (veja acima) |
| `height` | `300` | Altura mínima da área de edição, em pixels |
| `placeholder` | o do `textarea` | Texto exibido com o editor vazio |
| `fontNames` | lista padrão | Fontes do menu de fontes |
| `googleFonts` | `true` | Carrega do Google as fontes do menu e as usadas no conteúdo, sob demanda (editor e pré-visualização) |
| `fontSearch` | `'auto'` | Campo de busca no menu de fontes: `true`, `false` ou `'auto'` (com mais de 20 fontes) |
| `onFontApply` | — | `function (fontName, editor)` chamada ao aplicar uma fonte, para carregá-la também na loja |
| `previewCss` | — | Folhas de estilo do seu site, aplicadas na pré-visualização |
| `uploadImage` | — | Função de upload de imagens (veja [Imagens](#imagens)) |
| `maxImageSize` | `5242880` | Tamanho máximo da imagem, em bytes (5 MB) |
| `imageMaxWidth` | `1600` | Largura máxima ao embutir a imagem em base64 |
| `aiEndpoint` | `'ai-api.php'` | URL do backend do assistente de IA |
| `onAiGenerate` | — | Função própria para gerar o conteúdo da IA |
| `iconsUrl` | Lucide 0.525.0 (unpkg) | Arquivo de ícones; `false` usa o Lucide já carregado na página |
| `iconsIntegrity` | — | Hash SRI do arquivo de ícones |
| `allowedTags` | lista segura | Tags aceitas no conteúdo; `'*'` aceita qualquer tag HTML |
| `allowedAttributes` | lista segura | Atributos aceitos, por tag (`'*'` vale para todas). Aceita RegExp (`/^data-[\w-]+$/`) e `'*'` como lista |
| `allowedStyles` | lista segura | Propriedades CSS aceitas no atributo `style`; `'*'` aceita todas |
| `allowedIframeSources` | YouTube e Vimeo | Lista de RegExp com os endereços de iframe aceitos; `'*'` aceita qualquer http(s) |
| `forbiddenTags` | `script`, `style`, `svg`... | Tags removidas com todo o conteúdo, mesmo se liberadas em `allowedTags` |
| `allowCssUrls` | `false` | Aceita `url()` no CSS inline, com endereço http(s), relativo ou imagem `data:` |
| `keepComments` | `false` | Mantém os comentários HTML |
| `iframeAttributes` | `true` | Acrescenta `sandbox`, `referrerpolicy` e `loading` aos iframes |
| `sanitize` | `true` | `false` desliga a sanitização (veja [Modo confiável](#modo-confiável)) |
| `sanitizer` | — | Função `(html) => html` que substitui a sanitização |
| `normalize` | `true` | Limpa tags repetidas e vazias ao sair do editor; `false` desliga |
| `buttons` | — | Botões próprios da barra (veja [Botões próprios](#botões-próprios)) |
| `imageToolbar` | — | Botões extras (ou removidos) na barra da imagem selecionada (veja [Imagens](#imagens)) |
| `uploadPastedImages` | `false` | Envia pelo `uploadImage` as imagens em base64 de HTML colado ou solto |
| `imageDefaults` | — | Atributos aplicados a toda imagem inserida, como `{ style: 'width:100%;height:auto' }` |
| `extraPlugins` | — | Plugins somados aos automáticos, sem desligar link, tabela, imagem etc. |
| `plugins` | automático | Lista de plugins, para montar o editor à mão (substitui os automáticos) |

## API e eventos

A instância fica guardada no elemento:

```javascript
var editor = $('#artigo').data('weaver');

editor.getContent();                    // HTML atual (já sanitizado)
editor.setContent('<p>Novo texto</p>'); // substitui o conteúdo (sanitiza antes)
editor.isPristine();                    // true se nada foi editado desde o carregamento
editor.saveSelection();                 // guarda o cursor antes de abrir um modal
editor.insertHTML('<p>Oi</p>');         // insere (sanitizado) no cursor salvo, com desfazer
editor.insertImage(url, { alt: 'Foto' }); // valida a URL e insere a imagem no cursor salvo
editor.restoreSelection();              // foca o editor e volta o cursor salvo
editor.focus();                         // foca a área de edição
editor.loadFont('Lobster');             // carrega uma fonte do Google Fonts no editor
editor.getSelectedImage();              // <img> selecionada no editor, ou null
editor.replaceImage(img, url, attrs);   // troca o src mantendo estilo e alinhamento
editor.exec('bold');                    // executa um comando da barra
editor.sanitize(html);                  // sanitiza um HTML com as regras do editor
editor.notify('Salvo!');                // mostra um aviso dentro do editor

$('#artigo').weaver('destroy');         // remove o editor e devolve o textarea
```

A cada alteração, o elemento original dispara `change` com o HTML:

```javascript
$('#artigo').on('change', function (event, html) {
  console.log('Novo conteúdo:', html);
});
```

Use `destroy` ao trocar de tela numa SPA: ele remove todos os eventos e devolve o `textarea` com o conteúdo atual.

**Fontes.** O menu aceita o catálogo inteiro do Google Fonts (`fontNames` com ~1.500 nomes): os itens só são montados ao abrir o menu, cada fonte só é baixada quando aparece na lista, e a busca filtra pelo nome. Ao escolher uma fonte, ou ao carregar um conteúdo que já usa uma, o editor pede ao Google só aquela família. Fontes do sistema (Arial, Georgia...) não são pedidas. O conteúdo salvo guarda apenas o `font-family`; para a fonte aparecer na loja, carregue-a lá, por exemplo em `onFontApply`.

**HTML original preservado.** Enquanto nada for editado, `getContent()` (e o envio do formulário) devolve exatamente o HTML carregado, sem mudar aspas, entidades, ordem de atributos ou a formatação do CSS. Isso vale quando a sanitização não removeu nada do conteúdo; se removeu, o editor devolve a versão sanitizada.

## Botões próprios

Defina botões na opção `buttons` e use o nome deles na `toolbar`. O `action` recebe a instância do editor e o botão. Antes de chamá-lo, o editor guarda o cursor, então `insertHTML` e `insertImage` inserem no lugar certo mesmo depois de um modal tirar o foco:

```javascript
$('#descricao').weaver({
  buttons: {
    imageManager: {
      icon: 'images',                 // ícone do Lucide; ou `html` com qualquer HTML; ou `text`
      title: 'Gerenciar imagens',
      action: function (editor, $button) {
        abrirGerenciador(function (urls) {
          urls.forEach(function (url) { editor.insertImage(url, { alt: '' }); });
        });
      },
      isActive: function (editor) { return false; } // opcional: botão pressionado
    },
    modelo: {
      type: 'dropdown',
      text: 'Modelos',
      options: ['Garantia', { label: 'Frete grátis', value: 'frete' }],
      action: function (editor, value) { editor.insertHTML(modelos[value]); }
    }
  },
  toolbar: [['insert', ['link', 'imageManager', 'modelo', 'video']]]
});
```

Para registrar um botão para todos os editores da página, use `WysiwygEditor.registerButton(nome, definicao)`. Um nome na `toolbar` que não existe gera um aviso no console.

## Imagens

Sem configuração, a imagem é embutida no HTML em base64, reduzida para no máximo `imageMaxWidth` pixels de largura. Para guardar as imagens no seu servidor, use `uploadImage` e chame `done(url)` no sucesso ou `done(null, 'mensagem')` no erro. A mensagem aparece dentro do editor.

```javascript
$('#artigo').weaver({
  maxImageSize: 5 * 1024 * 1024,
  uploadImage: function (file, done) {
    var data = new FormData();
    data.append('imagem', file);

    fetch('/upload.php', { method: 'POST', body: data })
      .then(function (r) { return r.json(); })
      .then(function (json) { json.url ? done(json.url) : done(null, json.error || 'Falha no envio.'); })
      .catch(function () { done(null, 'Não foi possível enviar a imagem.'); });
  }
});
```

Formatos aceitos: PNG, JPG, GIF, WebP e AVIF. No servidor, confira o tipo e o tamanho de novo antes de salvar.

O `done` aceita atributos para a imagem: `done(url, { alt: 'Foto', width: 600 })`.

**Colar e arrastar:** um print colado com `Ctrl+V` ou uma imagem arrastada passa pelo mesmo caminho (com `uploadImage`, sobe para o servidor). Ao colar do Word ou do Excel, que mandam um PNG junto com o HTML, vale o HTML. Com `uploadPastedImages: true`, as imagens em base64 dentro de um HTML colado ou solto também sobem pelo `uploadImage`, e o `src` delas é trocado pela URL devolvida.

Com `uploadImage` ou `imageToolbar` configurados, os recursos de imagem (colar, redimensionar, alinhar) ficam ativos mesmo sem o botão `image` na barra.

**Barra da imagem:** clique numa imagem para redimensionar, alinhar, editar o texto alternativo ou remover. Para acrescentar botões ou tirar os padrões (`w100`, `w50`, `w25`, `original`, `floatLeft`, `center`, `floatRight`, `noFloat`, `alt`, `remove`):

```javascript
$('#descricao').weaver({
  imageToolbar: {
    add: [{
      icon: 'replace',
      title: 'Trocar imagem',
      action: function (editor, img) {
        abrirGerenciador(function (url) { editor.replaceImage(img, url); });
      }
    }],
    remove: ['w25']
  }
});
```

## Assistente de IA

Adicione o botão `ai` à barra. Ele envia a instrução para o `ai-api.php` (ou o endereço em `aiEndpoint`), que responde em HTML usando Google Gemini ou OpenAI. Sem chave configurada, o backend responde em modo demonstração.

Configure o backend por variáveis de ambiente:

| Variável | Descrição |
| --- | --- |
| `GEMINI_API_KEY` / `OPENAI_API_KEY` | Chave de ao menos um provedor |
| `GEMINI_MODEL` / `OPENAI_MODEL` | Modelo usado (padrões no topo do arquivo) |
| `WEAVER_AI_SESSION_KEY` | Chave em `$_SESSION` que indica o usuário logado (padrão: `user_id`) |
| `WEAVER_AI_ALLOWED_ORIGINS` | Origens aceitas, separadas por vírgula (padrão: o próprio domínio) |
| `WEAVER_AI_RATE_LIMIT` / `WEAVER_AI_RATE_WINDOW` | Limite de chamadas por usuário (padrão: 20 por hora) |
| `WEAVER_AI_MAX_PROMPT` | Tamanho máximo da instrução (padrão: 2000 caracteres) |

Com uma chave real configurada, o endpoint exige usuário logado, para ninguém gastar a sua cota de fora do painel.

Para usar o seu próprio backend, passe `onAiGenerate`:

```javascript
$('#artigo').weaver({
  onAiGenerate: function (prompt, done) {
    minhaApi.gerar(prompt)
      .then(function (html) { done(html); })
      .catch(function (erro) { done(null, erro.message); });
  }
});
```

A resposta da IA sempre passa pelo sanitizador antes de entrar no texto.

## Atalhos de teclado

| Atalho | Ação |
| --- | --- |
| `Ctrl+B` / `Ctrl+I` / `Ctrl+U` | Negrito / itálico / sublinhado |
| `Ctrl+K` | Inserir ou editar link |
| `Ctrl+Shift+V` | Colar sem formatação |
| `Ctrl+Z` / `Ctrl+Y` (ou `Ctrl+Shift+Z`) | Desfazer / refazer |
| `Tab` / `Shift+Tab` em lista | Aumentar / diminuir o nível do item |
| `Tab` / `Shift+Tab` em tabela | Próxima / célula anterior (no fim, cria uma linha) |
| `Alt+F10` | Ir para a barra de ferramentas |

No Mac, use `Cmd` no lugar de `Ctrl`.

## Acessibilidade

- **Teclado:** na barra, as setas andam entre os botões e `Esc` volta ao texto. Menus, grade de tabela, menu da tabela (tecla de menu ou `Shift+F10`) e popovers também funcionam só pelo teclado.
- **Diálogos:** os popovers de link, vídeo e IA prendem o foco, fecham com `Esc` e devolvem o foco ao botão.
- **Leitores de tela:** botões ativos informam `aria-pressed`, e erros são anunciados sem `alert()`.
- **Nome do editor:** um `<label for="id-do-textarea">` na página vira o nome da área de edição.

## Segurança

O editor sanitiza todo HTML que entra: conteúdo inicial, colar, arrastar, código-fonte, IA e desfazer/refazer. Scripts, eventos (`onclick`, `onerror`...), links `javascript:` e iframes de domínios desconhecidos são removidos.

> **Sanitize também no servidor.** O editor protege quem está editando, mas o envio do formulário pode ser forjado. Antes de salvar ou exibir o HTML, passe-o por uma biblioteca de servidor, como o [HTML Purifier](http://htmlpurifier.org/) (PHP) ou o [DOMPurify](https://github.com/cure53/DOMPurify) (Node).

- **Tags bloqueadas:** `script`, `style`, `svg`, `math`, `object`, `embed`, `form` e similares saem mesmo se estiverem em `allowedTags`. A lista pode ser trocada em `forbiddenTags` (veja [Modo confiável](#modo-confiável)).
- **iframes:** só players do YouTube (`youtube-nocookie.com`) e do Vimeo, sempre com `sandbox`. Para liberar outros, use `allowedIframeSources`.
- **CSS inline:** só propriedades de formatação. `position` e `url()` são removidos.
- **Pré-visualização:** roda num iframe com `sandbox` e sem scripts.
- **Ícones:** vêm de uma versão fixa do Lucide. Para o navegador recusar um arquivo adulterado no CDN, informe o hash em `iconsIntegrity`:

  ```bash
  curl -s https://unpkg.com/lucide@0.525.0/dist/umd/lucide.min.js | openssl dgst -sha384 -binary | openssl base64 -A
  ```

  Para não depender de CDN, sirva o arquivo do seu domínio com `iconsUrl: '/js/lucide.min.js'`. Se os ícones não carregarem, os botões mostram o nome.
- **Google Fonts e LGPD:** as fontes do menu vêm do Google, que recebe o IP do visitante. Use `googleFonts: false` para desligar.

### Modo confiável

Quando quem edita é o dono do conteúdo (por exemplo, o lojista editando a própria loja), a sanitização pode ser afrouxada para não alterar o HTML existente:

```javascript
$('#descricao').weaver({
  forbiddenTags: [],                 // ou ['script'] para manter só scripts de fora
  allowedTags: '*',
  allowedAttributes: { '*': '*' },   // ou ['class', 'style', /^data-[\w-]+$/, /^aria-[\w-]+$/]
  allowedStyles: '*',
  allowCssUrls: true,
  keepComments: true,
  iframeAttributes: false,
  allowedIframeSources: '*'
});
```

Para desligar tudo, use `sanitize: false`, ou passe a sua própria função em `sanitizer`.

Mesmo nesses modos, nada executa dentro do editor:

- `<script>`, `<style>`, `<link>`, `<meta>`, `<form>`, `<input>` e afins aparecem como um marcador cinza não editável. O CSS não vaza para a página, e os campos não vão junto no envio do formulário. No `getContent()` e no código-fonte, eles voltam como eram.
- Atributos que executam código (`onclick`, `onerror`, `srcdoc`, `href="javascript:..."`) ficam desativados no editor e voltam na saída.
- `expression()`, `behavior` e escapes CSS fora de aspas continuam bloqueados com `allowedStyles: '*'`, e `url()` só passa com `allowCssUrls`.

> **Com o modo confiável, a validação do HTML passa a ser responsabilidade do servidor.** O editor deixa de remover o que o servidor precisa barrar antes de exibir o conteúdo.

## Desenvolvimento

O código-fonte fica em `src/` (ES5, sem transpilação). O Gulp junta e minifica os arquivos em `dist/`.

```bash
npm install          # dependências do build
npx gulp             # gera dist/weaver-editor.js e dist/weaver-editor.min.js
```

Os testes abrem o editor num Chromium real. `tests/security.test.js` reproduz ataques de XSS conhecidos, `tests/functional.test.js` cobre formatação, listas, tabelas, imagens, colar, histórico, teclado e acessibilidade, e `tests/site.test.js` verifica a página de demonstração.

```bash
npm install --no-save playwright jquery@3.6.0
npx playwright install chromium
npm test
```

**No GitHub:**

- O workflow **CI** roda o build e os testes, nas versões normal e minificada, em todo PR e em cada push na `main`.
- Ao entrar código na `main`, o workflow **Build** regenera o `dist/` com o Gulp e faz o commit. Não é preciso commitar o `dist/` nos PRs.

## Estrutura do projeto

```text
weaver-editor/
├── src/
│   ├── core/            # Sanitizador, seleção, histórico, estilos base
│   ├── plugins/         # Barra, formatação, link, tabela, imagem, vídeo, IA...
│   └── editor.js        # Núcleo: opções, ciclo de vida, API
├── dist/                # Arquivos prontos para uso (gerados pelo Gulp)
├── docs/                # Página de demonstração (GitHub Pages)
├── examples/            # Exemplo de uso em HTML
├── tests/               # Testes com Playwright
├── ai-api.php           # Backend de exemplo do assistente de IA
├── .github/workflows/   # CI e build automático
└── gulpfile.js          # Build
```

## Licença

[MIT](LICENSE) © 2026 Ederson F. Ribeiro
