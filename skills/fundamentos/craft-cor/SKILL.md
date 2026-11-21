---
name: craft-cor
description: Montar e aplicar paleta em qualquer peça — neutros, uma cor de destaque, proporção 60-30-10, harmonias, contraste mínimo de texto, e diferenças de tela (RGB) e impresso (CMYK, preto K100, carga de tinta), com o formato de cor que cada app espera. Use ao definir cores de uma peça ou série, ou quando o texto não lê sobre o fundo.
---

# craft-cor — paleta, contraste e meio

Base: `docs/conhecimento/02`. Use o kit (`plan-brand-kit`) quando existir.

## 1. Montar a paleta

1. **Neutros primeiro:** fundo · superfície (um passo mais perto do meio-tom) · borda · texto ·
   texto secundário (~60% do contraste do principal).
2. **Uma** cor de destaque viva. Semânticas (verde/âmbar/vermelho) só se precisar, nunca como destaque.
3. 5 a 8 cores no total. Off-white (#FAFAFA) e quase-preto (#0A0A0C) cansam menos que #FFF/#000.
4. Neutros com 3–8% da matiz da marca unificam a série.

**60-30-10:** 60% fundo · 30% superfícies e texto · 10% destaque. Destaque em CTA, chapéu,
número-chave — não em tudo.

## 2. Harmonias (trabalhe em HSL/HSB)

| Esquema | Uso |
|---|---|
| Monocromático | Elegante; depende de contraste de valor |
| Análogo (±30°) | Calmo, natural |
| Complementar (180°) | Contraste máximo; 80/20, nunca 50/50 |
| Complementar dividido | Contraste com menos tensão |
| Triádico | Uma domina, duas pontuam |

## 3. Contraste (medir, não achar)

- Texto normal ≥ **4,5:1** · texto grande (≥ 24 px ou 18,5 px negrito) e ícones ≥ **3:1**.
- Meça o texto contra **a superfície onde ele está** (o pedaço de foto atrás dele), não contra o fundo geral.
- Texto sobre foto: degradê de proteção 0 → 80–95% da cor de fundo, ou faixa sólida.
- Nunca depender só de cor para passar informação.

Como medir: exporte a peça e calcule a luminância relativa do texto contra a mediana dos pixels
atrás dele (o QA desta casa faz isso em Python); ou leia as cores no app e use a fórmula WCAG.

## 4. Tela × impresso

| | Tela | Impresso |
|---|---|---|
| Modo | RGB (sRGB; Rec.709 em vídeo) | CMYK com perfil da gráfica (FOGRA39/51 na Europa, GRACoL nos EUA; no Brasil confirmar) |
| Texto preto | quase-preto | **K100** puro |
| Preto chapado | — | composto, ex. C60 M40 Y40 K100 |
| Carga de tinta | — | ≤ 300% couché · ≤ 240–260% sem revestimento |
| Cores vivas RGB | livres | laranja, verde-limão, azul elétrico não reproduzem → Pantone ou ajuste |

## 5. Formato de cor por app

| App | Formato |
|---|---|
| Photoshop, Illustrator | `"#RRGGBB"` ou `{r,g,b}` 0–255 |
| InDesign | nome de amostra, `"#RRGGBB"`, `[r,g,b]` ou **`[c,m,y,k]` 0–100** (impresso) |
| After Effects | `[r,g,b]` **0–1** (HEX ÷ 255) |
| Lightroom | não é paleta: é color grading (matiz 0–359, saturação 0–100) |

## 6. Erros comuns

- Duas cores de destaque competindo.
- Destaque usado no fundo inteiro (vira fundo, perde a função).
- Texto secundário cinza que some sobre foto clara.
- Peça impressa com preto 4 cores em texto pequeno (registro fica borrado).
- Degradê longo em 8 bits com faixas visíveis (banding): suba para 16 bits ou adicione ruído/grão 1–2%.

## 7. Portão

```
[ ] Neutros + 1 destaque; 60-30-10
[ ] Contraste medido ≥ 4,5:1 (≥ 3:1 texto grande)
[ ] Impresso em CMYK, texto K100, carga ≤ limite
[ ] Mesma paleta em toda a série
```

## Regras de 18/11/2026

- Recolorir objeto já colorido: matiz, saturação e luminosidade em ajustes **separados** (preenchimento
  em modo Matiz + Matiz/Saturação + Curvas). Evite o modo Cor. Detalhe em `app-photoshop`.
