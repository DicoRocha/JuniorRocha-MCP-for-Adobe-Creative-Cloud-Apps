---
name: foto-produto
description: Tratar foto de produto para e-commerce, catálogo e anúncio no Photoshop — recorte limpo, fundo branco ou de marca, sombra de contato realista, cor fiel ao produto, enquadramento padronizado e exportação em lote. Use para fotos de produtos, embalagens e objetos.
---

# foto-produto — fiel, limpo, padronizado

Base: `docs/conhecimento/03` e `07` §6. Recorte detalhado: `foto-recorte-e-composicao`.

## 1. Padrão da série (defina antes)

| Item | E-commerce (padrão comum) |
|---|---|
| Tela | 2000×2000 px (1:1), sRGB |
| Fundo | branco puro #FFFFFF (marketplace) ou cor da marca |
| Ocupação | produto ocupa 80–85 % do lado maior |
| Posição | centrado; base do produto na mesma altura em toda a série |
| Sombra | de contato suave, sem sombra projetada longa |

Anote em `02_design/padrao-produto.md` e use em todas as fotos.

## 2. Passos (um produto)

Atalho: `ps_recipe_product_shot({ filePath, format, kitPath, outputPath })` faz os passos 2–7 numa chamada
(recorte, fundo em degradê radial ou sólido do kit, produto como Smart Object na zona segura, sombra de
contato; camadas Produto/Sombra/Fundo editáveis; PNG). Confira a cor do produto (passo 6) e olhe a prévia.


1. `ps_open_document` da foto (TIFF/JPEG tratado no Lightroom: WB por cartão cinza se houver).
2. Converta a camada em Smart Object (`ps_smart_object` convert).
3. Recorte: `ps_selection_and_masks` selectSubject → addMaskFromSelection. Refine bordas
   (vidro, cabelo, tecido) conforme `foto-recorte-e-composicao`. Nunca apagar pixels.
4. Fundo: `ps_create_layer` solidColor (#FFFFFF ou cor) abaixo do produto.
5. Sombra de contato: camada nova abaixo do produto, elipse achatada preta
   (`ps_selection_and_masks` ellipse com feather 20–40) com opacidade 15–35 %, e
   `ps_apply_filter` applyGaussianBlur 10–25. Ou estilo dropShadow com distância 0.
6. Cor fiel: compare com o produto real/foto de referência; `ps_adjustment_layer`
   hueSaturation só na faixa errada. Cor de produto é informação, não estilo.
7. Enquadre pelo padrão (`ps_transform_and_manage_layer` scale/translate) e olhe
   (`ps_get_canvas_snapshot`).
8. `ps_save_document` PSD + JPG/PNG/WebP conforme a plataforma.

## 3. Série

Monte um **template PSD** (fundo, sombra, guia de base, Smart Object "Produto") e troque o
conteúdo (`ps_smart_object` replaceContents) por foto; ou use `ps_batch_variants` com CSV
(`Produto` = caminho da foto já recortada, `__file` = SKU).

## 4. Regras

- Não alterar forma, cor, rótulo ou tamanho do produto (publicidade enganosa).
- Reflexo e brilho naturais mantidos; poeira e fiapos removidos.
- Embalagem com texto legível e reto (corrigir perspectiva só se for distorção de lente).

## 5. Portão de saída

```
[ ] Padrão da série escrito e aplicado (tela, fundo, ocupação, base)
[ ] Recorte sem halo sobre fundo claro e escuro
[ ] Sombra de contato realista e igual na série
[ ] Cor conferida com o produto real
[ ] PSD em camadas + exportações nomeadas por SKU
```
