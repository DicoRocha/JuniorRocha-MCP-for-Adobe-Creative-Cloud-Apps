---
name: app-after-effects
description: Contrato do After Effects no MCP — cores 0–1, tempo em segundos, índices a partir de 1, caminhos de propriedade por matchName, árvore de decisão das ferramentas ae_*, script livre seguro (curto, sem salvar dentro), salvar/novo projeto sem diálogo, prévia sem travar e armadilhas (Dynamic Link aberto no Premiere, texto alinhado à esquerda, banding). Use ao trabalhar no After Effects por ferramentas ae_*.
---

# app-after-effects — contrato e decisões

Referência: `references/ae-matchnames.md`. Ofício: `motion-fundamentos`.

## 1. Contrato

| Item | Regra |
|---|---|
| Cor | `[r,g,b]` **0–1** (HEX ÷ 255) |
| Tempo | segundos; índices de camada e item a partir de **1** |
| Coordenadas | comp `[0,0]` no canto superior esquerdo; camada nova no centro |
| Propriedades | caminhos em array, por **matchName** (nomes de tela mudam com o idioma): `["ADBE Transform Group","ADBE Scale"]` |
| Painel | `Janela > Extensões > Junior Rocha MCP`; sem painel o fallback `AfterFX.exe -r` é lento |
| Projeto | `ae_manage_project` new/open recusa descartar alterações (`PROJECT_DIRTY`) sem `discardChanges: true`; save cria a pasta e suprime diálogos |
| Organização | Pré-comp por cena ou elemento repetido, nulo pai `CTRL …` para ícone + texto, rótulos de cor por função, pastas no projeto. Skill `craft-organizacao-camadas` |

## 2. Qual ferramenta

| Quero | Ferramenta |
|---|---|
| Projeto, importar (PSD como comp) | `ae_manage_project` (import `importAs: "comp"` mantém a tela inteira; `settings` + `bitsPerChannel: 16`) |
| Texto do PSD editável | selecione as camadas → menu "Convert to Editable Text" (`app.findMenuCommandId`, id 3799) |
| Comp | `ae_create_composition` · `ae_modify_composition` (pré-compor por `precomposeLayerNames` ou índices) · `ae_list_compositions` |
| Camadas | `ae_create_layer` (text, solid, adjustment, null, camera, light) · `ae_create_shape_layer` (com `trimPaths`) · `ae_get_layers` |
| Transformar / tempo / matte / blend | `ae_modify_layer` |
| Chaves | `ae_set_keyframes` (easing, influence, speed, spatial) |
| Easing nas chaves que já existem | `ae_set_easing` (easyEase, gentle, smooth, strong, snappy, linear, hold, custom; camadas inteiras ou uma propriedade; `side`, `fromTime`/`toTime`) |
| Marcadores | `ae_manage_markers` (comp ou camada; batidas, blocos do roteiro, notas de entrega) |
| Receitas de uma chamada (com kit de marca, auditadas) | `ae_create_lower_third` · `ae_create_title_card` · `ae_create_counter` (R$ 12.500) · `ae_create_logo_reveal` · `ae_create_transition` (wipe, circle, push, zoom, fade; ver `motion-transicoes`); `kitPath` = `00_briefing/kit-de-marca.json`; `mogrtPath` exporta para o Premiere (projeto salvo) |
| Valor fixo | `ae_set_property` |
| Expressão | `ae_set_expression` (devolve `expressionError`) |
| Efeitos | `ae_list_effects` → `ae_apply_effect` (devolve parâmetros) · `ae_manage_effect` |
| Texto animado | `ae_add_text_animator` |
| Máscara | `ae_add_mask` (retângulo, elipse, caminho; feather, modo) |
| Presets .ffx | `ae_list_presets` → `ae_apply_preset` com `time` (as chaves nascem no indicador de tempo) |
| Ver propriedades | `ae_get_property_tree` |
| Prévia | `ae_get_comp_frame_preview` (não espera dentro do AE; o servidor aguarda o PNG) · `ae_contact_sheet` (12 quadros da área de trabalho numa grade: a animação inteira num olhar) |
| Render | `ae_render_queue` com `startRenderImmediately: true`. **Salve o projeto antes** (`ae_manage_project` save): com o projeto salvo e sem alterações o render roda no aerender, um After separado, e o app continua livre; devolve `renderJobId` → `media_job_status`. Com alterações não salvas renderiza dentro do app (trava o After até acabar) e avisa em `engineNote`. Nunca salve o projeto do usuário sem pedir. `queueInAME` abre o Media Encoder |
| Proteger | `jradb_checkpoint` app after-effects |

## 3. Script livre (`ae_execute_extendscript`, ES3)

Ternário encadeado só com parênteses (`a ? x : (b ? y : z)`): sem eles o ExtendScript avalia errado.

Roda num grupo de desfazer, com diálogos suprimidos. Regras:
- **Uma comp por chamada**, poucos objetivos. Script longo trava: com o script rodando o After não responde (o painel mostra "Executando: script · N s"). Projeto grande: monte **uma cena por chamada** (`$.evalFile` de um arquivo por cena), cada uma em até ~20 s.
- **Não chame `app.project.save()` no script** — salve com `ae_manage_project` em outra chamada.
- Ache comps por nome percorrendo `app.project.item(i)`.
- **Depois de `addProperty`, pegue as referências de novo** pelo caminho (`layer.property("ADBE Root Vectors Group").property(1)...`):
  as variáveis antigas ficam inválidas ("Object is invalid").
