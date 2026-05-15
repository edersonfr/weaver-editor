# Weaver Editor

O **Weaver Editor** é um editor HTML WYSIWYG leve, moderno e altamente customizável, desenvolvido com JavaScript (ES5) e jQuery. Inspirado nos maiores editores do mercado, este projeto foi construído sob medida para ser fácil de integrar, leve no carregamento e extremamente poderoso.

## ✨ Funcionalidades

- **Substituição Transparente:** Transforma qualquer `<textarea>` automaticamente, mantendo a sincronização de dados invisível para submissões de formulários perfeitas.
- **Barra de Ferramentas Inteligente (Smart Toolbar):** Carregamento de módulos sob demanda. Se você não configurar o botão de Vídeo, o script de vídeo sequer consumirá memória!
- **Visualização de Código (Code View):** Editor de código-fonte integrado com _Syntax Highlighting_ e um formatador inteligente (Pretty Print) de HTML.
- **Modo Preview Responsivo:** Visualize como seu texto ficará em dispositivos Desktop, Tablet e Mobile diretamente de dentro do editor.
- **Imagens Avançadas:** Suporte a arrastar e soltar (Drag & Drop), redimensionamento visual e alinhamento flutuante.
- **Tabelas Interativas:** Construtor visual de tabelas (grid estilo Microsoft Word).
- **Embeds Mágicos:** Cole a URL de um vídeo do YouTube ou Vimeo e ele será convertido automaticamente em um _iframe_ responsivo.
- **Segurança Embutida:** Sanitizador nativo (`SanitizerPlugin`) que varre códigos colados protegendo contra ataques XSS e limpando sujeiras do Word/Excel.
- **Histórico:** Suporte completo a Desfazer (Undo) e Refazer (Redo) com atalhos de teclado.

## 🚀 Instalação

O editor foi empacotado para ser distribuído em um único arquivo minificado. Basta incluir o jQuery, (opcionalmente uma biblioteca de ícones como Lucide) e o arquivo do editor.

```html
<!-- jQuery -->
<script src="https://code.jquery.com/jquery-3.6.0.min.js"></script>

<!-- Editor WYSIWYG -->
<script src="dist/weaver-editor.min.js"></script>
```

*Nota:* A estilização do editor insere automaticamente as regras via JavaScript e os ícones via Lucide.

## 💻 Como Usar

Crie um formulário com um `textarea` padrão:

```html
<form action="/salvar" method="POST">
  <textarea id="meu-editor" name="conteudo_html"></textarea>
  <button type="submit">Enviar</button>
</form>
```

Inicialize o editor via jQuery:

```javascript
$(document).ready(function() {
  $('#meu-editor').weaver({
    height: 500,
    placeholder: 'Comece a escrever sua história aqui...',
    toolbar: [
      ['history', ['undo', 'redo']],
      ['style', ['style', 'fontName', 'fontSize']],
      ['font', ['bold', 'italic', 'underline', 'strikethrough', 'clear']],
      ['color', ['color']],
      ['para', ['ul', 'ol', 'paragraph']],
      ['insert', ['link', 'table', 'picture', 'video', 'hr']],
      ['view', ['preview', 'fullscreen', 'showBlocks', 'codeview']]
    ]
  });
});
```

## ⚙️ Configuração da Barra de Ferramentas (Aliases)

O sistema de toolbar aceita a mesma sintaxe amigável do Summernote, permitindo agrupar botões em "blocos" divididos visualmente.

**Principais Apelidos (Aliases) Suportados:**
- `'style'`: Carrega os formatos de bloco (Parágrafo, H1-H6, Blockquote, Bloco de Código).
- `'clear'`: Limpa a formatação atual.
- `'picture'`: Injeta a funcionalidade de Imagens.
- `'color'`: Abre os seletores de Cor da Fonte e Cor de Fundo.
- `'paragraph'`: Agrupa os alinhamentos (Esquerda, Centro, Direita, Justificado) e Indentação.

## 🛠️ Desenvolvimento e Build

O projeto utiliza o **Gulp** para automatizar a concatenação e minificação dos arquivos em `src/` para a versão final de produção em `dist/`.

### 1. Instalar dependências
Certifique-se de ter o Node.js instalado.
```bash
npm install
```

### 2. Compilar o Editor
Sempre que fizer alterações nos arquivos de código dentro da pasta `src/`, rode o comando abaixo para gerar o arquivo `dist/wysiwyg-editor.min.js`:
```bash
npx gulp
```

## 📂 Estrutura de Diretórios

```text
/wysiwyg-editor
├── dist/                   # Versões finais de produção (.min.js)
├── examples/               # Exemplos práticos de uso em HTML
├── src/                    # Arquivos fontes em desenvolvimento
│   ├── core/               # Núcleo: plugins, comandos, seleção e histórico
│   ├── plugins/            # Ferramentas modulares (Tabelas, Imagens, Vídeos, etc)
│   └── editor.js           # Orquestrador principal do editor
├── gulpfile.js             # Pipeline de automação do build
├── package.json            # Dependências do Node.js
└── README.md               # Esta documentação
```

## 📄 Licença

Este projeto está licenciado sob a ISC License.