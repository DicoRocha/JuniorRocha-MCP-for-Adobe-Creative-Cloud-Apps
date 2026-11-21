---
name: motion-tipografia-cinetica
description: Animar texto no After Effects como atuação — frase com ritmo de fala, revelação por palavra/linha com range selector, legendas animadas palavra a palavra, ênfase em palavra-chave e tempo de leitura — para reels, abertura, citação e anúncio. Use quando o texto é o protagonista do vídeo.
---

# motion-tipografia-cinetica — o texto atua

Base: `docs/conhecimento/04`. Antes: `motion-direcao-de-arte`, `motion-fundamentos`,
`roteiro-storyboard`. App: `app-after-effects`.

## 1. Princípios

- O texto segue a **fala** (ou o ritmo da trilha): uma ideia por vez, ênfase na palavra que importa.
- Tempo de leitura: ≥ 0,3 s por palavra + 0,5 s parado depois de completo.
- Uma animação de entrada para a série inteira; a exceção é a palavra de ênfase (escala, cor, peso).
- Saídas mais rápidas que entradas (≈ 60 %); sem quicar, girar ou piscar sem motivo.

## 2. Montagem

1. Comp no formato final (`ae_create_composition` 1080×1920, 30 fps), projeto 16 bpc
   (`ae_manage_project` settings) se houver degradê.
2. Texto: `ae_create_layer` text com fonte PostScript (`ps_list_fonts` no Photoshop lista os
   nomes) e alinhamento definido (o texto nasce alinhado à esquerda no ponto).
3. Revelação: `ae_add_text_animator` — `properties: { opacity: 0, position: [0, 40], blur: [8, 8] }`,
   `selector: { basedOn: "words", shape: "rampUp", easeLow: 60 }`,
   `animate: { property: "offset", from: -100, to: 100, duration, startTime }`.
   Presets prontos: `ae_list_presets` search "fade up" / "typewriter" → `ae_apply_preset` com `time`.
4. Ênfase: segundo animador com range só na palavra (start/end do selector) para escala 110 % e cor de acento.
5. Movimento de câmera leve na comp (escala 100 → 104 % em toda a frase) dá vida sem distrair.
6. Motion blur nas camadas que se movem (`ae_modify_layer` motionBlur).

## 3. Legenda animada (palavra a palavra)

- A partir do SRT (`media_build_captions`, `maxLines: 1`, `maxChars` 16–20) gere uma camada
  por bloco ou um texto com chaves de Source Text em HOLD (script curto, ≤ 20 blocos por chamada).
- Caixa que acompanha o texto: forma com expressão `sourceRectAtTime` (ver `app-after-effects`).
- Palavra falada em destaque: animador de cor com range que avança pelo tempo das palavras.
- Para Premiere: exporte o estilo como `.mogrt` (`ae_export_mogrt`) e use `pr_captions_as_mogrt` (um por bloco
  do SRT) ou `pr_insert_mogrt` (peça única).

## 4. Conferir

`ae_get_comp_frame_preview` no meio de cada palavra-chave e 0,5 s depois de cada frase completa:
lê? está dentro da zona segura (9:16: 250 px topo, 400 px base)? Render pelo Media Encoder
(`ae_render_queue` queueInAME) só ao final.

## 5. Portão de saída

```
[ ] Ritmo segue a fala/trilha; uma ideia por vez
[ ] Tempo de leitura ≥ 0,3 s/palavra + 0,5 s
[ ] Uma entrada para a série; ênfase só na palavra-chave
[ ] Dentro da zona segura; motion blur no que se move
[ ] Script curto por chamada; projeto salvo antes do render
```

## 6. Cardápio de tratamentos (18/11/2026, da análise do lyric video)

Para abertura, citação, anúncio e título de reels. Um tratamento por frase; detalhes de montagem e de
sincronia com música em `motion-lyric-video`. Expressões de chegada em `motion-fundamentos`.

| Tratamento | Serve para |
|---|---|
| Escada com extrusão | abertura de 3–5 palavras; palavra final que vira monumento |
| Anel ou torre giratória | bloco com muito texto; cada palavra vem à frente no seu tempo |
| Fontes misturadas em etiquetas | frase curta de atitude; palavra longa montada letra a letra |
| Manuscrito com a câmera seguindo a ponta | frase íntima, momento calmo, assinatura |
| Palavra repetida enchendo o espaço | bordão, eco, multidão; a última engole a tela |
| Título de pôster que estilhaça | nome da peça, virada, final |
| Letreiro / corredor de texto | lista, créditos, segundo bloco longo |
| Contorno que vira preenchimento | fala ou canto acompanhado palavra a palavra (`ae_word_captions`) |
| Texto preenchido com imagem ou vídeo | palavra-herói em fonte pesada; a imagem se move dentro das letras |

Gramática para combinar: excesso de 8–15 % com 3–6° de rotação que assenta; esticar e achatar; entrada por
letra em subdivisões da batida; espaçamento que abre ou fecha; revelação por fenda; cópias em eco; troca de
contorno e preenchimento; contraste de escala (palavra mínima ao lado de uma enorme); repetição como ritmo.
Texto preenchido com imagem pede traço grosso e contraste: contorno ou véu atrás quando a imagem clareia.
