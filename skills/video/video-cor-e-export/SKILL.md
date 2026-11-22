---
name: video-cor-e-export
description: Cor e exportação de vídeo no Premiere — correção antes do look, igualar planos, Color Mode (Premiere 27) ou Lumetri por parâmetros, entrega Rec.709 SDR e exportação por plataforma pelo Media Encoder (fila em segundo plano) ou direto, com conferência do arquivo final. Use no fim de qualquer edição de vídeo.
---

# video-cor-e-export — corrigir, dar look, entregar

## 1. Cor

1. **Corrigir:** exposição e balanço por plano; igualar planos vizinhos.
2. **Pele:** plausível (sem verde/magenta); conferir num quadro exportado.
3. **Look:** com intensidade 30–70%; o mesmo em toda a peça.
4. Fotos já tratadas no Lightroom (`foto-revelacao`) **não** recebem outro look por cima.

### Look pedido tem de aparecer (22/11/2026)

Um "look cinematográfico" com Contrast 24, Blacks −16 e Saturation 88 num vídeo de celular chapado mudou
o desvio de luminância só ~5% — a pessoa viu o vídeo "igual ao original". Ponto de partida que aparece
(Lumetri em AE/Premiere, rosto de vídeo de celular):

- **Color Balance antes do Lumetri** (`ADBE Color Balance 2`, 1º efeito, Preserve Luminosity ligado):
  sombras R −14 G −2 B +20, médios R +3 B −5, realces R +12 G +2 B −12 (teal e laranja). Antes do Lumetri
  para que um trecho com Saturation 0 continue P&B.
- **Lumetri:** Exposure −0.2, Contrast ~48, Highlights ~−42, Shadows ~−18, Whites ~0, Blacks ~−40,
  Saturation 90, Faded Film ~16, Sharpen ~14, Vibrance ~8, Temperature ~−6; vinheta −2.4 (só aparece se a
  borda da camada estiver visível — numa camada com matte, a vinheta some).
- **Medir antes/depois** no mesmo quadro (`saveFrameToPng` com o efeito ligado e desligado, ou export de
  quadro): o desvio de luminância do rosto deve subir **≥ 15%**, os pretos (p2) devem descer de forma
  visível e nada pode estourar (p98 < 0,95 na pele). Mostre o antes/depois à pessoa.
- Lumetri no AE por script: os índices mudam por versão; leia os nomes antes (`property(i).name`). Split
  Toning e Color Wheels são blobs sem API — use Color Balance para tingir.

### Premiere 27 (nov/2026): Color Mode no lugar do painel Lumetri

O **painel** Lumetri saiu; a cor nova é o **Color Mode** (área própria de cor). O que o MCP alcança
(testado ao vivo em 14/11/2026, Premiere 27.0):

- As **operações do Color Mode são efeitos** e o script aplica e ajusta: **"Color And Contrast"**
  (`ADBE Color And Contrast`: Exposure, Contrast, Pivot, Black, Saturation, Temperature, Tint e zonas
  Highlights/Lighter/Lightest… com exposição própria), **"Film Color"** (emulação de filme), **"Color
  Mixer"**, **"HSL Mask"** e **"Color Space Transform"**. Fluxo: `pr_apply_effect` → `pr_list_clip_effects`
  → `pr_set_effect_params`. Exposure +1 clareou o plano como esperado; **nomes repetem por zona** (o 1º
  "Exposure" é o global) — para mexer numa zona, use `pr_execute_extendscript` pelo índice do parâmetro.
- A área do Color Mode em si (grade de clipes, estilos, cor da sequência inteira) **não tem API**: isso fica
  com a pessoa no app.
- O efeito **"Lumetri Color"** continua existindo e o script ainda o aplica (130 parâmetros), mas a Adobe
  recomenda **não misturar** Lumetri com Color Mode em projeto novo (limita o Color Mode).

Regra: **projeto novo → "Color And Contrast"** (exposição/balanço por plano) e o look final no Color Mode
pela pessoa; **projeto antigo com Lumetri → continue no Lumetri** (efeito, por parâmetros). Confira
sempre com um quadro exportado (`pr_export_frame_or_sequence` mode frame) antes e depois.

## 2. Destinos

| Destino | Formato |
|---|---|
| Reels / TikTok / Shorts / Stories | 1080×1920, H.264, 30 fps, 10–20 Mbps, AAC 48 kHz |
| Feed 4:5 | 1080×1350 |
| YouTube | 1920×1080 (16–24 Mbps) ou 3840×2160 |
| Master | ProRes 422 HQ |
| Cor | Rec.709 SDR (HDR é removido ou piora no upload) |

## 3. Exportar

**Preferido — Media Encoder (não bloqueia o Premiere nem a conexão):** script livre curto:

```js
var s = app.project.activeSequence;
var preset = "C:\\Program Files\\Adobe\\Adobe Media Encoder <ano>\\MediaIO\\systempresets\\4E49434B_48323634\\01 - Match Source - High bitrate.epr";
app.encoder.launchEncoder();
app.encoder.encodeSequence(s, "<06_entrega>\\cliente_campanha_reel_9x16_v01.mp4", preset, app.encoder.ENCODE_ENTIRE, 1);
app.encoder.startBatch();
```
(`4E49434B_48323634` = H.264. Liste os `.epr` da pasta para achar outros.) A fila devolve um id;
o arquivo final aparece quando termina (antes disso há arquivos temporários `.m4v`/`.aac` na pasta).

**Direto:** `pr_export_frame_or_sequence` mode sequence com `presetPath` — bloqueia o Premiere
durante o render; use só para peças curtas.

## 4. Conferir o arquivo

- Existe, com a duração da sequência, 1080×1920, 30 fps (`ffprobe` ou propriedades do arquivo).
- Assistir inteiro uma vez; tira de quadros a cada 3–4 s para a folha de contato.
- Prévia leve para aprovação: 540 px de largura, H.264 CRF 26.

## 5. Nomes

`cliente_campanha_peca_formato_v01.mp4` em `06_entrega/`. A versão sobe a cada rodada.

## 6. Erros comuns

- Dois looks somados (Lightroom + Lumetri).
- Exportar em HDR/Rec.2020 para rede.
- Render direto de peça longa travando o Premiere (e a conexão do agente).
- Declarar entregue sem o arquivo final existir.

## 7. Portão

```
[ ] Cor igual entre planos; pele plausível; Rec.709
[ ] Arquivo final existe, duração e formato certos
[ ] Assistido do início ao fim
[ ] Nome no padrão, em 06_entrega
```
