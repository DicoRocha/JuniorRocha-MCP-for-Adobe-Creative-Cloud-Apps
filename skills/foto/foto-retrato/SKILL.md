---
name: foto-retrato
description: Tratar retrato (pessoa, equipe, profissional de saúde, depoimento) no Lightroom e no Photoshop — balanço de cor da pele, exposição do rosto, olhos, limpeza leve, dodge & burn sutil — sem plastificar nem alterar feições. Use para fotos de pessoas que vão para post, site, anúncio ou impresso.
---

# foto-retrato — pele real, rosto vivo

Base: `docs/conhecimento/03`. Antes: `foto-triagem-e-lote`. Revelação geral: `foto-revelacao`.

## 1. Lightroom (global)

1. Snapshot antes: `lr_create_snapshot` (ou cópia virtual: `lr_execute_lua` com
   `catalog:createVirtualCopies("Retrato")` após `lr_select_photos`).
2. **Pele primeiro:** WB pela pele (R > G > B nos tons médios da bochecha). Ajuste
   `Temperature`/`Tint` (ou `IncrementalTemperature` em JPEG) até a pele sair do verde/magenta.
3. Exposição para o **rosto** (não para o fundo): pele clara em média ~65–75 % de luminância.
4. `Texture` −5 a −15 (suaviza sem apagar poro); **`Clarity2012` ≤ 0** em rosto.
5. HSL: laranja (pele) saturação −5 a −15, luminância +5 a +10; vermelho com cuidado.
6. Vinheta leve (−8 a −15). `lr_get_photo_preview` e compare com o snapshot.

Máscaras de pessoa/olhos/pele do Lightroom não são acessíveis por script: se precisar,
faça no Photoshop (abaixo) ou peça um predefinido com a máscara (`lr_apply_develop_preset`).

## 2. Photoshop (local, não destrutivo)

Abra a exportação (`lr_export_photos` TIFF/PSD 16 bits sem nitidez → `ps_open_document`):
1. **Limpeza**: camada vazia, remover só o temporário (espinha, fio solto, mancha de sujeira).
   Pinta e marca de nascença ficam. Ferramenta de correção é da pessoa no app ou por
   `ps_batch_play` gravado; nunca liquify em rosto/corpo.
2. **Dodge & burn sutil**: duas curvas (`ps_adjustment_layer` curves, +/− 10–15 %) com máscara
   preta e pincel suave a 3–5 % — iguala manchas de luz, não esculpe.
3. **Olhos**: curva +5 % só na íris e brilho dos olhos; branco dos olhos nunca branco puro.
4. **Cor final**: `ps_adjustment_layer` hueSaturation / colorBalance com máscara na pele se preciso.
5. Olhe a 100 % e a 25 % (`ps_get_canvas_snapshot`); compare com o original lado a lado.

## 3. Ética

- Não mudar formato de rosto, corpo, dentes ou idade aparente. Em saúde/estética, retocar
  resultado de tratamento é enganoso — proibido.
- Autorização de uso de imagem da pessoa retratada.

## 4. Saída

PSD com camadas (`ps_save_document` psd) + exportação pela `foto-saida` (sRGB para tela,
CMYK no InDesign para impresso).

## 5. Portão de saída

```
[ ] Pele R > G > B, sem cast; rosto bem exposto
[ ] Clarity ≤ 0 no rosto; poros visíveis a 100 %
[ ] Só imperfeições temporárias removidas; feições intactas
[ ] D&B imperceptível a 25 %; olhos naturais
[ ] Snapshot/cópia virtual existe; autorização de imagem
```

## Regras de 18/11/2026

- **Manchas de pele (corrigido em 18/11/2026):** o Lightroom Classic 16 tem a **Remoção de manchas por IA**
  em Remover > Remoção de distrações > **Manchas**: detecta espinhas, pintas e sardas nos rostos, com os
  controles de intensidade e os pincéis de refino **Remover** (o que a IA não achou) e **Restaurar** (o que
  deve ficar, como uma pinta característica). Em foto de grupo, cada rosto é tratado à parte.
  - Pelo SDK não existe "aplicar manchas" (só há funções para reflexos e pessoas), **mas dá para
    sincronizar**: aplique uma vez na foto de referência — a pessoa clica em Aplicar, ou você opera pelo
    controle do computador — e use `lr_sync_settings_groups` com o grupo `distractionRemovalBlemish` para
    levar ao resto do ensaio. A IA recalcula em cada foto: confira uma a uma.
  - Teste também salvar uma predefinição de revelação que inclua a remoção de manchas e aplicá-la com
    `lr_apply_develop_preset` (se funcionar, fica 100 % automático).
  - Pergunte antes quais marcas ficam (pintas e sinais fazem parte do rosto); use Restaurar nelas.
  - Sem o Lightroom 16: retoque no Photoshop em camada separada.
- **Ensaio equilibrado:** depois de sincronizar o ajuste, meça cada foto exportada (luminosidade do
  fundo e da pele, não a média da imagem — o enquadramento muda a média) e corrija a exposição das
  que saírem do grupo (tolerância ~1,5 L*). Em 18/11, corpo inteiro ficou +6 L* e um close −3 L*
  com o mesmo ajuste.
- **Fundo infinito:** antes de produzir peças, pergunte se quer o fundo preservado ou a pessoa
  recortada. Recorte: Selecionar assunto → máscara → PNG com transparência (2400 px).

## Receitas de retoque no Photoshop (pesquisa de tutoriais, 18/11/2026)

