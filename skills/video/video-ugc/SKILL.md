---
name: video-ugc
description: Editar vídeo estilo UGC (criador falando para a câmera do celular) para anúncio e orgânico no Premiere — gancho em 1–2 s, cortes secos, legenda grande palavra a palavra, zoom de ênfase, B-roll do produto em uso, som nativo e várias aberturas para teste. Use para depoimentos, reviews, "3 motivos" e criativos nativos de TikTok/Reels.
---

# video-ugc — parece post, funciona como anúncio

Base: `docs/conhecimento/05`, `06` §5. Antes: `roteiro-ugc`. Depois: `qa-revisao-video`.

## 1. Material

- Gravações verticais 1080×1920 (ou 4K vertical), ≥ 3 aberturas diferentes (ganchos), corpo, CTA.
- B-roll do produto em uso, gravado pelo mesmo celular (mesma cara de "nativo").
- Autorização de uso de imagem e, se for depoimento, relato real.

## 2. Montagem

1. Projeto/sequência 1080×1920 30 fps (`pr_manage_project`, `pr_create_sequence` fromClipName).
2. `media_transcribe` de cada take → escolha das melhores falas pelo texto.
3. Cortes: `media_analyze_audio` (`analyses: ["cutPlan"]`, `minSilence: 0.3`, `minGap: 0.25`,
   `padding` 0.05–0.08) — UGC é mais rápido que VSL — e `pr_apply_cut_plan`.
4. Estrutura: **gancho (0–2 s)** → problema/contexto → demonstração → prova → CTA (≤ 3 s).
5. Zoom de ênfase (punch-in 100 → 115 % em 1 frame) nas palavras-chave: `pr_set_effect_params`
   Motion com chaves.
6. B-roll em V2 de 1–2 s cobrindo explicações; produto sempre real e em uso.

## 3. Legenda (é a cara do formato)

- `media_build_captions` com `maxLines: 1`, `maxChars` 14–18 → blocos de 1–3 palavras.
- Grande (≥ 64 px), sans pesada, contorno ou caixa, centro entre 55 % e 70 % da altura (acima da
  zona de botões e legenda da plataforma).
- Palavra-chave em cor de acento: `.mogrt` de legenda (`motion-tipografia-cinetica`) ou estilo no app.

## 4. Som

Voz nativa limpa (sem eco); trilha discreta ou som em alta da plataforma (adicionado no app de
postagem, não no arquivo, quando for som licenciado da plataforma). `pr_duck_music` se houver trilha.

## 5. Variações para teste

Duplique a sequência por gancho (mesmo corpo): `pr_execute_extendscript` com
`sequence.clone()` (um por chamada) e troque só os primeiros 2–3 s (`pr_edit_timeline` extract do gancho
antigo + `pr_place_clip_on_timeline` insert do novo). Nome:
`UGC_<angulo>_<gancho>_9x16_v01`. Export de cada uma pelo Media Encoder
(`pr_export_frame_or_sequence` queueInAME).

## 6. Portão de saída

```
[ ] Gancho em ≤ 2 s, entendido sem som (legenda)
[ ] Cortes secos, sem pausa morta; punch-in nas palavras-chave
[ ] Legenda grande, 1–3 palavras, fora das zonas de interface
[ ] Produto, preço e relato reais; autorização de imagem
[ ] ≥ 3 versões de gancho nomeadas para teste
```
