---
name: video-reels
description: Montar vídeo curto vertical (Reels, Shorts, TikTok, Stories, 6–60 s) no Premiere — sequência 9:16, gancho em 2 s, cadência por tipo de plano, punch-in, B-roll, quebras de padrão, fotos com movimento, grafismo do After Effects por Dynamic Link, transições e fecho com CTA. Use para qualquer vídeo vertical curto, com ou sem fala.
---

# video-reels — vertical curto no Premiere

Antes: `roteiro-reels-shorts` (roteiro), `video-fala-limpa` (se houver fala), `motion-direcao-de-arte`.
Depois: `video-legendas-e-som`, `video-cor-e-export`.

## 1. Projeto e sequência

1. `pr_manage_project` operation `new` com `filePath` em `04_video/…prproj` (fecha e salva os
   projetos abertos e deixa o novo ativo). Ou `open` no existente.
2. Bins: `pr_manage_project` createBin ("Bruto", "Fotos", "Motion", "Audio").
3. Importar: `pr_import_media` (`targetBinName`). Comps do AE: o `.aep` com `aeCompNames` (Dynamic Link).
4. Sequência: `pr_create_sequence` com `fromClipName` de um clipe 1080×1920 (comp do AE ou vídeo
   vertical). **Sem `fromClipName` o Premiere abre um diálogo.**
5. `pr_get_sequence_state` — confirme 1080×1920.

## 2. Montar

- `pr_place_clip_on_timeline` (overwrite, `timeSeconds`, `videoTrackIndex`). V1 imagem, V2 grafismo/títulos, V3 legenda.
- Foto parada: defina a duração no item antes de colocar (script livre: `item.setInPoint/setOutPoint` em ticks,
  1 s = 254016000000) e **feche as lacunas de 1 quadro** que o arredondamento deixa (estender o fim até o próximo início).
- Foto maior que a tela: escala-base = 1920 ÷ altura da foto (ex. 2400 px → 80%).

## 3. Ritmo

| Elemento | Regra |
|---|---|
| Gancho | primeira mudança visual até **2 s**; palavra-chave grande na tela |
| Duração do plano | abertura 1,5 s · demonstração 1,1 s · explicação 2,5 s · ação 0,8–1,2 s · fecho 1,5 s |
| Peça calma (saúde, luxo, B2B) | planos de 3–4 s, push lento, transições suaves |
| Quebra de padrão | a cada 3–5 s: punch-in, texto, corte, mudança de cor |
| Punch-in | leve 115–125% · perceptível 130–140% |
| B-roll | 0,8–1,5 s a cada 2–3 s de fala, mostrando o resultado |
| Fecho | uma ação; CTA parado ≥ 2 s |

## 4. Movimento e efeitos (tipados)

- Ken Burns: `pr_set_effect_params` component "Motion", keyframes de Scale e Position
  (Position normalizada 0–1: `[0.5, 0.5]` = centro). Varie direção e zoom por cena.
- Efeitos: `pr_list_effects` (search) → `pr_apply_effect` com `parameters`/`keyframes`.
  Nome ambíguo (dois efeitos com o mesmo nome) → `EFFECT_AMBIGUOUS`: use o nome único
  (ex. "Gaussian Blur (Legacy)"). Leia o que ficou com `pr_list_clip_effects`.
- Transições: `pr_list_effects` kind videoTransitions → `pr_apply_transition` (`clipIndex`,
  `atStart` false = no fim do clipe). Uma família por peça (`motion-direcao-de-arte`).

## 5. Grafismo

Dois caminhos (`motion-fundamentos`):
- **Dynamic Link:** comp de título com fundo transparente na V2, mesma duração da cena. Enquanto o AE
  estiver travado, o Premiere também trava ao mostrar quadros dessas comps.
- **`.mogrt` (preferido para peças repetíveis):** no AE, comp do título/lower third/legenda →
  `ae_export_mogrt` expondo os textos (e cores) com nomes claros ("Titel", "Name", "Zeile 2");
  no Premiere `pr_insert_mogrt` com `values` por nome e `durationSeconds`. O Premiere não depende do
  AE aberto, e o mesmo modelo serve para toda a série.

## 5b. Reels de fala (talking head + tela)

