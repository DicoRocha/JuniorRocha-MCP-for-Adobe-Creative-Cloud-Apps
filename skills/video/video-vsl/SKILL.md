---
name: video-vsl
description: Editar VSL (vídeo de vendas) e vídeos longos de fala no Premiere — transcrição, corte de pausas e tropeços, estrutura por blocos do roteiro, B-roll e telas de prova, gráficos .mogrt, legendas, trilha com ducking e capítulos/marcadores. Use para VSL, aula, webinar editado e vídeo explicativo de 3–30 min.
---

# video-vsl — fala que segura até a oferta

Base: `docs/conhecimento/05`. Antes: `roteiro-vsl` (blocos e tempos). Fala: `video-fala-limpa`.
Legendas/som: `video-legendas-e-som`. Gráficos: `motion-graficos-de-video`.

## 1. Projeto

1. `pr_manage_project` new em `04_video/VSL.prproj`; bins (`createBin`): Bruto, Broll, Provas, Motion, Audio.
2. `pr_import_media` (gravações, B-roll, prints, .mogrt depois). Sequência a partir do clipe principal
   (`pr_create_sequence` fromClipName) — 1920×1080 ou 1080×1920 conforme o canal.

## 2. Texto primeiro

1. `media_transcribe` (`language`) → JSON com palavras; nomes de produto/pessoa corrigidos depois
   pelo `glossary` de `media_build_captions`.
2. Revise contra o roteiro: o que ficou, o que foi refeito (escolha o melhor take por bloco).
3. Marque os blocos do roteiro na timeline (`pr_manage_markers` add, um por bloco:
   gancho, problema, história, mecanismo, prova, oferta, garantia, CTA).

## 3. Corte

1. `media_analyze_audio` (`analyses: ["cutPlan"]`, `minSilence: 0.45`, `padding` 0.08–0.12) por arquivo.
2. Junte com a lista editorial (takes ruins, repetições) e aplique: `pr_apply_cut_plan` por clipe,
   um após o outro. Confira duração e emendas (`pr_get_sequence_state`).
3. Ritmo: em VSL, corte seco; jump cut disfarçado por zoom 100 → 108 % (`pr_set_effect_params`
   Motion) a cada 2–4 frases.

## 4. Cobertura e prova

- B-roll a cada 5–10 s em trechos explicativos (V2), nunca cobrindo a cara na promessa ou na oferta.
- Provas (depoimento, print, número) em tela cheia ou PIP com a fonte visível; só material real
  e autorizado.
- Gráficos: lower third na 1ª aparição do apresentador, número em destaque, cartão da oferta
  (`pr_insert_mogrt` com `values`).

## 5. Legenda, som, export

1. `media_build_captions` (com o mapa de cortes) → `pr_import_captions` (faixa nativa) ou `pr_captions_as_mogrt`
   (legenda com o estilo da marca).
2. Trilha na A2 (`pr_place_clip_on_timeline`) → `pr_duck_music` (−18 a −22 dB sob voz);
   voz em −16 a −14 LUFS para web.
3. Cor e export: `video-cor-e-export` (`pr_export_frame_or_sequence` queueInAME).
4. Capítulos (YouTube): tempos dos marcadores de bloco em texto (`00:00 Título`).

## 6. Portão de saída

```
[ ] Blocos do roteiro presentes e marcados; promessa e oferta com rosto
[ ] Pausas e tropeços cortados; emendas sem estalo
[ ] B-roll e provas reais, autorizados, com fonte quando houver
[ ] Legenda revisada (nomes, números, preço); trilha abaixo da voz
[ ] Loudness medido; quadros conferidos por bloco; projeto salvo
```
