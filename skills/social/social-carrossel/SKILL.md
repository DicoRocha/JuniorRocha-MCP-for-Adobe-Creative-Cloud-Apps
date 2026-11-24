---
name: social-carrossel
description: Produzir carrossel de cards individuais (Instagram, LinkedIn, 5–10 slides, 3:4 1080×1440 por padrão, 4:5 ou 1:1) no Photoshop ou Illustrator a partir do roteiro — pergunte antes se são cards individuais ou sem emendas (seamless → social-carrossel-seamless) e quantos cards; template com camadas nomeadas, uma prancheta por slide, continuidade entre slides, exportação numerada 01…N e folha de contato. Use depois de roteiro-carrossel, para qualquer carrossel.
---

# social-carrossel — do roteiro aos PNG numerados

Leia antes: `roteiro-carrossel` (o texto de cada slide), `craft-composicao`, `craft-tipografia`.

## 0. Regras de 18/11/2026 (valem acima do resto desta skill)

- **Pergunte o tipo e a quantidade** quando a pessoa não disser: "cards individuais ou sem emendas (seamless)? E quantos
  cards: você define ou eu decido pelo conteúdo?" (máximo 20 no Instagram). Sem
  emendas (um painel contínuo que atravessa os cards) segue `social-carrossel-seamless`; esta skill é a
  dos cards individuais.
- **Pergunte onde fazer** quando a pessoa não disser: carrossel pode ser feito no Photoshop ou no
  Illustrator. Uma pergunta, antes de começar.
- **Um arquivo só.** No Photoshop o carrossel é **um PSD com uma prancheta por slide** (`01`…`N`), nunca
  um PSD por slide. No Illustrator, um `.ai` com N pranchetas. Exportar todas de uma vez
  (`ps_artboards` export / `ai_export_assets` por prancheta).
- **Fotos de pessoa em fundo infinito:** depois de olhar as fotos, pergunte se quer o fundo preservado
  ou a pessoa recortada (sem fundo). Recorte: `foto-recorte-e-composicao`.
- **Bloco de texto:** etiqueta, título e texto de apoio com **o mesmo espaço entre si**; título sem
  palavra sozinha na última linha; linhas equilibradas (ver `craft-tipografia` §7).
- **Texto dentro de forma** (etiqueta, botão, número): centralizado pela altura da maiúscula, conferido
  no zoom (ver `craft-tipografia` §7).
- **Capa:** sem orientação da pessoa, a imagem da capa mostra **o problema** (a arte, a tela, o erro),
  em destaque; a foto da pessoa, se entrar, fica menor (selo redondo). O texto da capa já fala do problema.
- **Foto com corte** (braço, mão ou corpo cortado na borda da foto): não solte no layout onde o corte
  aparece. Encoste o corte na borda da peça; se não der, coloque a foto dentro de círculo ou quadrado
  arredondado, ou escolha outra foto.
- **Ordem lógica:** siga a ordem em que a pessoa vive o processo (abrir a arte → perceber que é uma
  camada só → passos → resultado). Releia a sequência como quem nunca viu o recurso.
- **Print do momento certo:** cada print tem de ser do trecho do vídeo que o slide descreve (o "antes"
  não pode mostrar o texto já convertido). Monte uma folha de quadros com o tempo e escolha por ela.
- **Exportar:** Arquivo > Exportar > Exportação rápida como PNG exporta cada prancheta em um arquivo.
- **Print de tela:** use captura direta ou quadro reto e nítido; quadro de celular filmando monitor só
  com correção de perspectiva e nitidez, e avise.

## 1. Antes

- Roteiro aprovado em `00_briefing/roteiro-carrossel.md`.
- Proporção: **3:4 (1080×1440)** por padrão (4:5, 1080×1350, só se for publicar por agendador/API da Meta). O primeiro slide define a proporção de todos.
- Kit de marca e fotos tratadas (`foto-saida`, 2160–2400 px, sRGB).
- `jradb_get_status`; pasta `02_design/carrossel/` (o MCP cria pastas ao salvar).

## 2. Template (slide 2 em diante)

1. `ps_create_document` 1080×1440, 72 ppi, RGB.
2. Camadas nomeadas, sempre as mesmas: **Fundo · Foto (Smart Object) · Protecao · Numero ·
   Titulo · Texto · Progresso · Marca**.
3. Grade fixa: margens 64 px; número do passo no mesmo canto; título na mesma linha de base em todos.
4. `ps_get_canvas_snapshot` → corrigir → salvar como `carrossel_template_v01.psd`
   (`ps_save_document`) e `jradb_checkpoint`.

A capa (slide 1) é desenhada à parte: título maior, imagem mais forte, sem número.

## 3. Produzir os slides

Para cada slide do roteiro:
1. Duplicar o template (script livre curto: `app.activeDocument.duplicate("slide_03")`).
2. Trocar a foto: `ps_smart_object` replaceContents.
3. Trocar textos: `ps_edit_text_layer` por `layerName` (texto, e se preciso tamanho).
4. Reposicionar o bloco de texto pela base (o texto ancora na linha de base; leia bounds com
   `ps_get_layer_tree`, mova com `ps_transform_and_manage_layer` translate).
5. `ps_get_canvas_snapshot` (maxDimension 800) — olhar cada slide.
6. Salvar PSD e exportar PNG: `.../02_design/carrossel/psd/slide_03.psd` e `.../exports/03.png`.
   Com um PSD de pranchetas (`ps_artboards` create, uma por slide, nomes `01`…`10`), exporte todos
   de uma vez: `ps_artboards` export com `fileNamePattern: "{{name}}"`.

Use `jradb_batch` (app photoshop) para agrupar as edições de um slide numa só ida.

## 4. Continuidade entre slides

| Técnica | Como |
|---|---|
| Elemento que atravessa a borda | Carrossel sem emendas: `social-carrossel-seamless` (`ps_recipe_carousel_setup` → `ps_recipe_carousel_split`) |
| Número grande | Camada "Numero" no mesmo canto, 160–240 px, cor de destaque com 20–40% de opacidade |
| Barra de progresso | Retângulo na base com largura = slide/N × área útil |

## 5. Regras

| Item | Valor |
|---|---|
| Palavras por slide | ≤ 40 (capa ≤ 8 no título) |
| Título | altura de letra ≥ 5% da altura (≥ 72 px em 1440) |
| Margem lateral | ≥ 64 px (a grade do perfil corta a capa para 3:4) |
| Exportação | sempre PNG, nomes `01.png … 10.png` |
| Marca | pequena, mesmo canto, a partir do slide 2 (capa limpa) |

## 6. Erros comuns

- Cada slide com layout diferente ("parece outro perfil").
- Texto encostado na borda ou cortado na capa pela grade do perfil.
- Exportar fora de ordem ou com nomes que a plataforma ordena errado (`1, 10, 2`).
- Esquecer de olhar a folha de contato: a série só se julga junta.

## 7. Portão de saída

```
[ ] N slides na mesma proporção; nomes 01…N
[ ] Capa funciona sozinha; CTA só no último
[ ] Grade, tipo, cor e posição de número idênticos
[ ] Continuidade visível entre slides
[ ] PSD de cada slide salvo; PNG exportados
[ ] Folha de contato conferida (qa-revisao-visual)
```
- No Illustrator, exporte com `ai_export_artboards` (Exportar para telas); no Photoshop, `ps_artboards`
  com `operation: "quickExport"` (Exportação rápida como PNG).
