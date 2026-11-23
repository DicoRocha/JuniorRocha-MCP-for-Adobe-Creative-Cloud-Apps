---
name: app-premiere
description: Contrato do Premiere no MCP — painel CEP obrigatório, segundos nas ferramentas e ticks no script, índices a partir de 0, nomes de efeito na língua do app, projeto novo ativo, Dynamic Link do After Effects, efeitos e transições tipados, exportação pelo Media Encoder e armadilhas (efeito com nome repetido, lacunas de um quadro, travar junto com o AE). Use ao trabalhar no Premiere por ferramentas pr_*.
---

# app-premiere — contrato e decisões

Referência: `references/premiere-qe-effects.md`. Ofício: `video-reels`, `video-fala-limpa`.

## 1. Contrato

| Item | Regra |
|---|---|
| Painel | CEP (`Janela > Extensões > Junior Rocha MCP`) é obrigatório; o UXP só serve info, importação e `pr_execute_uxp_script` |
| Tempo | **segundos** nas ferramentas; ticks no script (1 s = 254016000000, em string) |
| Índices | a partir de **0**: V1 = 0, primeiro clipe = 0 (lacunas não contam) |
| Nomes de efeito | na língua do Premiere: `pr_list_effects` primeiro |
| Projeto novo | `pr_manage_project` new salva e fecha os outros projetos e deixa o novo ativo |
| Sequência | `pr_create_sequence` com `fromClipName` (sem ele abre um diálogo) |
| Organização | Bins (`01 Sequências`, `02 Vídeo`, `03 Áudio`, `04 Gráficos`) e trilhas com função fixa (V1 vídeo, V2 cobertura, V3 gráficos; A1 voz, A2 trilha). Skill `craft-organizacao-camadas` |

## 2. Qual ferramenta

| Quero | Ferramenta |
|---|---|
| Projeto | `pr_manage_project` (new, open, save, createBin) · `pr_get_project_info` |
| Importar | `pr_import_media` (`targetBinName`; `.aep` + `aeCompNames` = Dynamic Link) |
| Sequência | `pr_create_sequence` (`fromClipName` + `empty: true` = formato do clipe, timeline vazia) · `pr_get_sequence_state` |
| Colocar | `pr_place_clip_on_timeline` (overwrite/insert, `timeSeconds`, `videoTrackIndex`) |
| Clipe | `pr_modify_timeline_clip` (desativar, remover, ripple, propriedades) |
| Editar como editor | `pr_edit_timeline`: razor (todas as trilhas ou `tracks`, vários `times`), extract (ripple de um intervalo; trilha travada fica), slip, trim (início/fim novos, imagem sincronizada), move — com o áudio vinculado |
| Outras proporções | `pr_auto_reframe` (`aspect` "1:1", "4:5", "16:9"; abre a sequência nova; conferir títulos) |
| Reel de fala inteiro (receita) | `pr_assemble_reel` (corte de pausas → legendas → trilha com ducking → auditoria → export opcional) |
| Legenda com estilo | `pr_captions_as_mogrt` (SRT → um título gráfico por bloco, sem passar pela faixa de legendas). Sem `filePath` usa o modelo embutido (vertical ou horizontal pela sequência); campos em `extraValues`: Cor do texto, Cor da caixa, Tamanho, Opacidade da caixa, Altura, Entrada animada |
| Faixa de legenda nativa | `pr_import_captions` cria (painel antigo) e confere (UXP); `pr_caption_tracks` lista blocos, oculta/mostra e renomeia (UXP) |
| Trava de projeto | `pr_expect_project` com o nome do `.prproj` antes da primeira escrita: se outro projeto estiver ativo, todo comando do Premiere é recusado sem alterar nada |
| Efeito | `pr_list_effects` → `pr_apply_effect` (parameters, keyframes) → `pr_list_clip_effects` → `pr_set_effect_params` |
| Transição | `pr_apply_transition` (`clipIndex`, `atStart`) |
| Volume | `pr_set_volume` (dB) |
| Marcadores | `pr_manage_markers` |
| Conferir | `pr_export_frame_or_sequence` mode frame com `timeSeconds` |

## 3. Script livre (`pr_execute_extendscript`, ES3 com `qe`)

Ternário encadeado só com parênteses (`a ? x : (b ? y : z)`): sem eles o ExtendScript avalia errado.

| Tarefa | Trecho |
|---|---|
| Duração de foto antes de colocar | `item.setInPoint("0", 4); item.setOutPoint(String(3.5*T), 4);` |
| Fechar lacunas de 1 quadro | `var e = new Time(); e.ticks = proximo.start.ticks; clip.end = e;` |
| Mover o cursor | `seq.setPlayerPosition(String(seg*T))` |
| Exportar pelo Media Encoder | `app.encoder.launchEncoder(); app.encoder.encodeSequence(seq, saida, presetEpr, app.encoder.ENCODE_ENTIRE, 1); app.encoder.startBatch();` |
| Remover efeito errado | QE: `clip.getComponentAt(k).remove()` |

