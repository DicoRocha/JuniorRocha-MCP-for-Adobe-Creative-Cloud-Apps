---
name: prompt-musica-voz
description: Escrever o briefing de trilha sonora, locução e efeitos sonoros para IA ou para um músico/locutor — função editorial de cada trecho, energia, andamento, instrumentos, tom de voz, pronúncia e marcações de tempo. Use quando o vídeo precisar de música, narração ou sound design.
---

# prompt-musica-voz — o som serve à edição

Base: `prompt-roteamento-modelos`. Mixagem e ducking: `video-legendas-e-som`.

## 1. Comece pela função, não pelo gênero

Para cada trecho do roteiro escreva o que o som precisa **fazer**:

| Trecho | Função | Energia (1–5) |
|---|---|---|
| 0–3 s gancho | prender, criar curiosidade | 4 |
| 3–20 s explicação | ficar por baixo da voz, sem melodia competindo | 2 |
| 20–25 s virada | subir, marcar a mudança | 4 |
| 25–30 s CTA | resolver, final limpo | 3 |

## 2. Briefing de trilha

- Andamento em BPM (calmo 70–90, médio 90–110, energético 120–128) e duração exata em segundos.
- 2–4 instrumentos ("piano felt, baixo sintetizado suave, pratos com escovinha"); sem vocal se houver locução.
- Estrutura com tempos: "intro 0–3 s, base 3–20 s, subida 20–25 s, final com corte seco em 30 s".
- Evite pedir "no estilo do artista X": descreva timbre e clima. Confira a licença de uso comercial.

## 3. Briefing de locução

- Texto final com pausas marcadas `/` (curta) e `//` (longa); palavras difíceis com pronúncia
  ("Levatio = le-VA-tsio"); números por extenso como devem ser ditos.
- Tom em 3 adjetivos + 1 proibido ("calmo, próximo, seguro; nunca vendedor").
- Velocidade: 140–160 palavras/min para anúncio, 120–140 para institucional.
- Entregar WAV 48 kHz, voz seca (sem música), um arquivo por bloco.

## 4. Efeitos sonoros (SFX)

Lista com tempo e intensidade: "0,0 s whoosh curto, entrada do título; 2,4 s clique suave, botão;
12,0 s ambiente de clínica baixo, contínuo". No máximo 1 efeito a cada 2–3 s; efeito que não reforça
imagem sai.

## 5. Montagem

1. `pr_import_media` da trilha, voz e efeitos; voz na trilha A1, música A2, efeitos A3.
2. Ducking da música sob a voz: `pr_duck_music`; ajustes finos com `pr_audio_keyframes`.
3. Medir: `media_analyze_audio` (alvo −14 LUFS integrados para redes, picos ≤ −1 dBTP);
   `pr_audit_timeline` antes de exportar.

## 6. Portão de saída

```
[ ] Função e energia por trecho definidas antes do gênero
[ ] Trilha com BPM, duração, instrumentos e estrutura em segundos; licença confirmada
[ ] Locução com pausas, pronúncias e tom; WAV seco por bloco
[ ] SFX com tempo; nenhum efeito sem imagem correspondente
[ ] Mix medida: voz clara, −14 LUFS, picos ≤ −1 dBTP
```
