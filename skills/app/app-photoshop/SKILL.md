---
name: app-photoshop
description: Contrato do Photoshop no MCP — pontes (CEP, UXP, COM), unidades e cores, árvore de decisão das ferramentas ps_*, o que exige script livre, armadilhas conhecidas (texto na linha de base, estilos que se substituem, batchPlay que não lança erro) e receitas testadas (camada de degradê, lista de fontes, duplicar documento). Use ao trabalhar no Photoshop por ferramentas ps_*.
---

# app-photoshop — contrato e decisões

Referência de descritores: `references/batchplay-cheatsheet.md`.

## 1. Contrato

| Item | Regra |
|---|---|
| Pontes | CEP (padrão, ExtendScript) · UXP (`Plugins > MCP Bridge`, necessário para `ps_execute_uxp_script`) · COM no Windows sem painel |
| Documento alvo | **Sempre `documentName`** (nome do arquivo aberto; caminho completo se dois tiverem o mesmo nome). A pessoa pode estar trabalhando em outro arquivo do mesmo programa: com mais de um aberto, comando sem nome é recusado (`DOCUMENT_REQUIRED`). O programa traz o alvo para a frente só durante o comando e devolve a frente ao documento que estava antes (regra do usuário, 27/11/2026) |
| Unidades | pixels; tamanho de fonte em pt (em 72 ppi pt = px) |
| Origem | canto superior esquerdo, Y para baixo |
| Cor | `"#RRGGBB"` ou `{r,g,b}` 0–255 |
| Camadas | por `layerId` ou `layerName` exato; sem nenhum, a ativa |
| Salvar | `ps_save_document` cria a pasta e roda sem diálogos; PSD em camadas + JPG/PNG de saída |
| Organização | Grupos por sentido (ícone + texto, texto sobre shape, listas, cards); objeto sozinho fica solto. `ps_organize_layers` (plano) → `apply: true`. Skill `craft-organizacao-camadas` |
| PSD mestre | Imagem ajustada aqui (recorte, retoque, cor) é salva em **PSD** com as camadas e máscaras; esse PSD é o arquivo que vai para AI, ID, AE e PR (vinculado). PNG/JPG só na entrega final. `ps_recipe_remove_background { psdPath }` |

## 2. Qual ferramenta

