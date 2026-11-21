---
name: app-lightroom
description: Contrato do Lightroom Classic no MCP — plugin Lua com long-poll, fotos por id, seleção implícita, tudo não destrutivo, chaves de revelação, o que exige lr_execute_lua (LrTasks.pcall, sem getfenv, tabelas sem metatable) e armadilhas (prévia logo após ajuste, foto do usuário alterada em teste). Use ao trabalhar no Lightroom por ferramentas lr_*.
---

# app-lightroom — contrato e decisões

Fluxos: `foto-triagem-e-lote`, `foto-revelacao`, `foto-saida`.

## 1. Contrato

| Item | Regra |
|---|---|
| Ponte | plugin Lua que consulta o hub; sem fallback. Sem conexão → abrir o Lightroom ou `Biblioteca > Extras do plug-in > Iniciar ponte MCP` |
| Fotos | por `id` (localIdentifier) de `lr_find_photos` / `lr_get_catalog_info` |
| Sem `ids` | age na **seleção** — ou no filme inteiro se nada estiver selecionado. Confira antes |
| Escrita | não destrutiva; cada chamada é um passo de histórico (desfazer pelo painel Histórico) |
| Módulo | nenhuma ferramenta troca de módulo, exceto `lr_auto_tone` (vai para Revelação) |

## 2. Qual ferramenta

| Quero | Ferramenta |
|---|---|
| Estado / seleção | `lr_get_catalog_info` |
| Achar | `lr_find_photos` (selection, folder, collection, all + filtros) |
| Ver | `lr_get_photo_preview` (3 tentativas + exportação de reserva; `method` diz qual) |
| Ler ajustes | `lr_get_develop_settings` (com `keys`) |
| Ajustar | `lr_apply_develop_settings` (um bloco por vez) |
| Curva de tons por pontos | `lr_tone_curve` (curvas prontas: mediumContrast, strongContrast, fadedBlacks, matte, softHighlights, liftShadows; ou `points`; `channel` rgb/red/green/blue) |
| Medir (histograma, recortes, percentis, calor) | `lr_photo_stats` (exporta TIFF pequeno e mede; use para igualar uma série e checar estouro) |
| Preset | `lr_list_develop_presets` → `lr_apply_develop_preset` |
| Sincronizar | `lr_copy_develop_settings` (`fromId`, `ids`, `keys` só do look) |
| Ajuste local (rosto mais claro, céu mais escuro, fundo menos saturado) | `lr_masks` create com `maskType: "aiSelection"` + `maskSubtype` subject/sky/background/objects/landscape (para pessoa use **subject**; "people" não sai pelo SDK), ou gradient/radialGradient/rangeMask; `adjustments: { Exposure, Temperature, Clarity… }`; depois `adjust`/`delete`. Só em cópia virtual ou depois de snapshot; máscara de IA leva alguns segundos |
| Lote de um grupo de luz (receita) | `lr_recipe_batch_develop` (snapshot em todas → sincroniza sem recorte/máscaras/Upright → iguala a exposição medindo → relatório antes/depois + folha → exporta) |
| Proteger | `lr_create_snapshot` · `jradb_checkpoint` app lightroom |
| Metadados | `lr_set_metadata` (estrela, bandeira, rótulo, palavras-chave, título, legenda, copyright) |
| Coleções | `lr_collections` (list, create, add, remove, photos) |
| Selecionar | `lr_select_photos` |
| Importar (no lugar) | `lr_import_photos` |
| Exportar | `lr_export_photos` (ids, seleção ou coleção) |

Chaves de revelação: Basic `Exposure2012`, `Contrast2012`, `Highlights2012`, `Shadows2012`,
`Whites2012`, `Blacks2012` · Presença `Texture`, `Clarity2012`, `Dehaze`, `Vibrance`, `Saturation` ·
Curva `ParametricShadows/Darks/Lights/Highlights` · HSL `Hue/Saturation/LuminanceAdjustment<Cor>` ·
Color grading `ColorGrade*` e `SplitToning*` · Detalhe `Sharpness`, `SharpenRadius/Detail/EdgeMasking` ·
Efeitos `PostCropVignette*`, `Grain*` · Recorte `CropLeft/Top/Right/Bottom` (0–1), `CropAngle`.
JPEG/PNG usam `IncrementalTemperature`/`IncrementalTint` em vez de `Temperature`/`Tint`.

