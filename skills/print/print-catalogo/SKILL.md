---
name: print-catalogo
description: Diagramar catálogo, cardápio, tabela de preços ou lista de produtos no InDesign com dados vindos de planilha — template com estilos, mesclagem de dados (id_data_merge) em registros por página, imagens por campo, revisão de preços e preflight para gráfica. Use quando houver muitos itens com a mesma estrutura.
---

# print-catalogo — muitos itens, um padrão

Base: `docs/conhecimento/07`. Fundamentos: `print-fundamentos`. Entrega: `qa-preflight-entrega`.
App: `app-indesign`.

## 1. Dados

- Planilha CSV (UTF-8, cabeçalho na 1ª linha) com uma linha por item: `sku`, `nome`, `descricao`,
  `preco`, `foto` (caminho da imagem, relativo à pasta de imagens) etc. Preço formatado como texto final ("R$ 129,90").
- Confira contra a fonte do cliente; preço e código errados em catálogo impresso não se corrigem depois.
- Imagens já tratadas (`foto-produto`), mesmo enquadramento, nomes = `sku`.

## 1b. Atalho: catálogo direto da planilha

`id_recipe_catalog` (csvPath/jsonPath/records + `fields` para o nome das colunas) monta um documento novo
com uma grade de cartões (imagem, código, nome, descrição, preço) em `columns` × `rows` por página,
cabeçalho com o título do catálogo, rodapé com numeração e as páginas que forem precisas. Preço numérico
vira moeda (R$ por padrão); "Sob consulta" passa como está. Imagens relativas são lidas da pasta do CSV
(ou `imageFolder`). Descrição longa reduz um pouco e é avisada pelo número do item. Serve para tabela de
preços e catálogo simples; para layout próprio, use o template + `id_data_merge` abaixo.

## 2. Template

1. `id_manage_document` create no formato final com sangria 3 mm e margens; página-mestre com
   cabeçalho/rodapé e número de página.
2. Estilos (`id_manage_styles`): parágrafo `Nome`, `Descricao`, `Preco`; objeto `Foto`
   (ajuste proporcional, centrado). Tabela de preços: estilos de célula (cabeçalho, corpo) e de
   tabela com zebra (`alternateRowFill`, tinta 8–15 %), aplicados com `apply` na moldura.
3. Página(s)-modelo no fim do documento com o **módulo** do item: moldura de imagem nomeada
   `{{foto}}` (`id_modify_objects` rename) e caixa de texto com `{{nome}}`, `{{descricao}}`,
   `{{preco}}` — nomes = colunas.
4. A mesclagem cria **uma cópia das páginas-modelo por registro**. Vários itens por página:
   prepare o CSV com uma linha por página e colunas numeradas (`nome1`, `foto1`, `nome2`…) e
   campos `{{nome1}}`, `{{foto1}}`… na grade (2×3, 3×4).

## 3. Mesclar

`id_data_merge({ csvPath, templateFirstPage, templateLastPage, imageFolder,
imageFit: "proportionally" })` — leia o retorno: registros criados, campos sem correspondência e
texto excedente. Corrija nomes e rode de novo (em cópia do template ou após desfazer).

## 4. Revisão

1. `id_preflight` (fontes, links, texto excedente).
2. Texto excedente/estouro: ajuste o template (caixa maior, ajuste de linhas no estilo), não item a item.
3. Leia preços e códigos por amostragem e todos os itens em destaque/promoção
   (`id_get_page_preview` por página).
4. Busque padrões errados: `id_find_change` com GREP (ex. preço sem vírgula `R\$ ?\d+(?!,)`).

## 5. Saída

PDF/X-4 para gráfica (`id_export` pdf com o preset) + PDF leve para envio digital;
pacote com links e fontes se a gráfica pedir (`id_package`). Catálogo com várias seções:
numeração e sumário com `id_manage_sections` e `id_create_toc`.

## 6. Portão de saída

```
[ ] CSV conferido com a fonte; preços como texto final
[ ] Template com estilos e campos nomeados = colunas
[ ] Mesclagem sem campos órfãos nem imagens faltando
[ ] Preflight limpo; sem texto excedente; preços revisados
[ ] PDF/X-4 + PDF digital exportados
```
