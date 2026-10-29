# Changelog

As versões seguem o [versionamento semântico](https://semver.org/lang/pt-BR/). Cada versão tem um tag no GitHub (`v1.1.0`) e pode ser carregada pelo jsDelivr com a versão fixada (veja [Instalação](README.md#instalação)).

## [1.1.1] - 2026-10-29

### Correções

- **Pré-visualização em branco ao reabrir:** no Chrome, a segunda abertura do preview ficava em branco, embora o conteúdo estivesse no iframe. Agora cada abertura usa um iframe novo.

## [1.1.0] - 2026-10-28

Ajustes para o Weaver substituir o SunEditor em painéis administrativos. As novas opções são desligadas por padrão: o editor continua seguro e com a mesma aparência de antes, exceto pela área de edição sem a classe `prose` (veja "Mudanças").

### Novidades

- **Modo confiável no sanitizador:** `allowedTags: '*'`, `allowedStyles: '*'`, RegExp em `allowedAttributes` (ex.: `/^data-[\w-]+$/`), `forbiddenTags`, `allowCssUrls`, `keepComments`, `iframeAttributes: false`, `allowedIframeSources: '*'`, `sanitize: false` e `sanitizer: function (html) {}`. Os `<script>` e `<style>` preservados não executam no editor e aparecem como um marcador.
- **HTML original preservado:** enquanto nada for editado, `getContent()` e o envio do formulário devolvem o HTML carregado byte a byte. Novo método `isPristine()`.
- **Botões próprios na toolbar:** opção `buttons` (inclusive dropdown) e `WysiwygEditor.registerButton()`. Aviso no console quando a toolbar cita um botão que não existe.
- **Plugins extras:** opção `extraPlugins`, somada aos plugins automáticos.
- **API de inserção:** `saveSelection()`, `restoreSelection()`, `insertHTML()`, `insertImage()` e `focus()`. A inserção volta para o cursor de antes do modal e é desfeita num passo só.
- **Colar imagens:** um print colado sobe pelo `uploadImage`. Com `uploadPastedImages: true`, as imagens base64 de HTML colado ou solto também sobem.
- **Barra da imagem extensível:** opção `imageToolbar` (botões extras ou removidos), `getSelectedImage()` e `replaceImage()`. Opção `imageDefaults` para os atributos de toda imagem inserida.
- **Fontes sob demanda:** cada família do Google Fonts é carregada só quando aparece no menu, é aplicada ou já está no conteúdo. O menu aguenta o catálogo inteiro (~1.500 fontes), com busca (`fontSearch`), `onFontApply` e `loadFont()`.
- **Tema escuro:** cores em variáveis CSS `--weaver-*`. O editor fica escuro com `.dark` na página ou com a opção `theme` (`'light'`, `'dark'`, `'auto'`), e o método `setTheme()` troca o tema depois.
- `WysiwygEditor.VERSION`.

### Mudanças

- A área de edição não usa mais a classe `prose` do Tailwind. O editor restaura sozinho os marcadores de lista e os tamanhos de título que o preflight do Tailwind zera.
- O CSS do editor tem prioridade sobre as utilitárias do Tailwind da página: uma paleta `gray` diferente não muda mais a aparência.
- O normalizador não altera o conteúdo quando o usuário só foca e sai do editor, mantém elementos vazios que tenham atributos e preserva `rel="nofollow"` em links.

## [1.0.0]

Primeira versão pública, sem tag: editor com toolbar, tabelas, imagens, vídeos, code view, pré-visualização, assistente de IA, colar limpo do Word e do Google Docs, acessibilidade por teclado e sanitizador contra XSS.

[1.1.1]: https://github.com/edersonfr/weaver-editor/releases/tag/v1.1.1
[1.1.0]: https://github.com/edersonfr/weaver-editor/releases/tag/v1.1.0
[1.0.0]: https://github.com/edersonfr/weaver-editor/tree/f631df56c44ad9727548e9c2629d93557162870e
