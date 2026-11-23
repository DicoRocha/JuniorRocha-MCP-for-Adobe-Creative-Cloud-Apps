---
name: foto-zonas
description: Sistema de Zonas (Ansel Adams) medido em L* para decidir tom e contraste com números — onde cada parte da foto deve cair (pele, sombra com detalhe, branco com textura), relatório media_zone_report antes e depois, diagnóstico (chapada, sem preto, sem branco, estourada, dominante nos médios) e qual controle do Lightroom ou do Photoshop mexe em cada zona. Use em revelação, retrato, produto, P&B e para igualar uma série.
---

# foto-zonas — tom medido, não chutado

Base: `foto-fundamentos`. Zona N ≈ L* N×10 (0 = preto puro, V = cinza médio 18 %, X = branco puro).
Cinza de cada zona em sRGB: 0 · 27 · 48 · 71 · 94 · 119 · 145 · 171 · 198 · 226 · 255.

## 1. Medir

`media_zone_report { filePath, zoneMapPath }` na prévia exportada (`lr_get_photo_preview` /
`ps_get_canvas_snapshot` salvam o arquivo) **antes** e **depois** de cada bloco. Olhe o mapa de zonas:
mostra onde cada área caiu sem a cor distrair.

## 2. Onde cada coisa deve cair

| Elemento | Zona alvo |
|---|---|
| Preto com detalhe (cabelo escuro, roupa preta) | III |
| Sombra profunda sem detalhe | I–II |
| Pele escura | IV–V |
| Pele média | V–VI |
| Pele clara | VI–VII |
| Céu claro, concreto ao sol | VII |
| Branco com textura (camisa, neve, porcelana) | VIII |
| Brilho especular, fonte de luz | IX–X (pouco) |

Retrato: o rosto manda; ajuste a exposição para a pele cair na zona dela e trate o resto em volta.
Produto em fundo branco: fundo IX–X de propósito, produto com detalhe até VIII.

## 3. Diagnóstico → ação

| Relatório | O que fazer (Lightroom / Photoshop) |
|---|---|
| `FLAT` (tudo em III–VII) | Pretos −5 a −20 e Brancos +5 a +20; ou curva S suave |
| `NO_BLACK` | Pretos para baixo até ~1–3 % em 0–I (salvo look desbotado pedido) |
| `NO_WHITE` | Brancos para cima até o branco com textura chegar a VIII |
| `HIGHLIGHTS_CLIPPED` > 0,5 % | Realces −20 a −60, depois Brancos; em pele, nunca estourar |
| `SHADOWS_CRUSHED` > 1 % | Sombras +10 a +40, Pretos de volta |
| `MIDTONE_CAST` | Balanço de branco primeiro; resto: Color Grade nos médios na cor oposta, pouca saturação |
| key errado para o assunto | Exposição (move a zona V); não use Claridade para isso |

Controle por zona no Lightroom: Pretos → 0–I · Sombras → II–III · Exposição → V (tudo) ·
Realces → VII–VIII · Brancos → IX–X. No Photoshop: Curvas com pontos nos cinzas da tabela acima, ou
dodge & burn em camada cinza 50 % (Sobrepor) numa zona por vez.

## 4. Série

Numa série, compare os relatórios: `meanL` e a zona mediana parecidos entre as fotos do mesmo grupo de
luz; mesma dominante nos médios (ou nenhuma).

## 5. Portão

```
[ ] Relatório antes e depois anexado ao raciocínio (números, não "ficou melhor")
[ ] Pele na zona dela; branco com textura em VIII; preto com detalhe em III
[ ] Corte: realces ≤ 0,5 %, sombras ≤ 1 % (salvo look de propósito)
[ ] Sem dominante nos médios, ou dominante pedida
```