| Quero | Ferramenta |
|---|---|
| Documento novo / abrir / listar | `ps_create_document` · `ps_open_document` · `ps_list_documents` |
| Ver | `ps_get_canvas_snapshot` (maxDimension 800–1080) · `ps_get_layer_tree` (bounds) |
| Fonte (nome PostScript) | `ps_list_fonts` search "cormorant" |
| Texto | `ps_create_layer` text (font PostScript) → `ps_edit_text_layer` (texto, tamanho, tracking, leading, alinhamento) |
| Inserir foto, ícone, PDF, AI | `ps_place_file` (Smart Object; caixa x/y/width/height + fit contain/cover) |
| Mover, escalar, renomear, opacidade, apagar | `ps_transform_and_manage_layer` |
| Ajuste não destrutivo | `ps_adjustment_layer` (curves, levels, hueSaturation, colorLookup, gradientMap…; `clipToBelow`) |
| Seleção, máscara, recorte | `ps_selection_and_masks` (selectSubject, selectSky, removeBackground, addMaskFromSelection) |
| Filtro | `ps_apply_filter` (em Smart Object vira **filtro inteligente**) / `ps_effects_and_adjustments` (filter) |
| Estilo de camada | `ps_effects_and_adjustments` layerStyle: dropShadow, stroke, outerGlow, colorOverlay, gradientOverlay (funciona sem o painel UXP) |
| Trocar foto num template | `ps_smart_object` replaceContents (mantém escala, filtros e máscara: monte 1 slide, salve como, troque foto + textos) |
| Texto atrás da pessoa | duplicar a foto acima do título → `ps_selection_and_masks` selectSubject → addMaskFromSelection |
| Tela | `ps_modify_canvas` (resizeCanvas para recompor, crop, trim) |
| Botão, selo, card (forma viva) | `ps_create_shape` (retângulo arredondado/retângulo/elipse; raio = altura ÷ 2 faz botão pílula; cor e raio editáveis) |
| Forma combinada (janela abstrata, balão com rabicho, moldura vazada), linha aberta só com traço | `ps_create_path_shape` (`type: "polygon"` com raio por vértice = **todos os cantos arredondados**; ou `items` com `op`: add = Combinar formas, subtract = Subtrair forma frontal, intersect, exclude; `fill: null` + `stroke` = só contorno). Foto dentro: máscara de corte na forma |
| Linha de chamada de tag (diagonal + reta, ponto duplo) | `ps_recipe_callout` (`points`, `groupWith` = camadas da tag → um grupo por tag) |
| Agrupar camadas onde elas estão | `ps_group_layers` (`layerNames`, `groupName`, `artboard`) |
| Fundo em degradê que sobrevive à duplicação da prancheta + sol | `ps_recipe_gradient_background` (retângulo + Sobreposição de degradê; `sun` nítido, desfoque 1 px) |
| Recorte de sujeito + chão que sai pelas bordas | `ps_selection_and_masks` `maskFromBackground` (`points` no fundo liso, `tolerance` 42) |
| Mesmo nome de camada em várias pranchetas | passe `artboard` em `ps_effects_and_adjustments` / `ps_selection_and_masks` |
| Vinheta (escurecer o entorno do assunto) | `ps_recipe_vignette` (elipse ou assunto expandido → inverter → Matiz/Sat., Curvas ou Níveis; feather da máscara 60–80 px+; cópia recortada do assunto por cima — a vinheta escurece só o fundo) |
| Fundo desfocado sem halo | `ps_recipe_background_blur_clean` (assunto +10 px → preenchimento sensível ao conteúdo numa cópia → objeto inteligente desfocado → assunto recortado por cima; `method: "remove"` = ferramenta Remover, só com consentimento para gastar créditos) |
| Tirar todos os estilos | `ps_effects_and_adjustments` layerStyle `type: "clear"` (mantém modo e preenchimento) |
| Recortar o sujeito (receita) | `ps_recipe_remove_background` (cópia do documento, Smart Object + máscara, PNG transparente, caixa do sujeito) |
| Out of bounds / pop-out (receita) | `ps_recipe_pop_out` (pessoa saindo de um círculo ou outra forma: forma + recorte com máscara de corte + cópia de cima com máscara; numa cópia ou no próprio documento com `layerName`; `keepBackground` mantém o fundo da foto dentro da forma; ver `foto-recorte-e-composicao` 1b) |
| Foto de produto pronta (receita) | `ps_recipe_product_shot` (recorte → formato com fundo do kit, produto na zona segura, sombra de contato) |
| Templates da marca | `jradb_templates_build` (posts .psdt com camadas para `ps_batch_variants`, além de .indt/.ait/.mogrt) |
| Arte-chave → todos os formatos (receita) | `ps_recipe_social_set` (documento novo com pranchetas; fundo/foto cobrem com ponto focal no recorte "Motiv"/"produto"; textos em blocos topo/meio/base dentro da zona segura; auditoria por prancheta; `outputFolder` exporta). Arte pesada: ~20–80 s por formato |
| Formato de saída para redes sociais | **sempre PNG** (regra do usuário): `ps_recipe_social_set`, `ps_artboards` export e `ps_batch_variants` já usam png por padrão; não passe jpg/webp para peça de rede social |
| Vários formatos num PSD (feed, story, quadrado) | `ps_artboards` create (lado a lado, `backgroundColor`) → list → export (um arquivo por prancheta, `{{#}}_{{name}}`, png/jpg/webp, `scale`, `maxKB`) |
| Saída para web/site | `ps_export_web` (jpg/png/webp, sRGB 8 bits, sem metadados, `maxWidth`, `sizes` com sufixos, `maxKB`); documento com pranchetas → `ps_artboards` export |
| Ações do usuário | `ps_list_actions` → `ps_play_action` |
| Muitos passos | `jradb_batch` app photoshop (um passo de histórico) |
| Antes de mexer | `jradb_checkpoint` (cópia PSD em `_checkpoints/`) |

## 3. Por script livre (`ps_execute_extendscript`, ES3)

