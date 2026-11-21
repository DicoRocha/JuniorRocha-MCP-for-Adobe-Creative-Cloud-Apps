---
name: plan-moodboard
description: Montar uma prancha de estilo (moodboard) no Illustrator ou InDesign a partir de referências — imagens, paleta, tipos, texturas e palavras-chave — para alinhar a direção visual antes de produzir. Use quando pedirem "moodboard", "referências", "prancha de estilo" ou ao abrir uma campanha nova.
---

# plan-moodboard — alinhar o olhar antes do primeiro layout

Antes: `plan-briefing`. Depois: `plan-conceito-criativo`, `craft-filosofia-visual`. Base: `docs/conhecimento/01` e `02`.

## 1. Material

- 9–15 referências no máximo: 1 prancha boa > 40 imagens soltas. Cada uma com o motivo ("luz", "tipo",
  "enquadramento"), não "achei bonito".
- Referências de terceiros são **só internas**: nunca vão para peça publicada.
- Fotos do próprio cliente entram primeiro (mostram o que já existe).

## 2. Estrutura da prancha (A3 paisagem ou 1920×1080)

| Zona | Conteúdo |
|---|---|
| Topo | Nome da direção + 3 palavras-chave (ex. "calmo, clínico, humano") |
| Centro (60 %) | Grade de imagens de mesmo espaçamento, 1 imagem âncora maior |
| Faixa de cor | 5–6 cores com HEX (amostradas das imagens ou do kit), a de destaque marcada |
| Faixa de tipo | Título e corpo nas fontes propostas, tamanhos reais |
| Rodapé | "Faz / não faz" em 3 linhas cada |

## 3. Illustrator (preferido para prancha solta)

1. `ai_manage_document` create em RGB; `ai_manage_artboards` para A3 paisagem ou 1920×1080.
2. Imagens: `ai_execute_extendscript` curto com `placedItems.add()` por arquivo, ou arraste pela pessoa.
3. Grade: `ai_align_distribute` (mesmo espaçamento) e `ai_modify_objects` para tamanhos.
4. Paleta: `ai_create_shape` (quadrados) + `ai_swatches` (grupo "Direção A").
5. Tipos: `ai_create_text` com a fonte proposta; conferir com `ai_get_artboard_preview`.

## 4. InDesign (quando virar documento de apresentação)

`id_manage_document` create A3 paisagem → molduras com `id_place_file` (ajuste proporcional) →
`id_swatches` → textos com estilos (`id_manage_styles`) → `id_export` PDF leve para envio.

## 5. Duas direções, não cinco

- Mostre 2 direções contrastantes (ex. "editorial claro" × "noturno contrastado"). Mais de 3 confunde.
- Cada direção cabe numa prancha; a escolhida vira a base do `kit-de-marca.json` (`plan-brand-kit`).

## 6. Erros comuns

- Paleta inventada sem relação com as imagens.
- Imagens com estilos que brigam (foto clara + ilustração neon) sem explicação.
- Prancha publicada como se fosse a campanha.

## 7. Portão de saída

```
[ ] 9–15 referências com motivo escrito
[ ] Palavras-chave, paleta com HEX e tipos na prancha
[ ] "Faz / não faz" preenchido
[ ] No máximo 3 direções, cada uma numa prancha
[ ] Prévia conferida (ai_get_artboard_preview ou id_get_page_preview) e PDF exportado
```
