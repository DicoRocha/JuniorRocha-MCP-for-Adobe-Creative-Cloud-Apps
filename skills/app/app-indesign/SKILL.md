---
name: app-indesign
description: Contrato do InDesign no MCP — unidades por chamada (mm), tipo sempre em pt, coordenadas a partir do topo da página, estilos antes do texto, vínculos, efeitos (esmaecimento direcional, degradê, sombra), tabelas, preflight e PDF com sangria e marcas. Use ao diagramar impressos, pranchas e apresentações no InDesign por ferramentas id_*.
---

# app-indesign — contrato e decisões

Ofício: `print-fundamentos`, `print-flyer-cartaz`.

## 1. Contrato

| Item | Regra |
|---|---|
| Unidades | `units` em cada chamada (padrão mm); `rect` = {x, y, width, height} do topo esquerdo da página |
| Tipo | tamanho e entrelinha **em pt** nas ferramentas tipadas; no script livre escreva `"10pt"` |
| Desfazer | cada chamada é um passo |
| Alvo | `ids` de `id_find_objects`/criação, ou `names` |
| Salvar | `id_manage_document` save cria a pasta e confere o caminho |
| Cor | amostra, `"#RRGGBB"`, `[r,g,b]` ou `[c,m,y,k]` (impresso) |
| Organização | Camadas `Texto`/`Imagens`/`Fundo`; agrupe blocos que andam juntos (card, box com ícone). `id_organize_objects { page }` → `apply: true`. Skill `craft-organizacao-camadas` |
| PSD | Sempre **vinculado** (`id_place_file` vincula; nunca desvincular/incorporar). Depois de mexer no PSD: `id_links` update. |

## 2. Qual ferramenta

| Quero | Ferramenta |
|---|---|
| Documento | `id_manage_document` (create com bleed, margins, columns, intent) · `id_get_document_info` |
| Amostras | `id_swatches` |
| Estilos (antes do texto) | `id_manage_styles` (paragraph, character, object, table, cell; tabela: estilos de célula primeiro, depois o de tabela com `headerCellStyle`/`bodyCellStyle` e zebra `alternateRowFill`; `apply` na moldura da tabela) |
| Páginas e mestres | `id_manage_pages` |
| Seções e numeração (romanos, início em 2, marcador) | `id_manage_sections` |
| Texto | `id_create_text_frame` (format.paragraphStyle; devolve `overset`) · `id_edit_text` |
| Encadear molduras / texto longo | `id_thread_text` (ordem de leitura; `addPagesUntilFits` cria páginas até caber; `status` mostra a cadeia e o excesso) |
| Sumário | `id_create_toc` (estilos de título por nível; rode de novo com o mesmo `tocStyleName` para atualizar) |
| Formas | `id_create_shape` |
| Imagem/AI/PSD | `id_place_file` (fit; devolve `effectivePpi`) |
| Editar objetos | `id_modify_objects` (posição, tamanho, cor, opacidade, sombra, **feather**, fit, camada) |
| Tabela | `id_create_table` (data 2D, headerRows, headerFill) |
| Busca/troca GREP | `id_find_change` |
| Vínculos | `id_links` (list, update, relink) |
| Camadas | `id_manage_layers` |
| Ver | `id_get_page_preview` |
| Conferir | `id_preflight` (minPpi) |
| Flyer/cartaz inteiro (receita) | `id_recipe_flyer` (kit de marca → amostras, estilos, imagem, CTA, rodapé; auditoria e prévia) |
| Catálogo/tabela de preços da planilha (receita) | `id_recipe_catalog` (grade de cartões, preço formatado, páginas automáticas) |
| Manual, guia, apostila (receita) | `id_recipe_manual_skeleton` (capa, sumário automático, aberturas de capítulo, texto encadeado, mestres com número de página; ver `print-manual`) |
| Sair | `id_export` (pdf com preset + `cropMarks`; sangria do documento entra por padrão) |
| Pacote para a gráfica | `id_package` (fontes, vínculos, relatório; IDML/PDF opcionais; documento salvo) |

