---
name: print-fundamentos
description: Base de toda peça impressa no InDesign (flyer, cartaz, folder, brochura, catálogo, manual, papelaria) — documento com sangria e margens, grade, estilos de parágrafo, cores CMYK, imagens vinculadas a 300 ppi, preflight, PDF/X e pacote. Use antes de qualquer receita de impresso.
---

# print-fundamentos — impresso no InDesign

Pergunte a especificação da gráfica (sangria, perfil de cor, PDF pedido) antes de fechar.
Sem ela, use os padrões abaixo e diga que são padrões.

## 1. Divisão de trabalho

InDesign diagrama e exporta · Photoshop entrega fotos (300 ppi no tamanho final, PSD/TIFF)
· Illustrator entrega logo, ícones e vetores (.ai). Tudo **vinculado**, nunca colado.

## 2. Documento

`id_manage_document({ operation: "create", units: "mm", width, height, pages, facingPages,
margins, columns, gutter: 5, bleed: 3, intent: "print" })`

| Item | Padrão |
|---|---|
| Sangria | 3 mm (5 mm grande formato) |
| Margem de segurança | ≥ 5 mm do corte (≥ 10 mm na lombada) |
| Margens A4 | sup. 15–20 · inf. 20–25 · ext. 12–15 · int. 15–20 |
| Colunas | A4: 2–3 (ou grade de 6/12) · A5: 1–2 · calha 4–5 mm |
| Páginas | grampo: múltiplo de 4 |

## 3. Cores

- `id_swatches({ operation: "add", name, color })` com valores **CMYK** do kit (ou Pantone).
- Texto preto: **K100**. Preto chapado grande: composto (ex. C60 M40 Y40 K100).
- Carga total ≤ 300% (couché) / 240–260% (sem revestimento).
- Fios ≥ 0,25 pt; texto vazado ≥ 7–8 pt, sem serifa fina.

## 4. Texto por estilos

1. Crie os estilos antes de escrever:
   `id_manage_styles({ kind: "paragraph", operation: "create", name: "Corpo", properties: { fontFamily, fontStyle, size: 10, leading: 13 } })`
   — `size` e `leading` são **pontos** (mesmo com `units: "mm"`). Crie: Título 1–3, Corpo,
   Corpo-primeiro, Legenda, Rótulo, Preço, Nota.
2. `id_create_text_frame` com `format: { paragraphStyle }` ou `id_manage_styles({ operation: "apply" })`.
3. Corpo 9–11 pt, entrelinha 120–145%, 45–75 caracteres por linha; recuo **ou** espaço entre
   parágrafos, nunca os dois; sem viúvas/órfãs.
4. **Nenhum texto excedente:** confira o retorno (`overset`) de cada quadro; encadeie
   (`id_thread_text`, com `addPagesUntilFits` para texto longo) ou ajuste.
5. Script livre (`id_execute_extendscript`): tamanhos de tipo como string com unidade
   (`"10pt"`) — número puro é lido na unidade da chamada (mm).

## 5. Imagens

- `id_place_file({ filePath, page, rect, fit: "fill" })` — o retorno traz o **PPI efetivo**.
  Meta: ≥ 300 (mínimo 225). Abaixo disso: imagem maior ou quadro menor.
- Imagem que sangra vai até a linha da sangria (x/y −3 mm).
- `id_links({ operation: "list" })` para conferir vínculos; nada ausente ou modificado.

## 5b. Efeitos — foto que se dissolve no fundo

Receita aprovada (flyer A5, 13/11/2026): foto em cima, texto claro sobre fundo escuro embaixo, sem
emenda visível.

1. Fundo: retângulo em preto rico (ex. C60 M40 Y40 K100) cobrindo a página + sangria.
2. Foto: quadro com a imagem inteira, **avançando por baixo do bloco de texto** (aqui a foto vai até
   ~85% da altura da página e o texto começa em ~68%). Ajuste com
   `id_modify_objects({ names: ["Foto"], fit: "frameToContent" })` ou mova a imagem dentro do quadro.
3. Esmaecimento direcional só na borda de baixo, largura ≈ **35% da altura do quadro** (aqui
   69 mm de 191 mm), forma "Leading Edges", ruído 0, choke 0:
   `id_modify_objects({ names: ["Foto"], feather: { type: "directional", sides: { bottom: 69 } } })`.
4. Textos por cima, na parte já escurecida; confira o contraste na prévia (`id_get_page_preview`).

Alternativas: `feather: { type: "gradient", fadeTo: "bottom", start: 65 }` (esmaecimento pela
porcentagem do quadro) e `type: "basic", width` (bordas suaves). `type: "none"` remove todos.
Efeitos são achatados no PDF/X-4 sem problema; confira o PDF.

## 6. Conferir e exportar

1. `id_get_page_preview` de cada página; corrija; olhe de novo.
2. `jradb_checkpoint({ app: "indesign", label: "pre-pdf" })`.
3. `id_preflight({ minPpi: 225 })` — zero erros de vínculo, fonte, texto excedente, cor, resolução.
4. PDF de impressão: `id_export({ format: "pdf", pdfPreset: "[PDF/X-4:2008]", cropMarks: true })`
   (ou o preset pedido pela gráfica; `[High Quality Print]` como alternativa). A sangria do
   documento entra por padrão (os presets de fábrica não a incluem); `cropMarks` liga marcas de
   corte fora da sangria. Confira no retorno `pdf.bleed: true`.
5. PDF de aprovação: preset leve em RGB, para enviar ao cliente.
6. Salve o `.indd` (`id_manage_document({ operation: "save" })`) e entregue: `.indd` + vínculos
   + PDF de impressão + PDF de aprovação.

## 7. Portão de saída

```
[ ] Sangria 3 mm e margem de segurança em todas as páginas
[ ] Preflight sem erros; PPI efetivo ≥ 225 em todas as imagens
[ ] Tudo em estilos; nenhum texto excedente
[ ] Preços, códigos, telefones e endereços conferidos contra a fonte
[ ] Cores CMYK/Pantone do kit; texto em K100
[ ] Prévia de cada página conferida; PDF/X + PDF de aprovação + .indd salvos
```
