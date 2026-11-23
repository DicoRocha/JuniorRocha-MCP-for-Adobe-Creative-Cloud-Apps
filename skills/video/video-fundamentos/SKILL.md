---
name: video-fundamentos
description: Regras básicas obrigatórias para qualquer edição no Premiere Pro (e entrega de vídeo do After Effects) — proteger o projeto do usuário (sequência duplicada, nunca salvar sem pedir), cortes sem micro-cortes, conferir quadros e áudio, -14 LUFS para redes, exportar pelo Media Encoder e conferir o arquivo. Carregue antes de video-fala-limpa, video-reels, video-legendas-e-som, video-cor-e-export, video-anuncio, video-ugc e video-vsl.
---

# video-fundamentos — a base de toda edição

As skills de área (`video-fala-limpa`, `video-reels`, `video-legendas-e-som`, `video-cor-e-export`,
`video-anuncio`, `video-ugc`, `video-vsl`) partem daqui.

## 1. Proteger o trabalho do usuário

- Trabalhe numa **sequência duplicada** com nome novo (`V2 reels`); nunca na sequência que ele editou.
- **Não salve nem feche o projeto do usuário** sem ele pedir. Feche só o que você criou, pelo nome exato.
- Ajuste que ele fez à mão (cor, Color Mode, áudio limpo) é a referência: **use os ajustes dele**, não
  troque por um look seu. Para levar a cor dele adiante, aninhe a sequência dele.
- Não apague mídia; o que sobrar vai para uma pasta `_to_delete`.

## 2. Cortes

- Corte em frase inteira: pegue o trecho todo, não só a palavra. Evite micro-cortes de menos de 0,3 s.
- Palavra comida ou tropeço: troque por outra tomada **do trecho inteiro**, não remende a palavra.
- Depois de cortar, feche as lacunas e confira que não sobrou um quadro vazio entre clipes.
- Áudio da fala: transição curta (2–3 quadros, `Constant Power`) em cada corte para não estalar.

## 3. Conferir (sempre, antes de dizer que está pronto)

- Quadros: exporte 3–6 quadros nos pontos de corte e nos títulos (`pr_export_frame_or_sequence` frame).
- Áudio: `media_analyze_audio` (loudness); redes sociais **-14 LUFS, pico -1,5 dBTP**:
  `media_normalize_loudness` no arquivo final (gera arquivo novo, original fica).
- Transcreva o corte final (`media_transcribe`) e leia: palavra cortada aparece na transcrição.

## 4. Exportar

- Pelo Media Encoder (`queueInAME: true`): o Premiere fica livre. O retorno traz `renderJobId`:
  `media_job_status` até o arquivo parar de crescer. Se a exportação direta falhar, o MCP passa sozinho
  para o Media Encoder.
- Preset: `Match Source - High bitrate` (H.264). Vertical 1080×1920, 30 fps para Reels.
- Confira o arquivo: duração, tamanho, áudio presente (nem mudo, nem duplicado).

## 5. Organização

Bins e trilhas por função (V1 vídeo, V2 cobertura, V3 gráficos; A1 voz, A2 trilha). Detalhes em
`craft-organizacao-camadas`.

## 6. Portão

```
[ ] Sequência duplicada; projeto do usuário não salvo nem fechado por mim
[ ] Sem micro-cortes, sem lacunas, sem palavra comida (transcrição lida)
[ ] Ajustes do usuário mantidos (cor, áudio)
[ ] -14 LUFS / -1,5 dBTP medidos no arquivo final
[ ] Arquivo final conferido (duração, quadros, áudio)
```