## 3. Efeitos (`feather` em `id_modify_objects`)

| Pedido | Parâmetro |
|---|---|
| Foto dissolvendo no fundo (receita aprovada) | `{ type: "directional", sides: { bottom: ~35% da altura do quadro } }` (+ `right` se não ocupar a largura) |
| Esmaecer por porcentagem | `{ type: "gradient", fadeTo: "bottom", start: 60 }` |
| Bordas suaves | `{ type: "basic", width: 4 }` |
| Remover | `{ type: "none" }` |

## 4. Script livre (`id_execute_extendscript`, ES3)

Ternário encadeado só com parênteses (`a ? x : (b ? y : z)`): sem eles o ExtendScript avalia errado.

| Tarefa | Trecho |
|---|---|
| Ajuste fino de tabela | `t.columns[c].width = "30mm"` · `tf.fit(FitOptions.FRAME_TO_CONTENT)` (estilo e fios: `id_manage_styles`) |
| Mover objeto | `o.move([x, y])` (em mm com `units: "mm"`) |
| Imagem dentro do quadro | `rect.place(file); rect.fit(FitOptions.FILL_PROPORTIONALLY)` |
| QR code | `rect.createHyperlinkQRCode("https://…", "Creme")` (cor = amostra) — também `createPlainTextQRCode`, `createVCardQRCode` |
| Ícone de uma prancheta do .ai | `app.pdfPlacePreferences.pageNumber = n; app.pdfPlacePreferences.pdfCrop = PDFCrop.CROP_ART; rect.place(aiFile)` |
| Elementos fixos em todas as páginas | `doc.masterSpreads[0].pages[0].rectangles.add(…)` (fundo, rodapé) |
| Quebra de linha no mesmo parágrafo | `\n` no `contents` (o `\r` abre parágrafo novo) |

## 5. Armadilhas

- Número puro em script com `units: "mm"` vira mm até em tamanho de fonte.
- Preset PDF/X de fábrica sem sangria: o `id_export` copia o preset e liga a sangria; confira `pdf.bleed` no retorno.
- Esmaecimento em degradê com `gradientStart/length` por script não renderizou como esperado: use o `feather` tipado.
- Arquivo `~*.idlk` na pasta = documento aberto (some ao fechar).
- Título com hifenização cortou "Align-ern": desligue `hyphenation` nos estilos de título.
- GREP com estilo de caractere: `id_find_change` mode grep `^0\d(?=\s)` + `applyCharacterStyle` numera passos.
- Exportar PNG de várias páginas gera `nome.png`, `nome2.png`…

- **Ordem de empilhamento (ao vivo 24/11/2026):** `page.pageItems` vem agrupado por tipo (retângulos, textos,
  grupos), não pela ordem da frente para trás. A ordem real está em `allPageItems` (que também traz itens de
  dentro de grupos e molduras): filtre pelos que têm o pai certo (para a página, o spread).

## 6. Portão

```
[ ] Estilos aplicados; nenhum overset
[ ] Vínculos ok; PPI efetivo ≥ 225
[ ] Prévia de cada página; preflight ok
[ ] PDF/X com sangria e marcas + PDF de aprovação
```

## Receitas de produtividade (pesquisa de tutoriais, 18/11/2026)

- **Estilos primeiro:** parágrafo, caractere e objeto; estilo de objeto com "aplicar próximo estilo" formata
  um bloco inteiro (título → apoio → corpo) de uma vez.
- **Estilos GREP** para padrões (preços, unidades, siglas); em documento longo pesam na recomposição —
  prefira aplicar por Localizar/Alterar (`id_find_change`) uma vez.
- **Estilos aninhados** para começo de parágrafo (rótulo em negrito até os dois-pontos).
- **Mesclagem de dados** com vários registros por página para catálogo, crachá, lista de preços.
- **Variáveis de texto** para cabeçalho corrente e data; **amostras globais** (Illustrator) para trocar
  uma cor no documento inteiro.
