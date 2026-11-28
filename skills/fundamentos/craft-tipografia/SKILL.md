---
name: craft-tipografia
description: Escolher e ajustar tipografia de qualquer peça (post, anúncio, vídeo, slide, impresso) — par de fontes por função, escalas por meio (tela, impresso, vídeo), entrelinha, espaçamento, quebra de título, detalhes, e como aplicar em cada app. Use antes de escrever texto numa peça ou quando o texto "parece amador".
---

# craft-tipografia — escolha, escala e ajuste fino

Leia antes `craft-composicao`. Base: `docs/conhecimento/02`.

## 1. Escolha (por função, depois por fonte)

1. Liste as funções da peça: título, apoio, rótulo/chapéu, CTA, legenda, número.
2. **≤ 2 famílias, ≤ 3 pesos.** Uma com personalidade (título) + uma neutra (resto).
3. Pares seguros: serifada de display + sem serifa neutra · geométrica + monoespaçada para números ·
   mesma superfamília (serif + sans).
4. Contraste tem de ser evidente: duas grotescas parecidas = erro.
5. Use o kit (`plan-brand-kit`). Fonte que não existe na máquina: listar as instaladas
   (script livre no Photoshop: `app.fonts`) e propor substituta declarada.

## 2. Escalas por meio

| Meio | Tamanhos |
|---|---|
| Tela (px) | 12, 14, 16, 20, 24, 32, 40, 56, 72, 96, 128 |
| Post 1080×1440 (ou 1350) | título 80–120 · apoio 26–32 · rótulo/CTA 18–24 (caixa alta) |
| Story/Reels 1080×1920 | título 96–140 · legenda 48–60 · nada < 36 |
| Slide 1920×1080 | título 56–96 · corpo ≥ 28 · nada < 20 |
| Impresso (pt) | corpo 9–11 · legenda 7–8 · mínimo 6 · subtítulo 12–14 · título 18–36 · capa 48+ |

Título ≥ 1,6× o nível seguinte (peça de impacto 2,5–4×).

## 3. Ajustes

| Parâmetro | Regra |
|---|---|
| Entrelinha | display 1,0–1,1 · títulos 1,15–1,25 · corpo 1,4–1,5 |
| Tracking | display grande −2% a −4% (Photoshop/AE: −20 a −40) · corpo 0 · caixa alta pequena +10% a +20% (140–200) |
| Linha | 45–75 caracteres (ideal ~66); coluna estreita 35–45 |
| Alinhamento | à esquerda; centralizado só até 3 linhas; justificado só com hifenização e coluna ≥ 40 caracteres |
| Caixa alta | só rótulos e títulos curtos, sempre com tracking positivo |
| Quebra | por sentido; última linha nunca com uma palavra só; comprimentos decrescentes ou equilibrados |
| Números | tabulares em tabela/preço |
| Detalhes | aspas curvas („…“ em alemão, "…" em PT/EN), travessão, sem espaço duplo |

## 4. No app

| App | Como | Cuidado |
|---|---|---|
| Photoshop | `ps_create_layer` (text) + `ps_edit_text_layer` (tracking, leading, alignment) | Em 72 ppi pt = px. Texto ancora na linha de base: confira bounds com `ps_get_layer_tree` antes de alinhar |
| Illustrator | `ai_create_text` (`createOutlines` só para logo/selo final) | Tracking e alinhamento ainda por script livre |
| InDesign | **Estilos** antes do texto (`id_manage_styles`), `id_create_text_frame` com `format.paragraphStyle` | Tamanhos em pt mesmo com régua em mm; em script livre escreva `"10pt"` |
| After Effects | `ae_create_layer` (text) + `ae_add_text_animator` | Texto nasce alinhado à esquerda no ponto: centralize por script livre (justification) |
| Premiere | Texto vem do AE (Dynamic Link) ou de .mogrt | Nunca texto em imagem |

## 5. Erros comuns

- Seis tamanhos diferentes na mesma peça.
- Título em caixa alta longo e sem tracking.
- Palavra solitária na última linha do título.
- Texto cinza claro sobre foto (ver contraste em `craft-cor`).
- Fonte trocada pelo app sem aviso (confira a camada depois de criar).

