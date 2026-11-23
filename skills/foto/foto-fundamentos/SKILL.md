---
name: foto-fundamentos
description: Regras básicas obrigatórias para qualquer trabalho com foto no Lightroom Classic ou no Photoshop — proteger o original (snapshot, cópia virtual, cópia do arquivo), medir antes de mexer, ciclo técnico → tom → cor → look, conferir lote, saída. Carregue antes de foto-revelacao, foto-retrato, foto-produto, foto-triagem-e-lote, foto-recorte-e-composicao e foto-saida.
---

# foto-fundamentos — a base de todo tratamento

Vale para Lightroom e Photoshop. As skills de área (`foto-revelacao`, `foto-retrato`, `foto-produto`,
`foto-triagem-e-lote`, `foto-recorte-e-composicao`, `foto-saida`) partem daqui.

## 1. Proteger antes de mexer (sem exceção)

- **Lightroom:** `lr_create_snapshot` (ou `jradb_checkpoint` app lightroom) antes da primeira mudança;
  para variações (P&B, look forte) trabalhe numa **cópia virtual**. Nunca altere uma foto sem snapshot.
- **Photoshop:** trabalhe numa cópia do arquivo ou em camadas novas; ajustes como **camada de ajuste**,
  retoque em camada vazia, filtro em **objeto inteligente**. Nada destrutivo na camada da foto.
- Nunca sobrescreva o arquivo original nem salve o documento do usuário sem ele pedir.
- Preset recebido do usuário é base de estudo: não redistribua o arquivo.

## 2. Medir antes de achar

1. Leia o que já existe: `lr_get_develop_settings` (a foto pode já ter tratamento) ou `ps_get_layer_tree`.
2. Meça: `lr_photo_stats` (histograma, realces e sombras cortados, média, `warmth`) antes e depois.
3. Olhe: prévia antes e depois de cada bloco (`lr_get_photo_preview`, `ps_get_canvas_snapshot`).
4. Limites: realces estourados ≤ 0,5 %, sombras esmagadas ≤ 1 % (salvo look de propósito); pele nunca
   laranja ou magenta; neutros (parede branca, camiseta cinza) neutros.

## 3. Ordem do tratamento (um bloco por vez)

| Passo | O quê | Onde detalhar |
|---|---|---|
| 1. Técnico | perfil de lente, aberração, alinhamento, corte, balanço de branco | `foto-revelacao` §2 |
| 2. Tom | exposição, realces/sombras, brancos/pretos, curva | `foto-revelacao` §2 |
| 3. Cor | vibração antes de saturação, HSL por faixa, pele | `foto-retrato` |
| 4. Local | máscaras (céu, pessoa, fundo), dodge & burn | `foto-revelacao`, `foto-retrato` |
| 5. Look | color grade, vinheta, grão — só depois de a foto estar correta | `foto-revelacao` §3 |
| 6. Detalhe e saída | nitidez, ruído, exportação por destino | `foto-saida` |

Nunca 30 controles de uma vez, nunca um controle no máximo. Look pedido precisa **aparecer**: compare
as medidas antes e depois e diga o que mudou em números.

## 4. Lote

- Separe por grupo de luz; trate a foto-mãe de cada grupo; sincronize só os blocos que valem para todas
  (técnico e look, não exposição e corte).
- Depois de sincronizar, confira **todas** com folha de contato (`jradb_contact_sheet`) e `lr_photo_stats`:
  média de luminância e `warmth` parecidas entre as fotos da série.

## 5. Portão

```
[ ] Snapshot / cópia virtual / cópia do arquivo antes da primeira mudança
[ ] Medido antes e depois (stats + prévia); limites de corte respeitados
[ ] Ordem técnico → tom → cor → local → look → detalhe
[ ] Lote conferido foto a foto (folha de contato)
[ ] Original intacto; saída no formato do destino (foto-saida)
```