| Tarefa | Trecho |
|---|---|
| Duplicar documento | `app.activeDocument.duplicate("nome")` |
| Camada de degradê (proteção de texto) | `Mk  ` de `contentLayer` com `gradientLayer` (paradas de cor + `Trns` de opacidade, ângulo −90) |
| Encaixar foto cobrindo a tela | `layer.resize(max(W/w, H/h)*100)` + translate para o centro |

Mantenha cada script em **um** objetivo. Script longo trava o app.
**Ternário encadeado sem parênteses dá resultado errado no ExtendScript** (`a ? x : b ? y : z` é lido da esquerda
para a direita): escreva `a ? x : (b ? y : z)` ou use `if`. Num `replace`, `"$1"` de grupo não casado vira "undefined".

**Mire o documento pelo nome**, não por `app.activeDocument`: o usuário pode trocar de aba enquanto você
trabalha (13/11: o fundo e os textos do slide 6 foram parar na capa). No script:
`var d = app.documents.getByName("4S_Karussell_06_CTA"); app.activeDocument = d;`. Nas ferramentas
de documento, passe `documentName` (todas aceitam; também no script livre, que então roda com esse documento na
frente e devolve a frente ao anterior). Com mais de um documento aberto, script que usa `app.activeDocument` sem
pegar o documento pelo nome é recusado (`DOCUMENT_REQUIRED`).

## 3b. Variantes: duplique o bloco inteiro, depois adapte

Para qualquer variante (formatos, idiomas, versões de teste, peças de uma série), **duplique o documento
inteiro, a prancheta inteira ou o grupo inteiro** e adapte a cópia. Copiar camada por camada entre documentos
custa 1–2,5 s por camada com Smart Objects (19 camadas × 2 formatos passaram de 3 min em 16/11/2026); duplicar
dentro do mesmo documento é praticamente instantâneo. Camada por camada **só quando for estritamente necessário**
(ex.: levar uma única camada para outro arquivo). Por script: `doc.duplicate(nome, false)`, `grupo.duplicate(destino,
ElementPlacement.INSIDE)`, agrupar tudo numa ação (`selectAllLayers` + `Mk layerSection`) antes de duplicar.

## 4. Armadilhas

- **Créditos generativos (regra do usuário, 25/11/2026):** recursos de IA da Adobe que podem gastar créditos
  (Remover com IA, Preenchimento generativo, Expandir generativo) só com o consentimento da pessoa naquele pedido.
  Sem ele, use o equivalente local (preenchimento sensível ao conteúdo, Selecionar assunto).

- **Texto ancora na linha de base:** `position` é o ponto de inserção; leia bounds (`ps_get_layer_tree`) para alinhar pela base.
- `layerStyle` substitui os estilos existentes da camada: para sombra + traço, mande os dois num descritor (`ps_batch_play`).
- `ps_batch_play` não lança erro: leia `errorCount` no resultado.
- `ps_adjustment_layer` curves sem `settings` cria curva neutra (sem efeito): passe os pontos ou use outro ajuste.
- Diálogo aberto no app bloqueia tudo (`APP_BUSY`/`HOST_BLOCKED`): peça para fechar.
- Smart Object inserido tem bounds dos **pixels visíveis**: ícones de tamanhos diferentes no mesmo
  artboard ficam com alturas diferentes depois de replaceContents; normalize a altura (resize) por slide.
- `saveAs` PNG pela ferramenta exporta cópia: o documento continua sendo o PSD.
- **Camada de degradê + duplicar prancheta:** o degradê muda de posição na cópia. Fundo em degradê = retângulo
  do tamanho da prancheta com Sobreposição de degradê (não estraga ao duplicar).
- `getByName` devolve a **primeira** camada com o nome: depois de renomear uma camada nova com o nome da antiga,
  apagar "pelo nome" apaga a nova. Apague pela referência ou pelo tipo.
- Tornar ativa uma camada oculta (`doc.activeLayer = camada`) a deixa **visível**: oculte depois de ativar.
- Estilos de camada lidos de um documento e aplicados em outro pelo mesmo descritor falham sem erro: monte o
  descritor de novo com os valores.
- **`PathPointInfo` no Photoshop é o contrário do Illustrator:** `leftDirection` é a alça de **saída** (para o
  próximo ponto) e `rightDirection` a de entrada. Do jeito do Illustrator os cantos saem chanfrados (retos).
  `ps_create_path_shape` já monta certo.