- Erro no meio do script **não desfaz** o que já rodou: confira o estado (`ae_get_layers`) antes de repetir,
  senão nasce uma segunda câmera, um segundo sólido etc.

| Tarefa | Trecho |
|---|---|
| Centralizar texto | `var sp = l.property("Source Text"); var td = sp.value; td.justification = ParagraphJustification.CENTER_JUSTIFY; sp.setValue(td);` |
| Fonte, tamanho, entrelinha | `td.font = "Cormorant-SemiBold"; td.fontSize = 118; td.autoLeading = false; td.leading = 112;` |
| Duplicar comp | `comp.duplicate()` e renomear |
| Rasterização contínua (AI escalado) | `layer.collapseTransformation = true` |
| Encaixar texto pela base | `l.sourceRectAtTime(t, false)` → posição = alvo − (top + height) |
| Medir se o texto cabe | `r = l.sourceRectAtTime(t,false); direita = pos[0] + r.left + r.width` (≤ largura − margem) |
| Trocar foto/ícone numa comp duplicada | `layer.replaceSource(item, false)` |
| Card que revela a foto | camada de forma retângulo arredondado (Size animado) acima da foto → `foto.setTrackMatte(card, TrackMatteType.ALPHA)` |
| Degradê de proteção sem banding | sólido + `ADBE Linear Wipe` (ângulo 180, feather 240) + `ADBE Noise` 1–2 % em projeto 16 bpc |

## 4. Armadilhas

- **Travamento com Dynamic Link:** em 13/11 o AE congelou num script que editava e salvava enquanto o Premiere tinha o projeto aberto; o Premiere travou junto. Edite em passos curtos e salve pela ferramenta.
- Texto nasce **alinhado à esquerda** no ponto dado.
- **Paralaxe 3D com foto + recorte do sujeito:** foto e recorte no **mesmo z** (senão aparece cabeça dupla);
  só o título vai para trás (z +180) com escala `(zoom+z)/zoom` para manter o tamanho. Câmera de um nó:
  anime só a posição (x ±40, z +80) e escale a foto 108 % para não mostrar a borda. A câmera nova nasce em
  [0,0,−zoom] quando criada por script: posicione em [w/2, h/2, −zoom].
- "Undo group mismatch" ao renderizar: corrigido na ponte 1.3.2 (o render fecha o grupo de desfazer antes).
- Regra: o aviso "Undo group mismatch" não pode aparecer. Em `ae_execute_extendscript` não escreva `app.beginUndoGroup`/`endUndoGroup` (o MCP já agrupa) e não salve, abra projeto nem renderize no mesmo script: use `ae_manage_project` e `ae_render_queue` em chamadas separadas. A ponte ainda fecha qualquer grupo que sobrar.
- Degradê em 8 bits mostra faixas: projeto em 16 bpc (`app.project.bitsPerChannel = 16`) ou grão leve.
- Prévia PNG de comp transparente aparece com fundo branco: é o alfa, não erro.
- Efeito por nome de tela falha em AE traduzido: use matchName (`ADBE Glo2`, `ADBE Gaussian Blur 2`).

## 5. Portão

```
[ ] Projeto salvo + checkpoint
[ ] Quadros conferidos; expressões sem erro
[ ] Entrega: Dynamic Link confirmado ou render existente
```
- Depois de `layer.parent = x`, redefina escala e posição da filha (o After compensa a escala do pai no
  instante). Rotação 2D: `ADBE Rotate Z`. Valide os nomes de propriedade antes de criar camadas.
- Render de revisão/entrega: "H.264 – Match Render Settings" cabe no tempo da chamada; ProRes 4444 só
  quando precisar de alfa.

## Ferramentas de 18/11/2026 (sem teste ao vivo ainda)

- `ae_pop_words`, `ae_text_ring`, `ae_measure_landings`, `ae_audit_camera`: ver `motion-lyric-video` §0b.
- `ae_contact_sheet` aceita `aroundSeconds` + `stepSeconds`: tira de quadros seguidos em volta de um corte.
- `ae_camera_transition` ganhou o estilo `glitch` (controles "Intensidade" e "Forca").
- `ae_word_captions` com `singleLayer: true`: uma camada de texto para o vídeo todo (o estilo muda num lugar só).
- Comando que falha no meio agora é **desfeito** (só quando o menu Desfazer mostra o nome do próprio comando);
  a resposta de erro traz `rolledBack`. Confira o estado antes de repetir.
- As medidas (`ae_measure_landings`, `ae_audit_camera`) criam e removem um nulo temporário; a posição lida é
  anterior a qualquer lente aplicada em camada de ajuste.

## Medido ao vivo em 18/11/2026 (After Effects 27)

- **Adicionar um efeito invalida as referências de propriedade tiradas antes** ("Object is invalid"). Adicione
  todos os efeitos primeiro e só então leia as propriedades (ou releia pela camada depois de cada `addProperty`).
- **Caminho de câmera:** chaves de posição nascem com curva automática; entre duas chaves no mesmo ponto a câmera
  passeia de lado. Use tangentes espaciais zeradas (caminho reto) e ease em cada chave.
- **Posição na tela sem renderizar:** nulo temporário com expressão `toComp` lida por `valueAtTime(t, false)`.
- **Desfazer por script:** `app.executeCommand(16)`. `findMenuCommandId` não enxerga "Undo <nome>".
- **Sólido criado com duração curta** sai com a duração da comp: acerte `outPoint` depois.

