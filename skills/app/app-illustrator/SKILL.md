---
name: app-illustrator
description: Contrato do Illustrator no MCP — eixo Y para cima e artboardRect, pontos, cores, árvore de decisão das ferramentas ai_* (formas, Bézier, Pathfinder, degradê, amostras, pranchetas, alinhar), o que exige script livre (texto em caminho, tracking, ordem de empilhamento em grupo) e armadilhas (diálogo de salvar, SVG). Use ao desenhar selos, ícones, logos ou vetores no Illustrator.
---

# app-illustrator — contrato e decisões

Referências: `references/bezier-and-menus.md` (círculos, arcos, comandos de menu).

## 1. Contrato

| Item | Regra |
|---|---|
| Coordenadas de criação | pontos, **Y para cima**. Leia `artboardRect` [left, top, right, bottom] (no `ai_manage_document` create ou `ai_get_document_info`) e converta: `aiX = left + x`, `aiY = top − y` |
| Coordenadas de edição | `ai_find_objects` / `ai_modify_objects` usam x/y da prancheta, origem no topo, **Y para baixo** |
| Alvo | `uuids` de `ai_find_objects` (nomes podem repetir) |
| Cor | `"#RRGGBB"` |
| Salvar | `ai_manage_document` save com `filePath` cria a pasta e **nunca abre a janela "Salvar como"**; confere o caminho (`SAVE_PATH_MISMATCH`) |
| Título de documento novo | `title` em create (via DocumentPreset) |
| Organização | Camadas por função e grupos por sentido dentro delas; objeto sozinho fica solto. `ai_organize_objects` (plano) → `apply: true`. Skill `craft-organizacao-camadas` |
| PSD | Sempre **vinculado** (`placedItems`, sem `embed`). Incorporar só se a pessoa pedir ou o destino exigir, e então com camadas achatadas (`ai_recipe_pop_out embed: true` achata sozinho). |

## 2. Qual ferramenta

| Quero | Ferramenta |
|---|---|
| Formas | `ai_create_shape` (rectangle, ellipse, polygon, star) |
| Curvas | `ai_create_bezier_path` (handles `leftDirection`/`rightDirection`; ponta aberta com `closed: false`) |
| Texto | `ai_create_text` (`createOutlines` para versão final) |
| Combinar | `ai_pathfinder` (unite, minusFront → anel = círculo − círculo menor) |
| Degradê | `ai_apply_gradient` (linear/radial, paradas com offset) |
| Amostras | `ai_swatches` add |
| Efeitos vivos | `ai_apply_live_effect` (sombra, brilho, desfoque, arredondar, transformar…) |
| Estilo gráfico | `ai_graphic_style` |
| Editar | `ai_modify_objects` (posição, moveBy, escala, cor, traço, nome, ordem, camada) |
| Alinhar | `ai_align_distribute` (relativeTo artboard para centralizar) |
| Pranchetas | `ai_manage_artboards` (add com rect, setActive) |
| Out of bounds / pop-out (receita) | `ai_recipe_pop_out` (Photoshop só recorta e salva PNG transparente com trim; no Illustrator: grupos de recorte, a forma é a própria máscara e recebe cor/contorno depois de mascarar; ver `foto-recorte-e-composicao` 1b) |
| Pacote de marca inteiro (receita) | `ai_recipe_logo_package` (cópia do .ai; versões cor/negativa/mono, avatar, favicon e folha de uso como pranchetas; SVG, PNG 512/1024/2048, web, PDF; folha de contato) |
| Camadas | `ai_manage_layers` |
| Ver | `ai_get_artboard_preview` (prancheta ativa; `transparency: false` para ver sobre branco) |
| Exportar | `ai_export_assets` (svg via Export for Screens com `artboardIndex`; png/jpg da prancheta ativa) |
| Variações por planilha (etiquetas, selos, cards, crachás) | `ai_batch_variants` (itens nomeados = colunas: texto, imagem vinculada encaixada na moldura original, `#RRGGBB` em caminho, hide/show; o modelo volta ao original) |
| Levar ao After Effects animável | camadas nomeadas, uma por parte → salvar .ai → `ae_import_vector_as_shapes` |

## 3. Script livre (`ai_execute_extendscript`, ES3)

Ternário encadeado só com parênteses (`a ? x : (b ? y : z)`): sem eles o ExtendScript avalia errado.

| Tarefa | Trecho |
|---|---|
| Texto em círculo | `var c = layer.pathItems.ellipse(top, left, d, d); var t = layer.textFrames.pathText(c); t.contents = "…";` centralizar girando o texto (`t.rotate(ang)`) |
| Tracking, alinhamento | `tf.textRange.characterAttributes.tracking = 160` · `paragraphs[i].paragraphAttributes.justification = Justification.CENTER` |
| Ponta arredondada | `path.strokeCap = StrokeCap.ROUNDENDCAP` |
| Agrupar e duplicar versão | `layer.groupItems.add()` + `item.move(grupo, ElementPlacement.PLACEATBEGINNING)` + `grupo.duplicate()` + `translate` |
| Ordem dentro do grupo | `item.zOrder(ZOrderMethod.SENDTOBACK)` (mover para dentro de um grupo inverte a ordem) |

## 4. Armadilhas

- Sinal de Y errado → desenho fora da prancheta. Sempre leia o `artboardRect`.
- Família de ícones: uma prancheta por ícone (mesmo tamanho), traço único (9 pt em 240 pt), pontas e cantos
  redondos; confira tudo junto numa prancheta temporária `_overview` com fundo escuro e apague depois.
- PNG para o Photoshop: `ai_export_assets` png com `artboardIndex` e `scale: 400`.
- `pathfinder` devolve grupo; o degradê aplicado ao grupo funciona.
- Fonte convertida em contorno não edita mais: guarde a versão em texto numa camada oculta.
- Export SVG antigo (`exportFile`) renomeava o documento para .svg e travava o app — a ferramenta usa Export for Screens.

## 5. Portão

```
[ ] Prévia de cada prancheta conferida
[ ] Versões (claro/escuro) em pranchetas separadas
[ ] .ai salvo no caminho certo; PNG/SVG exportados
```

## Regras de 18/11/2026

- Nenhum diálogo pode aparecer para a pessoa: não use `createFromFile` com .ai/PDF (abre "objetos PDF
  reinterpretados"); use PNG/SVG ou duplique de um documento aberto. A ponte suprime alertas em todo comando.
- Carrossel: um `.ai` com uma prancheta por slide; o Illustrator respondeu em 1–2 s por slide (Photoshop
  40–60 s) — prefira-o quando a peça é quase toda vetor.
- Texto em forma: linha de base = centro da forma + metade da altura da maiúscula ("H" contornado).
- **Exportar pranchetas:** `ai_export_artboards` usa o Exportar para telas — todas as pranchetas (ou um
  intervalo) numa chamada, um arquivo por prancheta com o nome dela (PNG, JPG, SVG ou PDF; `scale` 200 = @2x).

## Correções e ferramentas de 18/11/2026 (sem teste ao vivo ainda)

- `ai_get_artboard_preview` aceita `artboardIndex` (base 0) e devolve o nome da prancheta (B36).
- `ai_center_text_in_shape` (`textName`/`textUuid` + `shapeName`/`shapeUuid`): centra o texto vivo na forma pela
  altura da maiúscula; devolve o espaço em cada lado em pontos; `offsetY` para o ajuste óptico.
