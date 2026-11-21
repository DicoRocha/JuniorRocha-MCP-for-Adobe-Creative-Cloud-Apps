---
name: video-anuncio
description: Montar vídeos curtos de anúncio (6 s, 15 s, 30 s) a partir de imagens, vídeos e motion — gancho no primeiro segundo, uma mensagem, marca cedo, oferta e CTA no fim, versões por proporção (9:16, 4:5, 1:1, 16:9) e por gancho. Use para criativos de vídeo de Meta, TikTok, YouTube e display.
---

# video-anuncio — uma mensagem em poucos segundos

Base: `docs/conhecimento/05`, `06` §5. Antes: `roteiro-anuncio-video`, `plan-anuncios`.
Peças de motion: `motion-post-animado`, `motion-graficos-de-video`.

## 1. Estrutura por duração

| Duração | Estrutura |
|---|---|
| 6 s (bumper) | gancho+produto 0–2 s · benefício 2–4,5 s · marca/CTA 4,5–6 s |
| 15 s | gancho 0–2 · problema/benefício 2–8 · prova 8–12 · oferta+CTA 12–15 |
| 30 s | gancho 0–3 · problema 3–8 · solução/demonstração 8–18 · prova 18–24 · oferta+CTA 24–30 |

Marca visível nos primeiros 3–5 s (logo pequeno, produto ou cor). Funciona sem som.

## 2. Montagem (uma proporção-mestra)

1. Mestra em 9:16 (ou 4:5) — `pr_create_sequence` com o formato; material em bins por tipo.
2. Corte no ritmo da trilha: `media_analyze_audio` com `analyses: ["beats"]` na música → batidas →
   cortes a cada 2 ou 4 batidas (`pr_place_clip_on_timeline` nos tempos).
3. Texto em tela: títulos .mogrt (`pr_insert_mogrt`), ≤ 7 palavras por cartão, tempo de leitura.
4. Oferta e CTA: cartão final com preço/condição reais e endereço; ≥ 2 s parado.
5. Trilha: fade de saída alinhado ao fim (`pr_audio_keyframes` −∞ dB nos últimos 0,5 s);
   locução, se houver, com `pr_duck_music`.

## 3. Versões

- **Proporções**: `pr_auto_reframe({ aspect: "4:5" })` (e "1:1", "16:9") cria e abre a versão que
  segue a ação; depois reposicione títulos/CTA e confira quadros. Planos onde o reframe erra: ajuste
  `pr_set_effect_params` Motion Scale/Position no clipe.
- **Ganchos**: 2–3 aberturas diferentes, mesmo corpo.
- Nome: `ANGULO_GANCHO_DURACAO_FORMATO_v01` (ex. `DOR_PERGUNTA_15s_9x16_v01`).

## 4. Regras

- Sem botão falso, sem promessa vetada no segmento, sem depoimento/número inventado.
- Zona segura de 9:16 (250 px topo, 400 px base, 120 px direita).
- Legenda se houver fala. Loudness −14 LUFS (web) com pico ≤ −1 dBTP.

## 5. Conferir e exportar

`pr_export_frame_or_sequence` frame no 1º segundo (o gancho sozinho convence?), na oferta e
no fim. Export de todas as versões pelo Media Encoder (queueInAME); confira duração exata
(6,0 / 15,0 / 30,0 s).

## 6. Portão de saída

```
[ ] Gancho no 1º segundo; uma mensagem; marca em ≤ 5 s
[ ] Oferta e CTA reais, ≥ 2 s parados no fim
[ ] Duração exata; zona segura respeitada; funciona sem som
[ ] Versões por proporção recompostas e por gancho, nomeadas
[ ] Loudness e pico medidos
```