**Atalho (primeiro corte em uma chamada):** `pr_assemble_reel` com `clips` (na ordem), `musicPath`
e, para legenda com estilo, `captionsMogrt`. Ele importa num bin, cria a sequência vazia no formato do
primeiro clipe, corta as pausas de cada clipe (áudio e vídeo juntos), transcreve e monta as legendas já
re-temporizadas aos cortes (`.mogrt` por bloco ou a trilha nativa), põe a trilha na A2 até o fim da edição
com ducking sob a fala, audita a timeline e, com `exportPath`, enfileira no Media Encoder. Tudo continua
editável: depois revise o texto das legendas, encaixe B-roll/tela e títulos. Use o caminho manual abaixo
quando precisar de corte editorial (frases escolhidas) ou de ordem diferente da gravação.

Manual:
Ordem: transcrever (`media_transcribe`) → revisar texto → cortar pausas (`media_analyze_audio` cutPlan
ou lista editorial → `pr_apply_cut_plan` por clipe, um após o outro) → B-roll/tela sobre a fala →
legendas (`media_build_captions` com `keep`/`offsetSeconds` → `pr_captions_as_mogrt` com o `.mogrt` de legenda,
ou `pr_import_captions`) →
trilha (`pr_import_media` + `pr_place_clip_on_timeline` na A2 → `pr_duck_music`) → títulos `.mogrt`
→ export pelo Media Encoder (`pr_export_frame_or_sequence` `queueInAME: true`).

## 6. Conferir

`pr_export_frame_or_sequence` mode frame com `timeSeconds` em cada cena (fora das transições)
→ olhar. Salvar: `pr_manage_project` save.

## 7. Erros comuns

- Lacuna de 1 quadro preta entre fotos.
- Quadro de conferência no meio de uma transição (parece erro).
- Transição + fade da comp no mesmo ponto (dupla).
- Tudo no mesmo ritmo do começo ao fim.

## 8. Portão

```
[ ] Sequência 1080×1920; nada fora da zona segura
[ ] Gancho até 2 s; ritmo da célula de motion
[ ] Sem lacunas; transições de uma família
[ ] Quadro de cada cena conferido; projeto salvo
```

## Regras de 18/11/2026 — nível de acabamento

- **Nada de só o básico.** O alvo é vídeo premium que prende a atenção: gancho visual nos 2 primeiros
  segundos, mudança visual a cada 3–5 s, destaques na tela onde a pessoa clica, transições diferentes
  entre blocos, cartão final animado. A pessoa deve ser surpreendida.
- **Fluxo recomendado:** cortes e som no Premiere → renderizar o vídeo cortado (mezzanine) →
  finalizar o motion no After Effects (legendas palavra por palavra, tarjas, transições, destaques) →
  exportar. O caminho inverso (gráficos do After com alfa sobre a sequência do Premiere) serve para
  ajustes pequenos.
- Selfie espelhada (texto invertido na roupa/fundo): desvirar na horizontal.
- Áudio final em −14 LUFS integrado, pico real ≤ −1 dBTP — medir no arquivo exportado.
- Exportar sequência no Premiere exige `presetPath` (.epr); sem ele não sai arquivo.

## Receitas de edição (pesquisa de tutoriais, 18/11/2026)

| Receita | Como | Quando |
|---|---|---|
| Corte em J | O áudio do próximo trecho entra alguns quadros antes da imagem | Colar falas, dar ritmo, entregar informação mais rápido |
| Corte em L | O áudio do trecho atual continua sobre a imagem seguinte | Conversa natural, b-roll sobre a fala |
| Quebra de padrão | Mudança visual (plano, zoom, gráfico, b-roll) a cada 5–7 s; alternar tamanhos de plano | Vídeo curto com fala contínua |
| Rampa de velocidade | Remapeamento de tempo com curvas suaves; câmera lenta com fluxo óptico; desfoque direcional na parte rápida | Entrar/sair de uma ação; nunca como enfeite |
| Corte na batida | Marcadores nas batidas da trilha (`media_analyze_audio` beats); cortes e entradas de gráfico nelas | Abertura, virada, encerramento |
| Som de apoio | Whoosh em transição, impacto em título, clique em interface; poucas camadas, volume baixo | Sempre que houver motion |