## 4. Armadilhas

- **Dois efeitos com o mesmo nome** (ex. "Gaussian Blur" nativo e de plugin): `pr_apply_effect` desfaz e devolve `EFFECT_AMBIGUOUS` — use o nome único ("Gaussian Blur (Legacy)").
- Comp do AE por Dynamic Link: se o AE travar, o Premiere trava ao mostrar quadros dela.
- Itens de Dynamic Link se chamam `Comp/Projeto.aep`; as ferramentas aceitam só o nome da comp
  ("4S_Story_Schritt_2"). Todos têm o mesmo caminho de mídia: nunca procure pelo caminho do .aep.
- Mudou a comp no AE? Salve o .aep: o Premiere usa a versão nova no próximo render (sem reimportar).
- Imagem de outra proporção (1080×1350 numa sequência 9:16) deixa faixas: faça uma versão no tamanho da
  sequência e troque a mídia com `item.changeMediaPath(novo, true)` — transições e chaves continuam.
- `targetBinName` que não existe é criado na raiz (ponte 1.3.2).
- `pr_apply_effect` em Lumetri devolve só os parâmetros pedidos (são ~130).
- Premiere 27: o painel Lumetri saiu; use os efeitos do Color Mode ("Color And Contrast", "Film Color",
  "Color Mixer", "HSL Mask") em projeto novo e não misture com Lumetri (ver `video-cor-e-export`).
- Enhance Audio / Enhance Speech / Separate Crosstalk **não têm API** (nem ExtendScript nem UXP 27.0): o MCP
  não aciona. Ver `video-fala-limpa` para as alternativas.
- Quadro de conferência dentro de uma transição parece erro: confira no meio da cena.
- Escala de foto grande: 1920 ÷ altura da foto (2400 px → 80%).
- Render direto (`mode: "sequence"`) bloqueia o app durante todo o render: prefira o Media Encoder.

## 5. Portão

```
[ ] Projeto ativo certo (pr_get_project_info)
[ ] Sem lacunas; efeitos conferidos por pr_list_clip_effects
[ ] Quadros de cada cena olhados; projeto salvo
[ ] Exportação concluída (arquivo final existe)
```

## Medido ao vivo em 18/11/2026 (Premiere 27)

- **Exportar quadro:** o caminho tem de ser nativo (barra invertida); com "/" o Premiere responde "Unknown error
  exception". `pr_export_frame_or_sequence` já converte; em script próprio use `new File(caminho).fsName`.
- **Exportar sequência sem `presetPath`:** usa a predefinição padrão do sistema e confere se o arquivo existe.
- **Legendas (ao vivo 19/11, Premiere 27):** o ExtendScript não enxerga a faixa de legenda (contagem −1); o UXP enxerga faixas e blocos (início/fim), oculta e renomeia. Texto e estilo do bloco não são expostos em nenhum dos dois; selecionar blocos por script não funciona. Criar a faixa só existe no painel antigo (`createCaptionTrack`): pôr o SRT na sequência pelo UXP devolve sucesso e não cria nada.
- **Converter legendas em gráficos** (Gráficos e títulos > Atualizar legendas para gráficos) é só comando de menu: sem caminho por script. Peça o clique à pessoa ou use `pr_captions_as_mogrt`.
- **Modelos da biblioteca do Premiere** ("Captions and Subtitles" e demais gráficos nativos): dá para inserir e animar posição/escala/opacidade, mas o texto é um bloco binário, ilegível por script. Texto por script só em modelo feito no After Effects com o campo exposto (`ae_export_mogrt`).
- **Texto de `.mogrt` pelo UXP não funciona no 27.0** (o parâmetro aparece, o valor vem indefinido); o texto continua pelo painel antigo. O componente do modelo leva um instante para aparecer na cadeia depois de inserir.
- **Vários projetos abertos:** o projeto ativo é o que a pessoa clicou por último, não o que você abriu. Chame `pr_expect_project` antes de escrever e confira `project.name` em todo script cru.
- **Sem abrir painel (CEP 1.3.7):** uma extensão invisível sobe com o Premiere e faz a ponte ExtendScript; não é preciso abrir Janela > Extensões. Se a pessoa abrir o painel visível, ele mostra "Background" e não toma a conexão.
- **Ligar/desligar o MCP por app:** todo painel tem "Desligar MCP neste app" (padrão ligado). Vale só para aquele app, derruba todas as pontes dele em até 2 s e fica guardado até ligar de novo. Se `jradb_get_status` não mostra ponte nenhuma com o app aberto, pergunte se o MCP está desligado no painel antes de mandar reinstalar.
- **Painel UXP:** instala pelo `.ccx` em `release\` (duplo clique). O manifesto precisa de `host` como objeto e ícones PNG válidos (senão erro −4) e de `network.domains: "all"` para conectar em `ws://127.0.0.1:31001`.
- Com dois projetos abertos o ativo é o último criado; não feche nem salve o projeto do usuário.

