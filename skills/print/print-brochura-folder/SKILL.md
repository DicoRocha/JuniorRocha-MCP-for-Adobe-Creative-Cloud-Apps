---
name: print-brochura-folder
description: Diagramar folder (dobra em 2 ou 3), brochura e revista curta no InDesign — imposição das faces e da dobra, painéis com função (capa, abertura, miolo, verso), grade e estilos, fluxo de texto entre molduras, imagens em CMYK e saída para gráfica. Use para folhetos dobrados, livretos de 8–32 páginas e materiais institucionais.
---

# print-brochura-folder — cada painel tem uma função

Base: `docs/conhecimento/07`. Antes: `print-fundamentos`, `plan-espelho-impresso` (espelho).
Depois: `qa-preflight-entrega`.

## 1. Formato e dobra

| Peça | Montagem |
|---|---|
| Folder 2 dobras (tri-fold A4) | 2 páginas 297×210 (frente/verso), 3 painéis; o painel que dobra para dentro **2–3 mm mais estreito** (ex. 100 / 100 / 97 mm) |
| Folder 1 dobra (A4 → A5) | 2 páginas A4 deitadas, 2 painéis iguais |
| Brochura / livreto | páginas A5 ou A4 em spreads, **múltiplo de 4** páginas; grampo até ~48 páginas |

Confirme medidas e a ordem dos painéis com a gráfica (gabarito dela vence).

## 2. Painéis (tri-fold)

- **Capa** (face externa, painel direito): marca, promessa, imagem.
- **Verso** (externo, centro): contato, mapa, QR, informações legais — é o que fica para trás.
- **Aba** (externo, esquerdo — 1º painel que se vê ao abrir): gancho/prova.
- **Interno (3 painéis)**: conteúdo principal lido como uma peça.
Faça um boneco em papel ou o espelho com a ordem antes de diagramar.

## 3. Construção

1. `id_manage_document` create com páginas, sangria 3 mm, margem ≥ 5 mm da dobra e do corte.
2. Guias de dobra e colunas por painel (`id_execute_extendscript` com `guides.add`, script curto,
   ou na página-mestre); `id_manage_layers` para separar Guias/Texto/Imagens.
3. Estilos (`id_manage_styles`): parágrafo, caractere, objeto; amostras CMYK (`id_swatches`).
4. Texto corrido: molduras (`id_create_text_frame`) encadeadas com `id_thread_text` (em ordem de
   leitura; livreto longo: `addPagesUntilFits`) e `id_place_file` do texto aprovado; imagens com
   `id_place_file` em molduras.
5. Nada importante cruzando a dobra (exceto imagem pensada para cruzar); texto nunca na dobra.
6. Brochura: capa/contracapa podem ter papel diferente; numeração na mestra e seções com
   `id_manage_sections` (miolo começando em 2, pré-textuais em romanos); sumário com `id_create_toc`
   pelos estilos de título; ordem de leitura conferida.

## 4. Conferir

`id_get_page_preview` de cada página; `id_preflight`; links atualizados e imagens ≥ 250 ppi
efetivos (`id_links`); preto de texto 100 % K; preto de fundo rico (60/40/40/100) só em áreas grandes.

## 5. Saída

PDF/X-4 com marcas de corte e sangria (`id_export` pdf com preset), páginas simples (a gráfica
impõe) salvo pedido contrário; PDF digital em spreads para envio; pacote com `id_package` se a
gráfica pedir o aberto.

## 6. Portão de saída

```
[ ] Formato, dobras e ordem dos painéis conferidos com a gráfica (painel interno mais estreito)
[ ] Cada painel com função clara; nada essencial na dobra
[ ] Estilos aplicados; texto encadeado sem excesso
[ ] Imagens CMYK ≥ 250 ppi; preflight limpo
[ ] Brochura com múltiplo de 4 páginas; PDF/X-4 com sangria e marcas
```
