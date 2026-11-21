---
name: design-adaptacao-formatos
description: Derivar uma arte-chave para outros formatos (4:5 → 9:16, 1:1, 1,91:1, A5/A4 impresso) recompondo, não esticando — reenquadrar a foto, mover a hierarquia, ajustar tamanhos de tipo e zonas seguras, em Photoshop ou InDesign. Use quando o pedido pedir "versão story", "todos os formatos", "adapta para…", ou numa campanha multipeça.
---

# design-adaptacao-formatos — recompor para cada proporção

Leia `craft-formatos` (tamanhos e zonas seguras). Mantém: cor, tipo, ponto focal, mensagem.
Muda: posição, escala e enquadramento.

## 1. Ordem

1. Arte-chave aprovada (normalmente 4:5).
2. Lista de destinos com pixels/mm (`craft-formatos` → `references/formatos.md`).
3. Para cada destino: duplicar → mudar a tela → recompor → olhar → salvar.


> Regra de produção: variantes saem de **cópia do documento, da prancheta ou do grupo inteiro**, adaptada depois;
> nunca camada por camada entre documentos, salvo quando for estritamente necessário (ver `app-photoshop`, 3b).

## 1b. Primeiro rascunho automático

`ps_recipe_social_set({ documentName, formats, outputFolder })` monta todos os formatos a partir da arte-chave
(nomeie camadas de fundo como "Fundo"/"Foto" e o recorte do sujeito com "Motiv"/"sujeito"/"produto" para o ponto
focal). Ela **não substitui o design**: leia a auditoria de cada prancheta e recomponha à mão onde ela acusar
texto pequeno, contraste ou blocos apertados (formatos baixos como 1,91:1 quase sempre pedem layout próprio).

## 2. Photoshop (tela)

1. Duplicar o documento (script livre curto: `app.activeDocument.duplicate("…_9x16_v01")`).
2. `ps_modify_canvas` resizeCanvas para o tamanho novo (não `resizeImage`: isso estica).
3. Fundo: preencher a área nova com a cor de fundo da peça (camada Background).
4. Foto: escalar para **cobrir** a nova tela (`ps_transform_and_manage_layer` scale) e reposicionar o
   sujeito no terço certo. Em 9:16 sobra altura: suba o sujeito e use a base para o texto.
5. Proteção de texto: refaça o degradê para a nova altura (não esticar o antigo).
6. Texto: reempilhar de baixo para cima (CTA → apoio → título → chapéu) com a mesma escala de
   espaçamento; aumentar 10–20% em 9:16 (tela vista mais de perto).
7. `ps_get_canvas_snapshot` → conferir zona segura → salvar PSD + exportar. Formatos como pranchetas de um
   só PSD (`ps_artboards` create) saem juntos com `ps_artboards` export (`{{name}}` = formato).

| De 4:5 para | O que fazer |
|---|---|
| 9:16 (1080×1920) | Sobem 570 px: foto maior e mais alta; texto acima de ~400 px da base; nada nos 250 px do topo |
| 1:1 (1080×1080) | Perde 270 px: título pode ir para o lado da foto; cortar apoio se não couber |
| 1,91:1 (1200×630) | Layout lado a lado: foto à esquerda/direita, texto no outro lado; título mais curto |
| Impresso A5/A4 | Refazer no InDesign (`print-flyer-cartaz`) com a foto em alta e o PSD vinculado |

## 3. InDesign (impresso a partir do digital)

- Não amplie o JPG de 1080 px: use a foto tratada original (`foto-saida`, ≥ 300 ppi efetivos).
- Textos por estilo; tamanhos em pt (`craft-tipografia`).
- Selo/logo vinculados (.ai).

## 4. Regras

- Mesmo ponto focal em todos os formatos (rosto/produto não some no corte).
- A hierarquia pode mudar de lugar, nunca de ordem (título continua o maior).
- Recompor ≤ 20 minutos por formato; se precisar refazer tudo, o formato pede outra arte.
- Nomes: `cliente_campanha_peca_FORMATO_v01` (4x5, 9x16, 1x1, 191x1, A5).

## 5. Erros comuns

- `resizeImage` deformando a foto ou o texto.
- Texto na faixa coberta pela interface do story (topo/base).
- Mesmo tamanho de tipo do feed num story (fica pequeno).
- Degradê de proteção esticado que deixa uma faixa dura.

## 6. Portão

```
[ ] Cada formato com pixels exatos e zona segura respeitada
[ ] Foto cobrindo a tela, sujeito inteiro, nada esticado
[ ] Hierarquia na mesma ordem; tipo ajustado ao formato
[ ] PSD por formato + exportação nomeada
[ ] Folha de contato com todos os formatos lado a lado
```

## Regras de 18/11/2026

- Adaptações de formato de uma arte (feed 4:5, 1:1, stories 9:16, capa etc.) ficam **no mesmo PSD,
  uma prancheta por formato** — nunca um arquivo por formato. Duplique a prancheta aprovada e adapte.
- Exportação sempre em PNG, uma por prancheta.
