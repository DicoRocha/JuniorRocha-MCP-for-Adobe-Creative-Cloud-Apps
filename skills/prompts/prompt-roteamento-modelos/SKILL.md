---
name: prompt-roteamento-modelos
description: Decidir qual IA usar para cada trabalho (IA nativa do Photoshop/Lightroom/Premiere, Higgsfield, Magnific), aplicar os três portões (ideia → imagem → vídeo) e a estratégia de créditos. Use antes de escrever qualquer prompt para IA externa.
---

# prompt-roteamento-modelos — a ferramenta certa, no portão certo

Base: `docs/conhecimento/09` (Higgsfield Playbook) e `10` Parte 2. O MCP não gera imagem
nem vídeo: esta skill escolhe onde gerar e como trazer de volta (`pipeline-ia-externa`).

## 1. Primeiro: dá para fazer sem gerar?

Foto real tratada (`foto-*`), vetor (`vetor-*`), composição no Photoshop ou motion no After
Effects costumam ser mais rápidos, baratos e controláveis. Gere só o que não existe.

## 2. Qual ferramenta

| Trabalho | Onde |
|---|---|
| Estender fundo, remover objeto, preencher área | Photoshop: Preenchimento/Expansão Generativa (pela pessoa no app), Remover |
| Selecionar sujeito, céu, fundo | `ps_selection_and_masks` (selectSubject / selectSky) |
| Ruído, máscaras de pessoa/céu | Lightroom: Denoise e máscaras de IA (no app) |
| Reenquadrar vídeo, limpar voz, transcrever | Premiere: Auto Reframe, Enhance Speech; transcrição: `media_transcribe` |
| Personagem novo (rosto, variedade) | Higgsfield — Soul Cinema |
| Editar imagem existente, fundir referências, props, sheet final | Higgsfield — GPT Image 2 / Nano Banana Pro |
| Locação | Higgsfield — Cinematic Locations |
| Vídeo | Higgsfield — Seedance 2.x (4K só no take final e em rosto próximo) |
| Upscale / detalhe | Magnific (não regenerar em alta) |

A lista de modelos muda: confira a disponível no momento antes de prometer um modelo.

## 3. Três portões

1. **Ideia** aprovada em texto (conceito, metáfora, roteiro) — `plan-conceito-criativo`,
   `roteiro-storyboard`.
2. **Imagem parada** aprovada (keyframe, sheet, arte) — `prompt-imagem`, `prompt-asset-sheets`.
3. **Vídeo**: rascunho de movimento primeiro, resolução final depois — `prompt-video`.

Nunca gere vídeo de imagem não aprovada (o defeito se multiplica).

## 4. Créditos

- Itere barato (resolução padrão), finalize caro (upscale só do aprovado, no Magnific).
- **Uma variável por iteração.** Três falhas seguidas: pare e use `prompt-diagnostico`.
- Planos que precisam de consistência entre si: na mesma geração (até ~30 s no Seedance 2.5).
- Reaproveite: variações de figurino por edição da sheet; último quadro como referência da cena seguinte.
- Confira o saldo antes de rajadas e informe a pessoa do custo estimado.

## 5. Registro

Em `00_briefing/prompts.md`: data · ferramenta/modelo · prompt · referências · resultado
(aprovado/reprovado e por quê) · custo. Sem registro não há como repetir.

## 6. Portão de saída

```
[ ] Confirmado que gerar é melhor que fotografar/compor/animar
[ ] Ferramenta escolhida pela tabela
[ ] Portão anterior aprovado antes de avançar
[ ] Custo estimado informado; uma variável por iteração
[ ] Registro em prompts.md
```
