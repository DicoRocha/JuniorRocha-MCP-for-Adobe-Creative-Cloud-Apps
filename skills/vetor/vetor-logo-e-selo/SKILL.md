---
name: vetor-logo-e-selo
description: Construir no Illustrator logo simples, selo, ícone ou família de ícones com geometria limpa — grade, poucos pontos de âncora, traço consistente, texto em curva quando preciso, versões positiva/negativa/monocromática e teste em tamanho mínimo. Use para selos de campanha, ícones de passos, marcas simples e redesenho vetorial.
---

# vetor-logo-e-selo — geometria antes de enfeite

Base: `docs/conhecimento/01`, `02`; contrato do app: `app-illustrator` (Y para cima,
coordenadas em pt). Depois: `vetor-pacote-de-marca`.

## 1. Antes de desenhar

- O que o símbolo precisa dizer em **uma palavra**; onde vai aparecer (favicon 16 px? cartaz?).
- 3 esboços de ideia em texto (forma + por quê). Logo de cliente existente: redesenhe só se pedido.
- Fontes do kit (`plan-brand-kit`); licença que permita uso em logo.

## 2. Construção

1. `ai_manage_document` create (RGB para tela; CMYK se for só impresso) com pranchetas do
   mesmo tamanho (ex. 240×240 pt por ícone; `ai_manage_artboards` add).
2. Grade: círculo/quadrado base e eixos (camada "Grade", bloqueada — `ai_manage_layers`).
3. Formas primitivas primeiro (`ai_create_shape`: ellipse, rectangle, polygon, star) e
   **Pathfinder** (`ai_pathfinder`: unite, minusFront, intersect) para combinar.
4. Curvas só onde a primitiva não chega (`ai_create_bezier_path`): âncoras nos extremos da curva,
   alças horizontais/verticais, o mínimo de pontos.
5. Ícones: **um peso de traço** para a família (ex. 9 pt em 240 pt ≈ 3,75 %), pontas e cantos
   iguais (redondos ou retos), mesma margem interna, mesma "massa" visual.
6. Selo com texto circular: `ai_text_on_path({ text, bottomText, radius, tracking: 80–150 })` — texto de cima
   por fora do círculo, de baixo por dentro e em pé, os dois centralizados e editáveis; depois converta em
   curvas para a versão final (`createOutlines` ou numa cópia).
7. Arredondar cantos/efeitos: `ai_apply_live_effect` (roundCorners, offsetPath) e expanda
   (`expandAppearance: true`) na versão final.

## 3. Versões

| Versão | Uso |
|---|---|
| Positiva (cor) | padrão |
| Negativa | sobre fundo escuro/foto |
| Monocromática preta e branca | carimbo, fax, gravação |
| Reduzida (só símbolo) | favicon, avatar, ≤ 32 px |

Cores por amostra global (`ai_swatches` add) — trocar a cor muda tudo.

## 4. Teste

`ai_get_artboard_preview` a 100 % e em escala pequena (export PNG a 16, 32, 64 px com
`ai_export_assets` scale) sobre fundo claro e escuro. Detalhe que some a 32 px sai da versão reduzida.

## 5. Arquivo limpo

Camadas nomeadas, grade oculta, sem pontos soltos (`ai_find_objects`), texto em curvas na
versão de entrega e o editável guardado. `ai_manage_document` save (.ai).

## 6. Portão de saída

```
[ ] Ideia em uma palavra; construída sobre grade/primitivas
[ ] Mínimo de âncoras; traço e cantos consistentes na família
[ ] Versões positiva, negativa, mono e reduzida
[ ] Legível a 32 px e 16 px (versão reduzida)
[ ] Cores em amostras globais; arquivo limpo, texto em curvas na entrega
```
