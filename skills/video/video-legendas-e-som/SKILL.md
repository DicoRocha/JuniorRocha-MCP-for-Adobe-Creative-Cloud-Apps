---
name: video-legendas-e-som
description: Legendas e áudio de vídeo no Premiere — legenda social (tamanho, palavras por linha, tempo, posição, destaque), trilha sob a voz, ducking, efeitos sonoros, níveis em dB e loudness por plataforma. Use depois de montar qualquer vídeo com fala ou música, e sempre em vídeo para rede social.
---

# video-legendas-e-som — ouvir e ler sem som

Base: `docs/conhecimento/05` §4–5. Antes: `video-fala-limpa` (fala travada).

## 1. Legendas

| Regra | Valor |
|---|---|
| Tamanho (1080×1920) | 48–60 px, sem serifa, negrito |
| Linha | 3–7 palavras, < 30 caracteres; 1–2 linhas |
| Tempo | 1–3 s por bloco (máx. 6 s); aparece **junto com a fala** |
| Contraste | branco com contorno preto 4–6 px ou caixa 60–80% |
| Destaque | 1–2 palavras-chave por bloco na cor de destaque |
| Posição | dentro da zona segura: acima de ~400 px da base, fora dos 250 px do topo; nunca sobre o rosto |
| Quebra | por sentido; nomes e números revisados |

Como fazer (fase 2 — ferramentas tipadas):
1. **Transcrever:** `media_transcribe` (Whisper local; `language: "pt"`; arquivo longo vira job →
   `media_job_status`). Grava `<nome>.transcript.json` e `<nome>.srt` ao lado do vídeo.
2. **Revisar o texto** antes de legendar: leia os segmentos e corrija o que o motor ouviu errado — nomes,
   marcas, termos técnicos ("chat de apt" → "ChatGPT", "encamadas" → "em camadas"). Correções
   repetíveis vão no `glossary`; frases mal ouvidas, reescreva o segmento (passe `segments`).
3. **Montar as legendas:** `media_build_captions` (reels: `maxChars` 24–28, `maxLines` 2, `minDuration` 0.8;
   `keep` = trechos mantidos no corte para re-sincronizar; `offsetSeconds` = início do clipe na timeline).
4. **Levar ao Premiere:** com estilo (fonte, caixa, cor, animação) → `pr_captions_as_mogrt({ filePath:
   Legenda.mogrt, srtPath })`, um clipe por bloco numa trilha de vídeo acima de tudo (o `.mogrt` vem do
   `ae_export_mogrt`). Faixa de legenda nativa (acessível, liga/desliga na plataforma) → `pr_import_captions`;
   o estilo dela só se aplica no app (o script não alcança).
5. Peça sem fala: títulos animados no After Effects (Dynamic Link) ou `.mogrt`.

## 2. Níveis

| Item | Alvo |
|---|---|
| Voz | referência 0 dB, comprimida, à frente |
| Música sob voz | −15 a −20 dB, sem vocal |
| Música sem voz | até −6 dB |
| Ducking | rampas de 200–500 ms |
| Efeitos | whoosh em troca, clique em UI; com parcimônia |

`pr_set_volume` recebe **dB** (0 = sem mudança). Keyframes de volume: `pr_audio_keyframes` (tempos da
**sequência**, dB). Trilha sob a voz: `pr_duck_music` com os trechos de fala na timeline (os `placed` do
`pr_apply_cut_plan`), `baseDb` −6, `duckDb` 12–16, fade in/out e `endSeconds` = fim do vídeo.
Nível da trilha e da voz: `media_analyze_audio` `loudness` (pico, RMS, nível com gate, ruído de fundo).
Corte na batida: `media_analyze_audio` `beats` (BPM e tempos de batida da música).

Ruído de fundo na voz: ver `video-fala-limpa` ("Limpar ruído de fundo"): Enhance Audio do Premiere 27 é
manual (sem API); o MCP aplica "DeNoise"/"Adaptive Noise Reduction" quando precisa ser automático.

## 3. Loudness final

| Plataforma | Alvo |
|---|---|
| TikTok / Instagram | −10 a −12 LUFS |
| YouTube | −14 LUFS |
| TV aberta BR | −23 LUFS (confirmar com a emissora) |
| Pico real | < −1 dBTP |

Medir depois de exportar (ex. `ffmpeg -af loudnorm=print_format=summary` no arquivo) e ajustar o master.

## 4. Trilha

- Escolher pela célula de motion (calmo → sem bateria marcada).
- Cortar na batida real do arquivo; ajustar duração aparando ou repetindo trecho, nunca esticando.
- Fade de saída 1–2 s alinhado ao CTA.
- Licença: só trilha com direito de uso (biblioteca do cliente, Adobe Stock, gerador de terceiros
  com licença). Música gerada por IA vem de terceiros (`docs/conhecimento/09`).

## 5. Sem som (regra de social)

Assista **mudo**: a mensagem tem de passar só por imagem + texto. Se não passa, falta legenda ou texto na tela.

## 6. Erros comuns

- Legenda atrasada em relação à fala.
- Música brigando com a voz (> −15 dB sob fala).
- Vídeo exportado com o áudio de referência da câmera (faixa errada ligada).
- Faixa de áudio vazia no export (AAC de silêncio) quando o vídeo não tem som — normal, mas anotar.

## 7. Portão

```
[ ] Legendas dentro da zona segura, sincronizadas, revisadas
[ ] Voz à frente; música −15 a −20 dB sob a fala; ducking suave
[ ] Loudness no alvo; pico < −1 dBTP
[ ] Assistido mudo e com som
[ ] Trilha licenciada
```

## Regras de 18/11/2026 — legendas

- **Padrão é a legenda criativa**, mesmo sem pedido: 2–4 palavras por vez, **a palavra falada muda de
  cor** (acento da marca) no instante em que é dita; entrada com movimento curto.
- **Tempo real das palavras**, nunca estimado por contagem de caracteres: timestamps por palavra da
  transcrição; sem isso, alinhar pelo áudio (ffmpeg `silencedetect`/energia) dentro de cada trecho, ou
  usar a transcrição do próprio Premiere/After. Se o mapeamento por palavra não fechar, reduza o
  tamanho de cada legenda para trechos medidos.
- Sempre que o Premiere for usado, **gere a faixa de legendas no Premiere** (a partir do SRT) como
  guia de tempo e revisão; ela pode ficar oculta na renderização quando a legenda final vem do After.
- Texto da legenda dentro de pílula: centralizado pela altura da maiúscula (`craft-tipografia` §7).
- Catálogo de estilos, destaques da palavra falada, textos de impacto e blocos de expressão: `motion-legendas-dinamicas`.

## Som com intenção (18/11/2026)

Fonte: skills do projeto aberto HyperFrames (heygen-com/hyperframes, Apache 2.0), adaptado ao nosso fluxo.

- Vídeo com mais de ~15 s que conta algo ganha **trilha e sons nas ações visíveis**, salvo pedido de
  silêncio ou peça feita para tocar muda.
- **O relógio:** com narração, a voz manda — o texto pousa na palavra que o diz. Só música: o resultado e a
  marca caem nos tempos fortes; os cortes seguem o movimento, não a bateria.
- Trilha: a da pessoa primeiro; senão, buscar pelo **clima e andamento**, não pelo assunto. Entrar no
  compasso mais forte (não numa introdução fraca) e terminar num fim de compasso com fade curto.
- Efeitos: poucos e exatos, cada um com causa na tela (clique só em clique real; whoosh só em movimento
  rápido); efeito demais soa a modelo pronto.