Ordem: **manchas pontuais → tom da pele → luz e volume**, tudo não destrutivo e com parcimônia.
1. Manchas pontuais: recuperação/carimbo numa **camada vazia** acima da foto, com "todas as camadas".
2. Separação de frequência só para uniformizar tom mantendo poros; não use para "alisar".
3. Dodge & burn: duas camadas de **Curvas** (clarear e escurecer) com máscara preta e pincel de fluxo
   baixo; ou camada 50 % cinza em Sobrepor. Clarear onde a luz bate, escurecer sob maçãs e mandíbula.
4. Base como Objeto Inteligente; filtros como filtros inteligentes; cor em camadas de ajuste; Mesclar se
   para limitar um ajuste a luzes ou sombras.
Peça à pessoa quais marcas saem (pintas e sinais fazem parte do rosto).

## Receitas de Lightroom para retrato e ensaio (pesquisa de tutoriais, 18/11/2026)

Ordem do tratamento: **lente e corte → exposição e branco → pele/olhos/dentes por máscara → cor → saída**.
1. **Corte igual na série:** mesma proporção, linha dos olhos na mesma altura e mesma folga acima da
   cabeça em todas as fotos; nunca cortar em articulação (pulso, cotovelo, joelho) — corte no meio do
   segmento ou mostre inteiro.
2. **Exposição e branco** antes de qualquer cor: pele no meio-tom, sem estourar realces (brancos e pretos
   com o aviso de corte ligado).
3. **Máscaras de IA por parte** (`lr_masks` people): pele do rosto, olhos, dentes, cabelo e fundo; dê nome
   a cada máscara. Fundo um pouco mais escuro ou mais frio que a pele separa a pessoa.
4. **Pele:** ajuste contido no laranja (matiz/saturação/luminância) ou Cor pontual; reduzir vermelhidão
   na gradação de cor. Nada de mudança forte em JPEG.
5. **Série:** trate uma foto de referência, sincronize ajustes **e máscaras** nas demais (as máscaras de
   IA são recalculadas em cada foto) e depois confira foto a foto — sincronização automática ligada por
   engano estraga o lote. Por fim, meça fundo e pele (regra do ensaio equilibrado).
6. Julgue o conjunto lado a lado: consistência vale mais que uma foto heroica.

## Dentes brancos e manchas: o que o XMP do usuário mostra (18/11/2026)

Referência: `pesquisa/referencias/JuniorRocha-57_dentes-e-manchas.xmp` (foto tratada à mão pelo usuário).

**Clarear dentes** — máscara de IA de pessoa, parte **Dentes** ("Person 1 - Teeth"), com:
- Saturação **−39** (tira o amarelo) e Temperatura **−7** (um pouco mais frio); mais nada.
- Não clarear com exposição: dente branco demais parece falso. Se precisar, +5 a +10 de exposição no máximo.
- Como aplicar: o SDK cria máscara de pessoa inteira, **não** a parte "Dentes". Use uma predefinição que já
  traga a máscara de dentes — a adaptativa de retrato do Lightroom ("Whiten Teeth"/clarear dentes) ou uma
  salva pela pessoa com esses valores — via `lr_apply_develop_preset`; depois ajuste os valores com
  `lr_masks` (adjust) pelo nome da máscara. A IA recalcula a máscara em cada foto.

**Remoção de manchas** — no XMP aparece como um filtro "Blemish Removal" com o **resultado gravado** (área
do rosto e dados em arquivo auxiliar), não como controles numéricos. Por isso não dá para "escrever" a
remoção por parâmetro: só aplicando na interface, por predefinição, ou sincronizando o grupo
`distractionRemovalBlemish` com `lr_sync_settings_groups`.

## Códigos das máscaras de IA no XMP (18/11/2026)

Referência: `pesquisa/referencias/JuniorRocha-8_todas-as-mascaras.xmp` (uma máscara por parte, sem ajuste).
No XMP cada máscara de IA é `crs:What="Mask/Image"` com `crs:MaskSubCategoryID`. Lidos em duas fotos do
usuário (57 e 8); o de dentes foi igual nas duas.

| Parte (MaskName) | MaskSubCategoryID |
|---|---|
| Facial Skin (pele do rosto) | 2 |
| Iris and Pupil (íris e pupila) | 3 |
| Body Skin (pele do corpo) | 4 |
| Hair (cabelo) | 5 |
| Lips (lábios) | 6 |
| Eye Sclera (branco do olho) | 8 |
| Eyebrows (sobrancelhas) | 9 |
| Clothes (roupa) | 11 |
| Teeth (dentes) | 12 |
| Background (fundo) | 22 |

- Códigos 1, 7 e 10 não apareceram nesses arquivos: não usar sem um XMP que os mostre.
- Gerar as predefinições: `lr_build_mask_presets` (`set: "retrato"`, `install: true`); aplicar com `lr_apply_develop_preset`.
- Máscaras de faixa são `Mask/RangeMask`: luminância `Type="2"` (`LumRange`), cor `Type="1"`
  (`PointModels`), profundidade `Type="-1"` (`DepthRange`).
- `ReferencePoint`, `Origin`, `MaskDigest` e `InputDigest` são da foto de origem; numa predefinição a IA
  deve recalcular. Isso ainda não foi testado ao vivo (docs/16, B61).
- O `.acr` ao lado do XMP é binário (o resultado calculado das máscaras); não serve para predefinição.