- Duplicar uma camada com máscara de corte gera outra com máscara de corte: solte (`Ungr`) se ela deve aparecer fora.
- Levar uma camada sozinha para outro documento (para exportar PNG): se ela tem máscara de corte, a cópia chega
  recortada e invisível (PNG vazio). Solte (`grouped = false`) no documento novo antes de salvar.
- Tirar o filtro inteligente: `Dlt` de `filterFX` índice 1 na camada (o `clearSmartFilters` não existe no 28).
- Mover uma camada com máscara vinculada move a máscara: para limites fixos (área de vazamento), desvincule
  (`userMaskLinked: false`).
- Forma de caminho aberto (linha com cotovelo, traço sem preenchimento): `doc.pathItems.add` com subcaminho
  aberto → `select()` → `Mk ` de `contentLayer` com `strokeStyle` (`fillEnabled false`, largura, cor) → apagar o
  caminho de trabalho.
- **Salvar como PSD renomeia o documento** para `<nome>.psd`: use o nome novo nas chamadas seguintes.
- **Medir forma sem a sombra:** `layer.bounds` inclui sombra projetada (o centro desce ~10 px); use
  `boundsNoEffects` (as receitas de centralizar e de preço já usam).
- **Pranchetas por script (25/11/2026):** para outro formato, **duplique a prancheta inteira**
  (`ps_artboards` operation `duplicate`, com `source`, `newName`, `width`, `height`): grupos e Smart Objects vão
  junto, sem " copy" nos nomes. Não duplique grupos para dentro de outra prancheta (`duplicate(grupo)` falha e
  `move(..., INSIDE)` em grupo aninhado joga a camada para a raiz do documento). Fundo de prancheta = camada de
  **cor sólida** (preenche em qualquer tamanho), não pixels.
- **Receitas de montagem (25/11/2026):** `ps_place_file` com `into` (grupo/prancheta) e `cutout: true`
  (Selecionar Assunto como máscara); `ps_recipe_motion_trail` (rastro + desfoque leve no objeto);
  `ps_center_text_in_shape` com `layerNames` (conjunto centrado nos dois eixos); `ps_recipe_price_tag`
  (preço como frase única); `media_download_url` (baixar asset gerado por link).

## 5. Portão

```
[ ] Camadas nomeadas; Foto como Smart Object
[ ] Ajustes por camada de ajuste (nada destrutivo)
[ ] Snapshot conferido; PSD salvo + saída exportada
```

## Regras de 18/11/2026 — troca de cor e aplicação de marca em roupa

- **Trocar a cor de algo já colorido: modo MATIZ (Hue), não COR (Color)** — Color satura demais.
  Trate cada atributo em camada separada, dentro de um grupo com a máscara do objeto:
  1. **Matiz:** preenchimento sólido da cor alvo em modo Matiz (em cima).
  2. **Saturação:** camada Matiz/Saturação (ex.: −33 numa camisa vermelha → roxo da marca).
  3. **Luminosidade:** Curvas no RGB composto (ex.: 125→105, 255→231); canais individuais só para
     ajuste fino de dominante.
- **Estampa/símbolo em tecido:** Smart Object, opacidade ~90 %, e **Mesclagem avançada → Mesclar se,
  camada subjacente**, preto dividido (ex.: 15/75) para a sombra e a textura do tecido atravessarem.
  Posição "de super-herói": centro horizontal na linha do decote, ~0,19 × largura do torso abaixo
  dele; largura ~0,195 × torso; leve rotação acompanhando o corpo.
- **Remover estampa:** seleção retangular justa + Preenchimento sensível ao conteúdo.
- **Máscara:** dilate 2–3 px e suavize para não sobrar franja da cor antiga na borda.
- **Carrossel e adaptações de formato:** um PSD com pranchetas, nunca vários arquivos.
- Quando a pessoa editar um PSD à mão, leia o que ela fez (modos, opacidade, ajustes, Mesclar se —
  este só aparece lendo o arquivo, não pelo `get` da camada) e replique nas outras peças.
- **Texto em pranchetas por script:** criar a camada de texto na primeira prancheta e mover para a
  prancheta alvo (criar direto nas outras falha). Exportar pranchetas: conferir o tamanho dos PNG; se
  saírem em branco, duplicar achatado e recortar pelo retângulo de cada prancheta.
