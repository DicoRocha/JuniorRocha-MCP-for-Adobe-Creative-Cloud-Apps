---
name: prompt-video
description: Escrever prompt de vídeo para IA (Seedance e similares) — estrutura no topo (planos, duração, proporção), câmera pelo nome da técnica, ação com alvo físico, áudio só diegético, continuidade entre cenas e agrupamento de planos consistentes. Use depois que imagem/sheets estão aprovadas.
---

# prompt-video — direção, não desejo

Base: `docs/conhecimento/09` §3–4 e `10` §10. Antes: `prompt-asset-sheets`, keyframes
aprovados (`prompt-imagem`). Depois: `pipeline-ia-externa` (reimportar no Premiere).

## 1. Cabeçalho (sempre no topo)

```
SHOTS: 3 · TOTAL: 15 s · ASPECT: 9:16 · RESOLUTION: draft
REFERENCES: @char_ana (face and identity only), @loc_clinic, @prop_aligner
```

## 2. Cada plano

```
SHOT 1 (0–5 s) · CAMERA: handheld documentary, 1–2 cm sway, 35 mm, 3/4 angle, slow push-in
ACTION: Ana lifts the clear aligner to eye level and turns it toward HER sister, smiling.
EYELINE: she looks at her sister; nobody looks into the lens.
LIGHT/MOOD: soft window light from left, warm afternoon.
AUDIO: room tone, plastic case click.
```

## 3. Regras

- **Câmera pelo nome da técnica** (handheld documentary, super-tele lateral, rack focus,
  whip-pan ≥ 0,8 s, dutch angle) e com motivo. Plano travado frontal = banco de imagem.
- **Toda fala/olhar tem alvo físico** em cena ("diz a ELE, olhando o chão").
- **Áudio só diegético** (passos, ambiente, falas, objetos). **Música nunca** — trilha é da pós.
- **Sem negativos:** descreva o que deve acontecer.
- Detalhes críticos (cor, logo, número) repetidos em palavras + bloco POSITIVE LOCKS.
- Contato físico: peso, apoio, sombra de contato (evita objeto flutuando).

## 4. Consistência

- Planos com mesma locação e mesma versão do personagem: **mesma geração** (até ~30 s), corte na pós.
- Continuidade entre cenas: último quadro da anterior como referência; mesma direção de tela,
  eixo de 180°, luz, figurino e estado dos objetos; atmosfera muda em degraus.
- Clímax em um take só.

## 5. Rascunho → final

Rascunho em resolução baixa para aprovar movimento e ação; 4K só no take aprovado e em rosto
próximo. Falhou 3 vezes: `prompt-diagnostico` (geralmente a imagem de entrada).

## 6. Portão de saída

```
[ ] Cabeçalho com planos, duração, proporção e referências
[ ] Cada plano: câmera nomeada, ação com alvo, olhar, luz, áudio diegético
[ ] Nenhuma música e nenhum negativo no prompt
[ ] Planos consistentes agrupados; continuidade definida
[ ] Rascunho aprovado antes do final; registro em prompts.md
```
