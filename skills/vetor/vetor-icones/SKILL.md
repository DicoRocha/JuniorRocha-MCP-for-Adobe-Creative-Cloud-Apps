---
name: vetor-icones
description: Desenhar uma família de ícones no Illustrator com grade, traço e cantos constantes — prancheta por ícone, grade de 24 px, peso único, raio de canto padrão, exportação SVG/PNG nomeada. Use para "ícones do site", "ícones dos serviços", "pictogramas" ou "set de ícones da marca".
---

# vetor-icones — o conjunto vale mais que o ícone

App: `app-illustrator`. Marca: `craft-marca`. Para selo/logo: `vetor-logo-e-selo`.

## 1. Sistema antes do desenho

| Regra | Valor padrão |
|---|---|
| Prancheta | 24 × 24 px (exportar também 48 e 96) |
| Área viva | 20 × 20 px (2 px de respiro em cada lado) |
| Traço | 1,5 px (fino) ou 2 px (padrão), pontas e junções redondas |
| Raio de canto | 2 px em retângulos; círculos inteiros |
| Ângulos | 0°, 45°, 90°; outros só se o objeto pedir |
| Estilo | contorno OU preenchido em toda a família, nunca misturado |

Formas-base de referência na grade: círculo Ø 20, quadrado 18×18, retângulo vertical 16×20,
horizontal 20×16 — ícones de pesos visuais iguais usam a forma-base que lhes cabe.

## 2. Montagem no Illustrator

1. `ai_manage_document` create RGB; `ai_manage_artboards` cria uma prancheta 24×24 por ícone, nomeada
   `icone-<nome>` (lado a lado, 24 px de espaço).
2. Desenho: `ai_create_shape` (retângulos, elipses) e `ai_create_bezier_path` para traçados; uniões e
   recortes com `ai_pathfinder`.
3. Traço padrão em todos: `ai_modify_objects` (strokeWidth, cap/join round) ou um estilo gráfico
   (`ai_graphic_style`).
4. Alinhar ao pixel: coordenadas inteiras ou .5 para traços ímpares; conferir com `ai_get_artboard_preview` ampliado.

## 3. Coerência (revisão da família)

- Coloque todos lado a lado em 24 px e em 16 px: nenhum parece mais pesado ou maior.
- Detalhe mínimo ≥ 2 px (abaixo disso some em 16 px).
- Metáfora clara para o público (não o ícone da moda): teste com 3 pessoas "o que é isto?".
- Variações de cor só por preenchimento da paleta (`ai_swatches`), nunca traço de outra espessura.

## 4. Exportação

- Antes de exportar: contornar traços numa **cópia** (o original fica editável).
- `ai_export_assets` por prancheta: SVG (web), PNG 24/48/96 px transparente. Nomes `icone-agendar.svg`.
- SVG sem ids aleatórios nem estilos embutidos excessivos; `currentColor` quando o site pedir cor por CSS.

## 5. Portão de saída

```
[ ] Grade 24 px, área viva 20 px, traço e raio padrão definidos e aplicados a todos
[ ] Mesmo estilo (contorno ou preenchido) na família inteira
[ ] Teste em 16 px: nenhum detalhe < 2 px some
[ ] Pranchetas nomeadas; original editável + cópia contornada
[ ] SVG e PNG 24/48/96 exportados com nomes padrão
```
