---
name: motion-graficos-de-video
description: Criar gráficos de vídeo reutilizáveis no After Effects — lower third, título, cartão de CTA, legenda estilizada, contador/número em destaque — com caixas que se ajustam ao texto e exportar como .mogrt para preencher no Premiere. Use para VSL, entrevistas, reels de fala e qualquer série de vídeos.
---

# motion-graficos-de-video — feito uma vez, usado em todos

Base: `docs/conhecimento/04`, `05`. Antes: `motion-direcao-de-arte`. App: `app-after-effects`,
`app-premiere`.

## 1. Kit típico

| Gráfico | Campos (Essential Graphics) | Duração |
|---|---|---|
| Lower third | Nome, Função | 4–5 s |
| Título | Kicker, Título | 3–4 s |
| CTA | Texto, Endereço | 3–5 s |
| Número em destaque | Número, Legenda | 2–3 s |
| Legenda estilizada | Legenda | por bloco |

## 2. Atalho: receitas

Lower third, título e número em destaque saem prontos em uma chamada, nas cores e fontes do kit e já
auditados: `ae_create_lower_third({ name, role, kitPath, format, mogrtPath })`, `ae_create_title_card`,
`ae_create_counter`. Use a construção manual abaixo quando o design pedir algo diferente.

## 2b. Construção manual (uma comp por gráfico, 1080×1920 ou 1920×1080)

1. Textos com `ae_create_layer` text, alinhamento definido, fonte do kit.
2. **Caixa que acompanha o texto**: camada de forma (retângulo + preenchimento) com expressões
   ```
   Size:     var r=thisComp.layer("Nome").sourceRectAtTime(time,false); [r.width+56, r.height+34]
   Position: var r=thisComp.layer("Nome").sourceRectAtTime(time,false); [r.left+r.width/2, r.top+r.height/2]
   ```
   e posição da camada ligada à do texto. Texto curto ou longo, a caixa se ajusta.
3. Entrada 0,3–0,5 s, saída 0,3 s nos últimos quadros (`ae_set_keyframes` easeInOut);
   revelação lateral pelo pai nulo com escala X 0 → 100 %.
4. Acento de cor da marca (barra, sublinhado); fundo da caixa 75–85 % de opacidade.
5. `ae_get_comp_frame_preview` com o texto mais longo previsto.
6. Depois de `addProperty`, pegue as referências de novo pelo caminho (as antigas invalidam).

## 3. Exportar `.mogrt`

1. Salve o projeto (`ae_manage_project` save).
2. `ae_export_mogrt({ compName, outputPath: ".../03_motion/mogrt/LowerThird.mogrt",
   templateName, properties: [{ layerName: "Nome", name: "Nome" }, { layerName: "Funcao", name: "Funcao" }] })`.
   Cor exposta: `propertyPath` do Fill (ex. `["ADBE Root Vectors Group", 1, …]`, ver `ae_get_property_tree`).
3. Nomes curtos e sem acento nos campos (é o que se digita no Premiere).

## 4. Usar no Premiere

`pr_insert_mogrt({ filePath, timeSeconds, durationSeconds, videoTrackIndex: 1,
values: { Nome: "Junior Rocha", Funcao: "Adobe Community Expert" } })` — a resposta lista os
parâmetros e o que foi preenchido. Confira com `pr_export_frame_or_sequence` (frame).

## 5. Portão de saída

```
[ ] Caixas se ajustam ao texto curto e ao mais longo
[ ] Entrada/saída com easing; dentro da zona segura do formato
[ ] Campos expostos com nomes curtos; .mogrt gerado e aberto no Premiere
[ ] Preenchimento conferido por quadro exportado
[ ] Kit completo salvo em 03_motion/mogrt/
```

## Regras de 18/11/2026

- Legenda: palavra falada destacada com cor, tempo real por palavra (`video-legendas-e-som`).
- Texto em tarja/pílula centralizado pela altura da maiúscula; conferir em quadro exportado.
- Em `ae_execute_extendscript`: sem `beginUndoGroup`/`endUndoGroup`, sem salvar/abrir/renderizar no
  mesmo script. O aviso "Undo group mismatch" não pode aparecer.
- Varie as transições por bloco e destaque os cliques na tela; o básico correto não basta.

## Recorte de pessoa em vídeo (texto atrás de quem fala) — 18/11/2026

Montagem: vídeo → texto/gráfico → **a mesma pessoa recortada por cima**. Formas de obter o recorte:

| Caminho | Como | Automação |
|---|---|---|
| **Máscara de objeto do Premiere** (IA, no computador) | Duplicar o clipe numa trilha acima do texto; ferramenta Máscara de objeto → clicar na pessoa → rastrear; o clipe de cima fica só com a pessoa | Sem API: pelo controle do computador ou a pessoa clica. Caminho preferido em vídeo de fala |
| **Pincel de rotoscopia / máscara de objeto do After** | Traço sobre a pessoa, propagar, **congelar** | Sem API (o congelar não é acionável por script); usar só quando a borda precisa de refino |
| **Chave de cor/luminância** (Keylight, Extrair) | Só com fundo liso e bem iluminado (verde, branco ou cinza infinito) | Scriptável: `ae_apply_effect` — peça gravação em fundo liso quando o efeito for planejado |
| **Conector externo de remoção de fundo de vídeo** | Envia o clipe, volta um vídeo com alfa | Fora do MCP; pedir ok (o arquivo sai da máquina, pode gastar créditos) |
| **Quadro a quadro no Photoshop** | Exportar sequência, Selecionar assunto em lote, reimportar PNGs | Scriptável, lento (≈3 s/quadro) e pode tremer; só para trechos de 2–4 s |

Regras: recortar **só o trecho** do efeito (2–5 s), não o vídeo inteiro; zoom e tremida aplicam-se ao vídeo
e ao recorte juntos; conferir a borda em 3 quadros (cabelo, mãos, microfone); a palavra grande lê melhor
30–55 % coberta.