## 6. Portão

```
[ ] ≤ 2 famílias, ≤ 3 pesos; escala do meio respeitada
[ ] Título ≥ 1,6× o apoio; nenhuma quebra feia
[ ] Tracking e entrelinha ajustados (não o padrão do app)
[ ] Fontes presentes na máquina (sem substituição)
[ ] Legível reduzido (post a ~400 px; vídeo no celular)
```

## 7. Regras de 18/11/2026 — alinhamento e equilíbrio (conferir sempre)

| Regra | Como fazer |
|---|---|
| Texto dentro de forma (pílula, botão, tarja) centralizado de verdade | O centro é o da **altura da maiúscula**, não o da caixa de texto (que inclui ascendentes e descendentes e deixa a palavra alta). Meça os limites dos glifos de uma maiúscula ("H") ou converta mentalmente: `y_base = centro_da_forma + altura_da_maiuscula / 2`. Use também o alinhar do app (centro vertical em relação à forma). Se ainda parecer alto ou baixo, **ajuste óptico** de 1–3 px. Conferir no zoom, não na miniatura. Ferramentas: `ps_center_text_in_shape` e `ai_center_text_in_shape` (devolvem o espaço em cada lado; `offsetY` para o ajuste óptico). |
| Texto ao lado de ícone (lista, benefícios) e texto em forma no **InDesign** | Caixa de texto com o mesmo topo e a mesma altura do ícone (ou da forma), inset 0, **Opções do quadro de texto > Justificação vertical: Centro** e **Deslocamento da primeira linha de base: Altura das maiúsculas (Cap Height)**. Assim o centro das maiúsculas fica no centro do ícone. No MCP: `frame: { verticalAlign: "center" }` já aplica o Cap Height. (Regra do usuário, 24/11/2026.) |
| Título sem palavra órfã | Nunca uma palavra sozinha na última linha. Estreite ou alargue a caixa (ou quebre à mão) até as linhas ficarem parecidas: diferença de largura entre linhas ≤ ~25 %. |
| Texto de apoio equilibrado | Com 2+ linhas, mesma regra: ajuste a largura da caixa para amenizar a diferença; a última linha não pode ser uma palavra curta. |
| Ritmo vertical | Espaço etiqueta→título, título→apoio e apoio→imagem **semelhantes entre si** (mesmo módulo, ex. 28–32 px em 1080). Medir pelos limites visíveis dos glifos, não pelas caixas. |
| Quebra por sentido | Quebre onde a frase respira (não separe artigo/preposição da palavra seguinte). |
| Bloco de texto com destaque na 1ª linha (regra do usuário, 25/11/2026) | "A melhor internet / para maratonar / suas séries!" é **um texto só**: a 1ª linha muda tamanho, cor e peso, mas o espaço entre ela e a 2ª deve parecer o mesmo das linhas de baixo. Quem manda é a entrelinha do **texto menor**. Prefira uma camada de texto só (estilos por trecho); em camadas separadas, meça o espaço visível entre os glifos (base da linha de cima → topo das maiúsculas da de baixo) e iguale ao das linhas menores. |
| Preço é uma frase só (regra do usuário, 25/11/2026) | "Planos a partir de R$ 59,90/mês" se lê como um conjunto. **R$, ",90" e "/mês" encostados no número**: a distância de cada um até o valor é a mesma que existe entre os algarismos dele (entre o "5" e o "9"). O rótulo ("PLANOS A PARTIR DE") fica a uma distância do valor parecida com a entrelinha do texto de apoio do lado ("para maratonar" ↔ "suas séries!"). Nada de bloco espalhado no cartão: centralize o **conjunto**, não cada peça. Receita: `ps_recipe_price_tag`. Para um bloco de linhas: `ps_center_text_in_shape` com `layerNames` (centra nos dois eixos, mede a forma sem a sombra). |

Receita de equilíbrio: para um título com N linhas, teste larguras de caixa e escolha a que minimiza
a diferença entre a linha mais longa e a mais curta sem aumentar o número de linhas.

Ferramenta: `text_balance_lines` devolve as quebras equilibradas (sem palavra órfã, sem conector no fim da linha); use as linhas como quebras explícitas.
