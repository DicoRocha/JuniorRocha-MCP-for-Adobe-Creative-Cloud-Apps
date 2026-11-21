---
name: foto-revelacao
description: Revelar uma foto no Lightroom Classic em ciclo fechado de 6 passos (técnico, tonal, cor, presença, look, detalhe), um bloco por vez, com prévia antes/depois e limites numéricos por controle — inclusive looks pedidos ("mais cinematográfico", "claro e limpo", "quente"). Use para tratar a foto-mãe de um grupo ou qualquer foto isolada.
---

# foto-revelacao — ciclo fechado

Base: `docs/conhecimento/03`. Lote e sincronização: `foto-triagem-e-lote`.

## 1. Regras do ciclo

1. **Snapshot antes** (`lr_create_snapshot` ou `jradb_checkpoint` app lightroom).
2. Leia o estado atual: `lr_get_develop_settings` (a foto pode já ter tratamento — parta dele).
3. **Um bloco por chamada** de `lr_apply_develop_settings`, depois `lr_get_photo_preview` e compare.
4. Nunca 30 controles de uma vez; nunca empurrar um controle ao máximo.

## 2. Os 6 passos

| Passo | Chaves | Limites de bom senso |
|---|---|---|
| 1. Técnico | LensProfileEnable 1, AutoLateralCA 1, CropAngle, WhiteBalance/Temperature/Tint (JPEG: IncrementalTemperature/Tint) | WB pelo neutro da cena |
| 2. Tonal | Exposure2012, depois Highlights2012/Shadows2012, depois Whites2012/Blacks2012 | Exposição ±1 · Realces −20 a −60 · Sombras +10 a +40 |
| 3. Cor | Vibrance antes de Saturation; HSL por faixa | Vibração +5 a +20 · Saturação ≤ +10 |
| 4. Presença | Texture, Clarity2012, Dehaze | Claridade ±15 · pele: Texture levemente negativa, nunca Clarity alta |
| 5. Look | Parametric*, ColorGrade* (ou SplitToning*), PostCropVignette*, Grain* | Vinheta −5 a −26 · Grão 0–15 |
| 6. Detalhe | Sharpness, SharpenRadius, SharpenDetail, SharpenEdgeMasking, LuminanceSmoothing | Nitidez 20–40 com máscara 40–80 |

Curva por pontos: `lr_tone_curve` (S suave = `mediumContrast`; pretos lavados = `fadedBlacks` / `matte`).
Medir em vez de achar: `lr_photo_stats` antes e depois — realces estourados ≤ 0,5 %, sombras esmagadas ≤ 1 %
(salvo look intencional); numa série, luminância média (`mean.luma`) e `warmth` parecidos entre as fotos.

## 3. Looks prontos (ponto de partida)

| Pedido | Receita (ajuste ao arquivo) |
|---|---|
| Cinematográfico contido | Contrast +10–14 · Highlights −40–45 · Whites −12–20 · Blacks −6–12 · Shadows +14 · ParametricShadows +8–10 · Saturation −8 · Vibrance +12 · azul/verde/aqua −10 a −22 · sombras frias (matiz 200, sat 18) e realces quentes (40, 14) · vinheta −18 a −26 · grão 12 · **Clarity 0, Texture 0, Sharpness ≤ 20** |
| Claro e limpo (clínica, saúde) | Exposure +0,1–0,3 · Highlights −20 · Shadows +20 · Whites +5 · Vibrance +10 · leve quente · sem vinheta forte · pretos não esmagados |
| Quente editorial | Temperatura +5–10% · laranja lum +5 · ColorGrade médios matiz 35–45 sat 8–12 · Contrast +8 |
| P&B | ConvertToGrayscale true · GrayMixer laranja +10 (pele) · azul −20 (céu) · Contrast +15 |

## 4. Pele e ética

- Pele em RGB: R > G > B. Verde/magenta = balanço errado.
- Não plastificar (manter poros). Não alterar feições, corpo ou resultado de tratamento,
  sobretudo em antes e depois (saúde: regulatório).

## 5. Quando a prévia falha

`lr_get_photo_preview` tenta 3 vezes e cai para uma exportação temporária (`method: "export"`).
Se der `PREVIEW_FAILED`, exporte com `lr_export_photos` numa pasta de QA e olhe o arquivo.

## 6. Erros comuns

- Look aplicado por cima de um tratamento existente sem ler as configurações.
- Clareza alta "para dar presença" em retrato.
- Nitidez de saída somada à nitidez de revelação (o arquivo vai para o Photoshop: exportar sem nitidez).
- Não comparar com o "antes" (o olho se acostuma em 10 segundos).

## 7. Portão

```
[ ] Snapshot "antes" existe
[ ] Cada bloco conferido por prévia
[ ] Pele plausível; nada estourado; pretos com detalhe
[ ] Limites respeitados (clareza, nitidez, saturação)
[ ] Look descrito em 1 linha (para repetir na série)
```
