---
name: foto-triagem-e-lote
description: Triagem e tratamento em lote no Lightroom Classic — encontrar as fotos, selecionar (estrela, bandeira, rótulo), separar por grupo de luz, tratar uma foto representativa, sincronizar o look para o grupo, revisar e organizar em coleção. Use para "trate essas fotos", sessões, eventos, ou antes de escolher fotos para uma campanha.
---

# foto-triagem-e-lote — selecionar e sincronizar

Depois desta skill: `foto-revelacao` (a foto-mãe) e `foto-saida` (exportar).

## 1. Antes (portão de entrada)

- `jradb_get_status` → ponte do Lightroom conectada.
- `lr_get_catalog_info`: catálogo, módulo atual e **o que está selecionado**. Sem `ids`, as
  ferramentas agem na seleção — ou no filme inteiro quando nada está selecionado. Confira antes.
- Nunca mover, renomear ou apagar originais sem pedido.

## 2. Encontrar

`lr_find_photos` com `source`: selection · folder (`folderPath`) · collection · all, e filtros
(`filenameContains`, `keyword`, `minRating`, `pick`, `label`). Guarde os `id`.

## 3. Selecionar

1. Olhar candidatas: `lr_get_photo_preview` (size 400–600) — várias por chamada em paralelo.
2. Marcar: `lr_set_metadata` (`rating`, `pick: "picked" | "rejected"`, `label`, `addKeywords`).
3. Juntar: `lr_collections` create + add (ex. "Kampagne <nome>").

Critérios (nesta ordem): foco no olho/produto · expressão/gesto · composição com espaço para
texto (se for para anúncio) · luz · duplicatas (fica uma).

## 4. Grupos de luz

Separe as fotos em grupos com a mesma luz (mesma sala, hora, câmera). Cada grupo recebe **uma
foto representativa** tratada por `foto-revelacao`. Fotos de luz diferente **não** recebem a
mesma exposição e balanço de branco.

### Atalho: o grupo inteiro em uma chamada

Com a foto de referência aprovada, `lr_recipe_batch_develop` (`fromId` + `ids` do grupo de luz) faz as
seções 5 a 7 de uma vez: snapshot "MCP antes do lote" em todas, copia o look **sem** recorte, rotação,
remoção de manchas, máscaras e Upright (`whiteBalance: false` para luz mista), mede cada foto revelada e
ajusta a exposição para a mediana da referência (duas passadas, até ±1,5 EV) e devolve o relatório
antes/depois (mediana, altas estouradas, sombras empastadas, cor mais quente/fria) com uma folha da série.
`exportFolder` exporta o grupo pronto. Um grupo de luz por vez; volte uma foto pelo snapshot se precisar.

## 5. Proteger antes de mexer

- `lr_create_snapshot` com nome "antes <campanha>" em **todas** as fotos do lote.
- Para versões alternativas: cópia virtual. Por script livre (`lr_execute_lua`), o SDK recente
  tem `catalog:createVirtualCopies(nome)` sobre as fotos selecionadas (selecione antes com
  `lr_select_photos`); se não existir na versão, peça à pessoa Ctrl+' ou use snapshot.
- Nunca testar em foto que não é do trabalho: use cópia virtual ou foto de teste.

## 6. Sincronizar o look

`lr_copy_develop_settings` com `fromId` = foto-mãe, `ids` = grupo, `keys` só do look:

| Copiar | Não copiar (varia por foto) |
|---|---|
| Contrast, Highlights, Shadows, Whites, Blacks, Parametric*, Texture, Clarity, Dehaze, Vibrance, Saturation, HSL, ColorGrade*/SplitToning*, PostCropVignette*, Grain*, Sharpen* | Exposure2012, WhiteBalance, Temperature, Tint, Crop*, máscaras locais |

Ajuste exposição/balanço foto a foto depois, com `lr_apply_develop_settings` pequeno.

## 7. Revisar

- `lr_get_photo_preview` em 1 de cada 5 fotos (todas, se forem até 10).
- Pele plausível, nada estourado, mesmo look.
- Metadados de entrega: `lr_set_metadata` (título, legenda, copyright) se pedido.

## 8. Erros comuns

- Agir na seleção errada (o usuário tinha outra foto selecionada).
- Copiar balanço de branco entre luzes diferentes.
- Aplicar no catálogo do cliente um teste sem snapshot.
- Copiar ajustes com `keys` vazio (copia tudo, inclusive recorte).

## 9. Portão

```
[ ] Snapshot "antes" em todas as fotos do lote
[ ] Seleção marcada (estrela/bandeira) e em coleção
[ ] Uma foto-mãe por grupo de luz, aprovada por prévia
[ ] Look sincronizado só com chaves de look; revisão 1 em 5
```

## Regras de 18/11/2026

- Sincronizar ajuste não equilibra a luz: medir fundo e pele de cada foto e corrigir exposição por
  foto (`foto-retrato`). Snapshot antes.
- `lr_import_photos`: caminhos com barra invertida.
