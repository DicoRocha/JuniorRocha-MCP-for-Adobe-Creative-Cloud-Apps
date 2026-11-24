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

## 3b. Passo local: máscaras com âncora nas zonas

Depois do tonal global e antes do look (skill `foto-zonas` para medir):
1. Meça: `media_zone_report` na prévia. Decida o que cada área precisa em zonas ("céu em VII", "rosto em VI").
2. `lr_masks`: céu (`sky`) → Realces −10 a −30 e Temperatura −3 a −8 se o céu passou de VIII; pessoa
   (`people`/`subject`) → Exposição +0,1 a +0,4 se o rosto ficou abaixo da zona dele; fundo
   (`background`) → Exposição −0,1 a −0,4 para separar o assunto. Uma máscara por chamada.
3. Meça de novo. Máscara que mexe mais que ½ zona é exagero (borda aparece).

## 3c. Ruído por ISO

`lr_find_photos` traz `iso`. Ponto de partida (arquivo atual, sem a IA de ruído):

| ISO | LuminanceSmoothing | ColorNoiseReduction | Nitidez |
|---|---|---|---|
| ≤ 400 | 0–5 | 25 (padrão) | 30–40 |
| 800–1600 | 10–20 | 25–30 | 25–35, máscara 50+ |
| 3200–6400 | 25–35 | 30–40 | 20–30, máscara 60+ |
| ≥ 12800 | 40–50 (ou Denoise IA pela pessoa no app) | 40–50 | ≤ 20 |

Pele com ruído alto: suavizar mais na máscara da pessoa, não no global. Celular: trate como ISO × 2.

## 3d. Looks de referência (esportivo, P&B papel antigo, P&B vintage)

Faixas próprias no processo atual; aplique e meça. Para um preset antigo de arquivo use
`lr_read_legacy_preset` (traduz o processo 2010 e aplica com `intensity` 0,5–0,7, snapshot antes).

| Look | Faixas |
|---|---|
| Esportivo dramático (cor apagada) | Exposição −0,2 a −0,4 · Contraste +35 a +55 · Sombras +25 a +40 · Pretos −15 a −25 · Claridade +30 a +50 (fora da pele) · Saturação −30 a −45 com Vibração +10 a +16 · HSL laranja/vermelho/amarelo luminância −10 a −18 · tom dividido sombras 230–235 / 8–11, realces 50–55 / 4–6 · vinheta −20 a −30 |
| P&B papel antigo (sépia clara) | P&B · mistura vermelho +15, laranja −15, amarelo −20, verde −25, azul +10 · realces sépia (matiz 50–55, sat 40–60) e sombras frias leves (230 / 8) · vinheta **clara** +25 a +40 · grão 40–60, tamanho 50–70, aspereza 60–75 · curva de contraste médio |
| P&B vintage escuro | P&B · Exposição −0,3 a −0,6 · Contraste +30 a +40 · Sombras +30 · mistura amarelo +30, verde −20, aqua −20 · sombras sépia (35 / 40–60), realces 60 / 15 · vinheta −40 a −60 (ponto médio 20–30) · grão 45–60, aspereza 70–85 |

Valores antigos eram para arquivos de 10 MP: nitidez com raio 3 e claridade +80–100 viram halo hoje.

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