- Painel desconectado: os comandos vão por COM, mais lentos, e a resposta de script longo pode se
  perder mesmo tendo rodado — confira o estado do documento antes de repetir.
- PSD com pranchetas: exporte com a **Exportação rápida como PNG** (um arquivo por prancheta, nome da prancheta); é o caminho preferido em vez de recortar cópias.
- Ferramentas novas (18/11): `ps_recolor_object` (grupo mascarado com Matiz + Matiz/Saturação + Curvas) e `ps_blend_if` (Mesclar se + opacidade). Quebra de título equilibrada: `text_balance_lines`.

## Correções e ferramentas de 18/11/2026 (sem teste ao vivo ainda)

- **Texto em pranchetas (B39):** `ps_create_layer` com `layerType: "text"` cria o texto na prancheta que o Photoshop
  aceita e move para a prancheta certa. Diga a prancheta com `artboard` (nome) ou pela `position`.
- **Exportar pranchetas (B40):** `ps_artboards` export deixou de apagar as outras pranchetas antes do recorte (era o
  que deixava da 2ª em diante em branco). `quickExport` continua sendo o caminho pedido pelo usuário para PNG.
- **Texto centrado em forma:** `ps_center_text_in_shape` (texto + forma) centra pela altura da maiúscula e devolve
  o espaço em cada lado; `offsetY` para o ajuste óptico. Use em botão, pílula, etiqueta e cartão.
- **Logo do kit:** `ps_place_logo` (`filePath`, `corner`, `artboard`, `widthFraction`, `marginFraction`).
- **Painel desconectado (B41):** erro `COM_TIMEOUT_PANEL_DISCONNECTED` = o comando foi pelo caminho lento e a resposta
  se perdeu. **Não repita**: leia o estado (`ps_list_documents`, `ps_get_layer_tree`), peça para reabrir o painel e siga.

## Pranchetas e referências de camada (medido ao vivo em 18/11/2026, Photoshop 28)

Vale para qualquer script próprio (`ps_execute_extendscript`) num documento com pranchetas:

- `prancheta.artLayers.add()` só entra de verdade **na primeira prancheta**. Nas outras, a camada nova não fica
  naquele grupo e a referência devolvida passa a apontar para **outra camada** (a de cima do grupo). Converter
  para texto falha ("The layer cannot contain text") ou edita a camada errada; `remove()` apaga uma camada real.
- Depois de `camada.move(...)` a referência também fica velha (a camada ganha ID novo).
- Portanto: crie na primeira prancheta, confira que o grupo cresceu uma camada (`layers.length`), defina **todas**
  as propriedades ali e mova **por último**; depois do move não use mais a variável (releia pelo topo do grupo).
- Nunca apague por referência depois de uma falha. Só apague a camada ativa se ela estiver vazia.
- `ps_create_layer` (texto) e `ps_place_logo` já seguem isso.

## Painel UXP híbrido (19/11/2026, Photoshop 28)

- **Um painel só:** abra apenas **Plugins > Junior Rocha MCP (PS)** (UXP 1.3.0 ou mais novo, instalado pelo `.ccx` em `release\`). O que o UXP não implementa roda em ExtendScript pelo próprio painel; o painel antigo (Janela > Extensões) não é necessário no Photoshop.
- **Prioridade:** com os dois painéis abertos, o UXP responde primeiro. Chamadas nativas do UXP levam dezenas de milissegundos; as que caem no ExtendScript levam de 0,5 a 6 s.
- **Pranchetas pelo UXP:** a camada nova nasce na prancheta ativa e `move(prancheta, PLACEINSIDE)` mantém o id (sem as referências trocadas do ExtendScript). `ps_create_layer` com `artboard` usa esse caminho.
- **Script cru no UXP** (`ps_execute_uxp_script`): `app`, `core`, `action`, `batchPlay`, `uxp` e `constants` já estão declarados; declarar de novo dá erro de sintaxe. Gravar string vazia em arquivo é recusado.
- Sem teste no modo híbrido: scripts de 40 s ou mais.
- **Ligar/desligar o MCP:** o painel tem "Desligar MCP neste app" (padrão ligado); vale só para o Photoshop e fica guardado. Sem ponte com o app aberto, pergunte se está desligado antes de reinstalar.