## 3. Script livre (`lr_execute_lua`)

- Contexto: `catalog`, `import`, `json`, `write(nome, fn)`, `LrTasks`, `LrApplication`, `LrDevelopController`,
  `LrPathUtils`, `LrFileUtils` (plug-in 1.5.2; antes era preciso `import 'LrTasks'`).
- **Cópia virtual** (caminho seguro para testar looks): `lr_select_photos` → `catalog:createVirtualCopies("Nome")`
  **fora** de `write`; devolve as fotos novas (ids novos).
- Use `LrTasks.pcall` (pcall normal não pode ceder); não há `getfenv/setfenv`.
- Tabela passada a `applyDevelopSettings` **sem metatable** (copie para uma tabela simples).
- Devolva tabelas simples, strings ou números.

## 4. Armadilhas

- **Teste em foto do usuário:** sempre snapshot antes, ou cópia virtual. Em 13/11 um teste alterou a A1_v2 sem snapshot (desfazer pelo Histórico).
- Prévia logo após ajuste pode falhar ("error loading thumb") ou vir **branca em tamanho cheio** (depois de Auto Tone,
  numa cópia virtual aberta no Revelar): a ferramenta detecta e exporta (`fallbackReason`); `method: "export"` força.
- Exportar já com o nome final: `lr_export_photos` `fileNames: ["01_gespraech", …]` na ordem dos ids.
- Preset de estilo (ex. "Style: Cinematic / CN06") é um bom ponto de partida para série: aplique numa foto,
  ajuste, copie para as outras (`lr_copy_develop_settings`) e corrija só exposição/realces por foto.
- Nomes de presets e coleções na língua do usuário.
- `collision: "overwrite"` substitui arquivos: use o padrão `rename`.

## 5. Portão

```
[ ] Seleção/ids conferidos antes de escrever
[ ] Snapshot antes de qualquer lote
[ ] Prévia conferida; exportação no destino certo
```

## Ferramentas de 18/11/2026 (sem teste ao vivo ainda)

- `lr_build_mask_presets`: grava predefinições com máscara de IA de **uma parte** da pessoa (dentes, pele do rosto,
  íris, branco do olho, lábios, cabelo, sobrancelhas, pele do corpo, roupa) ou do fundo, que o SDK não seleciona.
  `set: "retrato"` grava o conjunto da casa; `install: true` copia para a pasta do Camera Raw (reiniciar o Lightroom).
  Depois: `lr_list_develop_presets` → `lr_apply_develop_preset` em cópia virtual → olhar a máscara.
- `lr_recipe_batch_develop` aceita `measureRegion` `[x, y, largura, altura]` (frações): iguala a exposição medindo só
  essa região (o fundo, a pele). Use quando o enquadramento muda de foto para foto.
- `lr_sync_settings_groups`: copia grupos de ajuste (por exemplo a remoção de manchas) de uma foto para as outras.

## Medido ao vivo em 18/11/2026 (Lightroom Classic 16)

- **Predefinições de máscara por parte** (`lr_build_mask_presets`): aparecem sem reiniciar. Dentes, fundo e pele do
  rosto caíram na parte certa em fotos diferentes da de origem.
- **IA pendente trava a exportação** com o diálogo "AI Updates Recommended". Depois de predefinição com máscara,
  colagem de ajustes ou remoção de manchas, a IA precisa ser atualizada antes de exportar
  (`photo:needsUpdateAISettings()` → `catalog:updateAISettings(fotos)` dentro de acesso de escrita, ~4 s por foto).
  As ferramentas de predefinição, sincronização e exportação fazem isso sozinhas.
- **Sincronizar manchas** (`lr_sync_settings_groups`, grupo `distractionRemovalBlemish`): a foto de origem precisa
  ter a remoção aplicada de verdade; a colagem leva ~35 s por foto porque a IA recalcula.
- **Exportações longas** passam do limite de resposta do computador (80 s): rode em segundo plano.
- **Cópias virtuais de teste** ficam no catálogo do usuário: avise o nome para ele remover.
- Não importe arquivos de teste num catálogo de cliente: o SDK não remove a entrada depois.

