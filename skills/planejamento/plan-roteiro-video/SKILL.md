---
name: plan-roteiro-video
description: Roteador de vídeo — decide o formato (reels, UGC, anúncio, VSL, institucional, depoimento, motion) e a skill de roteiro, e monta a lista de planos, de B-roll, de assets a captar ou gerar e o plano de pós (legenda, trilha, gráficos). Use antes de qualquer vídeo novo.
---

# plan-roteiro-video — do pedido ao plano de filmagem/edição

Base: `docs/conhecimento/10` (Parte 1) e `05`. Antes: `plan-briefing`.

## 1. Escolha o formato e a skill

| Pedido | Duração | Roteiro | Execução |
|---|---|---|---|
| Reels / Shorts / TikTok orgânico | 15–45 s | `roteiro-reels-shorts` | `video-reels` |
| Anúncio em vídeo | 6 / 15 / 30 s | `roteiro-anuncio-video` | `video-anuncio` |
| UGC (criador, depoimento caseiro) | 15–45 s | `roteiro-ugc` | `video-ugc` |
| VSL / vídeo de vendas | 2–15 min | `roteiro-vsl` | `video-vsl` |
| Motion puro (logo, explicativo, produto) | 5–60 s | `roteiro-storyboard` | `motion-*` |
| Fala gravada para editar (já existe) | — | transcrever primeiro | `video-fala-limpa` |

## 2. Material existente ou a captar?

- **Já gravado:** `media_transcribe` cada arquivo → leia os segmentos → o roteiro vira
  **lista editorial** (quais trechos ficam, em que ordem). Ver `video-fala-limpa`.
- **A gravar:** roteiro em duas colunas (tempo | imagem | áudio | texto na tela) e lista de planos.
- **A gerar por IA:** só depois da ideia aprovada; ver `pipeline-ia-externa` e os três portões.

## 3. Listas que saem desta skill

1. **Planos** (`shot list`): nº · enquadramento · ação · fala · duração · fonte (gravar/arquivo/IA).
2. **B-roll**: para cada frase abstrata, uma imagem concreta (metáfora em uma frase, aprovada).
3. **Assets**: fotos (Lightroom), vetores/ícones (Illustrator), gráficos (`.mogrt`), trilha, logo.
4. **Pós**: legenda (estilo e idioma), trilha (fonte e licença), títulos/lower thirds
   (`motion-graficos-de-video`), formato de saída (9:16, 4:5, 16:9) e loudness alvo.

## 4. Regras

- Fala: ~2,5 palavras por segundo. Conte as palavras para caber no tempo.
- Gancho nos 2 primeiros segundos (imagem + texto na tela; funciona sem som).
- Texto na tela ≤ 7 palavras por vez; legenda sempre (maioria assiste sem som).
- Música só na pós; material gerado por IA sem trilha.
- Proporção definida antes de gravar/gerar (9:16 gravado na vertical vale mais que recorte).

## 5. Saída

`00_briefing/roteiro.md` (roteiro + listas) e `00_briefing/planos.csv` (lista de planos).

## 6. Portão de saída

```
[ ] Formato e skill de roteiro escolhidos; duração definida
[ ] Material existente transcrito ou roteiro de gravação pronto
[ ] Listas de planos, B-roll, assets e pós completas
[ ] Contagem de palavras cabe no tempo; gancho ≤ 2 s
[ ] Proporção e destino definidos antes de gravar/gerar
```
