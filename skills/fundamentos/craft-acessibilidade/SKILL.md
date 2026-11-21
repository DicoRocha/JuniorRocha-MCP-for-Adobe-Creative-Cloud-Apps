---
name: craft-acessibilidade
description: Garantir que a peça é legível e acessível — contraste de texto (WCAG), tamanho mínimo por mídia, legenda em vídeo, informação que não depende só de cor, tempo de leitura em motion e texto alternativo. Use em toda peça com texto e antes de qualquer entrega.
---

# craft-acessibilidade — todo mundo consegue ler

Base: `docs/conhecimento/01`, `02`, `05`. Vale para todas as áreas; o portão entra em
`qa-revisao-visual`.

## 1. Contraste (WCAG 2.x)

| Texto | Mínimo |
|---|---|
| Normal (corpo, legenda) | **4,5 : 1** |
| Grande (≥ 24 px, ou ≥ 19 px bold) e ícones essenciais | **3 : 1** |

- Medir com as cores reais; texto sobre foto: medir no pior ponto do fundo atrás da letra.
- Sem contraste: faixa sólida, caixa atrás do texto (opacidade 70–85 %), degradê de proteção
  ou sombra suave — não "aumentar a sombra até ler".
- Cor de marca clara (amarelo, areia) em texto pequeno sobre branco quase sempre reprova:
  use-a em forma/acento, texto em cor escura.

## 2. Tamanho mínimo

| Mídia | Mínimo prático |
|---|---|
| Post 1080 px de largura | corpo ≥ 28 px; título ≥ 5 % da altura |
| Story/Reels 1080×1920 | legenda ≥ 48 px; texto de apoio ≥ 36 px |
| Thumbnail 1280×720 | título legível a 320 px de largura (≥ 80 px) |
| Impresso A5/A4 | corpo ≥ 8 pt (ideal 9–11); notas legais ≥ 6 pt |
| Cartaz a 3 m | título ≥ 7 cm de altura de caixa-alta |

## 3. Não depender só de cor

Status, gráfico, legenda de mapa, botão: cor **mais** forma, rótulo ou ícone.
Evite pares vermelho/verde como única diferença (~8 % dos homens não distinguem).

## 4. Vídeo e motion

- **Legenda sempre** (maioria assiste sem som): ≥ 48 px em 9:16, 2 linhas, caixa ou contorno.
- Texto na tela: ≥ 0,3 s por palavra + 0,5 s.
- Sem piscar rápido (> 3 flashes por segundo) nem estroboscópio.
- Fala sobre música: trilha ≥ 12 dB abaixo da voz (`pr_duck_music`).

## 5. Digital e impresso

- Texto alternativo para imagens publicadas (descrição em 1 frase, no post/site).
- PDF digital: ordem de leitura e texto real (não texto em imagem) quando for distribuído.
- Formulário/cupom impresso: campos ≥ 8 mm de altura para escrever à mão.

## 6. Como conferir no MCP

Prévia reduzida simula o celular: `ps_get_canvas_snapshot({ maxDimension: 400 })`,
`id_get_page_preview({ resolution: 36 })`, `ae_get_comp_frame_preview`. Se não lê a 400 px,
não lê no celular. Converta mentalmente para tons de cinza: título ainda destaca?

## 7. Portão de saída

```
[ ] Contraste ≥ 4,5:1 (normal) / 3:1 (grande), medido no pior ponto
[ ] Tamanhos mínimos da mídia respeitados
[ ] Nenhuma informação só por cor
[ ] Vídeo legendado; tempo de leitura ok; sem flashes rápidos
[ ] Prévia a ~400 px legível
```
