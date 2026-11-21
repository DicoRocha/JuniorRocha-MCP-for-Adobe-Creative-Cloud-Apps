---
name: roteiro-storyboard
description: Storyboard em beat sheet para motion e vídeo de produto — três conceitos que diferem na ideia, metáfora visual aprovada em uma frase, e para cada momento o que se move, o que fica parado e o que passa para o próximo; quadros-chave estáticos antes de animar. Use antes de After Effects ou de gerar vídeo por IA.
---

# roteiro-storyboard — beat sheet e quadros-chave

Base: `docs/conhecimento/10` §4–5, `04`. Depois: `motion-direcao-de-arte`, `motion-*`,
`prompt-video`.

## 1. Três conceitos (ideia, não estilo)

Para o mesmo pedido, três ideias centrais diferentes, cada uma em 2 linhas:
`nome · a ideia em uma frase · a imagem mais forte`. A pessoa escolhe uma antes do detalhe.

## 2. Metáfora visual

Frase abstrata do roteiro → objeto ou cena concreta ("organizar o caos" → peças soltas que
encaixam numa grade). Aprovar a metáfora **em uma frase** antes de desenhar ou gerar.

## 3. Beat sheet

| Tempo | Momento | O que se move | O que fica parado | O que passa adiante |
|---|---|---|---|---|
| 0,0–1,2 | Abertura | Linha cresce da esquerda | Fundo, logo apagado | A linha |
| 1,2–2,8 | Título | Letras sobem por palavra | Linha (vira sublinhado) | Sublinhado |

Regras:
- Durações variadas (curto ao lado de longo); pausas de 0,3–0,6 s para leitura.
- Em cada mudança de seção **algo sobrevive e se transforma**; se nada passa, é troca de slide.
- Texto na tela: tempo mínimo de leitura ≈ 0,3 s por palavra + 0,5 s.
- Uma ação principal por momento; o olhar sabe para onde ir.

## 4. Quadros-chave

Desenhe 3–6 quadros parados (início, meio, fim de cada seção) no Photoshop/Illustrator ou
como comp no After Effects (`ae_create_composition` + `ae_get_comp_frame_preview`).
Aprovar os quadros antes de animar: animação não salva layout fraco.

## 5. Especificação

Formato (1080×1920 / 1080×1350 / 1920×1080), fps (30; 25 para Europa/TV), duração, paleta e
tipos do kit, som (trilha/SFX — decidido na pós).

## 6. Saída

`03_motion/storyboard.md` (conceitos, metáfora, beat sheet) + quadros em `03_motion/frames/`.

## 7. Portão de saída

```
[ ] 3 conceitos com ideias diferentes; um escolhido
[ ] Metáfora aprovada em uma frase
[ ] Beat sheet com o que move / para / passa adiante em cada momento
[ ] Tempo de leitura respeitado
[ ] Quadros-chave aprovados antes de animar
```
