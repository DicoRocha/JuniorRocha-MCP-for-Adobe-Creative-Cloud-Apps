---
name: social-carrossel-seamless
description: Carrossel sem emendas (seamless, panorâmico, infinito) para Instagram — um painel contínuo cortado em cards de 1080 px; fundo e imagens atravessam as emendas, texto e logo ficam dentro das margens de um card. Photoshop (documento largo + script de corte e exportação) ou Illustrator (pranchetas coladas). Use quando a pessoa pedir carrossel e escolher "sem emendas".
---

# social-carrossel-seamless — um painel contínuo, N cards

Leia antes: `roteiro-carrossel` (o texto de cada card), `social-carrossel` (regras de série, capa, texto),
`craft-composicao`, `craft-tipografia`.

## 0. Pergunte o tipo antes de começar

Quando a pessoa pedir um carrossel sem dizer qual, pergunte uma vez:

> O carrossel vai ser de **cards individuais** (cada slide independente) ou **sem emendas** (seamless: um
> painel contínuo que passa de um card para o outro)?

- Individuais → `social-carrossel` (pranchetas separadas, `ps_artboards`).
- Sem emendas → esta skill. Depois pergunte onde fazer (Photoshop ou Illustrator) se a pessoa não disser.

## 1. Números (Instagram)

| Item | Valor |
|---|---|
| Card | **1080 × 1350** (4:5, padrão) · 1080 × 1440 (3:4, aceito) · 1080 × 1080 (1:1) |
| Tela larga | **cards × 1080** de largura × altura do card (5 cards 4:5 = 5400 × 1350) |
| Quantidade | 2 a 20 cards; o efeito aparece a partir de 4; 5–10 é o usual |
| Proporção | o primeiro card define a de todos |
| Grade do perfil | mostra a capa cortada em 3:4: em 4:5 somem ~34 px de cada lado do card 1 |
| Margem segura | **80 px** de cada borda do card (mínimo 64) — vale também dos dois lados de cada emenda |
| Exportação | **PNG**, exatamente 1080 de largura, nomes `<prefixo>_01 … _NN` (zero à esquerda, ordem de postagem) |

O Instagram mostra uma faixa do card seguinte na borda direita: é ela que convida a deslizar. Por isso a
borda externa do card 1 (esquerda) e do último (direita) fica calma, sem elemento importante.

## 2. Regras de composição

1. **Fundo, formas e fotos atravessam as emendas; texto e logo nunca.** Uma palavra cortada entre dois
   cards não se lê, e cada card é visto sozinho na tela.
2. **Ponte em cada emenda:** pelo menos um elemento cruza cada divisão (forma, linha, foto, cor de fundo
   contínua) — é o "ímã" que puxa para o próximo card. Uma emenda sem nada cruzando parece corte.
3. **Elemento na emenda não divide no meio quando é o foco:** rosto, produto ou número fica inteiro num
   card; o que cruza é corpo de forma, linha, gradiente, mão, sombra. Divisão 50/50 só em forma simples.
4. **Cada card funciona sozinho:** confira o card 1 (capa, gancho) e o último (CTA) isolados.
5. **Fluxo da esquerda para a direita:** linha, seta ou caminho que conduz o olho para a emenda seguinte.
6. Mesma grade de texto em todos os cards (título na mesma linha de base, número no mesmo canto) —
   `social-carrossel` §5.
7. Foto atravessando: use imagem com resolução para a tela inteira (5400 px de largura para 5 cards);
   não amplie uma foto de 1080 para cobrir três cards.

## 3. Photoshop (preferido para foto)

1. `ps_recipe_carousel_setup` `{ count, ratio: "4:5", margin: 80, psdPath }` — cria a tela larga com guias
   nas emendas, nas margens de cada card e no corte 3:4 da capa, a camada **Fundo continuo** e um grupo
   **Card NN - textos** por card. Salve o PSD mestre (`ps_save_document`) e `jradb_checkpoint`.
2. Construa: fundo e fotos (Smart Object, regra do PSD mestre) por cima da tela inteira; textos e logo
   dentro do grupo do card, entre as guias de margem. `ps_get_canvas_snapshot` da tela inteira.
3. `ps_recipe_carousel_split` `{ outputFolder, prefix, format: "png" }` — o script interno: confere a
   largura (múltiplo exato de 1080), procura texto/logo nas emendas (`seamIssues`; nomes com
   logo/marca/brand contam como logo), duplica o documento, achata, corta card a card em pixel inteiro e
   exporta `<prefixo>_01.png …` sem mexer no PSD de trabalho. Com problema nas emendas ele avisa; corrija
   e rode de novo (`allowTextOnSeams: true` só se a pessoa quiser assim).
4. **Nunca use a ferramenta Fatia (Slice) nem fatias do Salvar para Web:** têm limite de largura (8192 px) e
   não servem para carrossel longo. O corte é sempre duplicar → achatar → recortar cada card → exportar,
   como faz `ps_recipe_carousel_split`.
5. Nunca redimensione os cards depois do corte nem a tela larga para uma largura que não seja múltiplo do
   card: aparece fio de 1 px ou degrau na emenda.

## 4. Illustrator (preferido para vetor)

1. `ai_recipe_carousel_artboards` `{ count, ratio: "4:5", margin: 80, filePath }` — N pranchetas lado a
   lado **sem espaço** (01…NN), camada **Arte** e camada travada **Guias** com as margens. (Em arquivo
   existente: Objeto > Pranchetas > Reorganizar todas, espaçamento 0.)
2. Desenhe as formas de fundo passando por cima das bordas das pranchetas; texto e logo dentro das guias.
3. Exporte cada prancheta: `ai_export_assets` (PNG, 72 ppi, usar pranchetas) — 1 pt = 1 px.
4. Foto no Illustrator: PSD vinculado (regra do PSD mestre).
5. Limite: a área de trabalho tem ~16 383 pt; 15 cards de 1080 cabem, mais que isso faça no Photoshop.

## 5. Erros comuns

- Texto ou logo cortado na emenda (o erro nº 1).
- Largura que não é múltiplo de 1080 → cards com 1 px a mais/menos, fio na emenda.
- Exportar a tela larga e cortar no celular/no app de postagem (recompressão e corte impreciso).
- JPEG com compressão diferente por card → emenda com tom diferente. Use PNG, todos iguais.
- Capa com título encostado na lateral: some no corte 3:4 da grade.
- Esquecer a ordem: nomes sem zero à esquerda ordenam `1, 10, 2`.

## 6. Portão de saída

```
[ ] Tela = cards × 1080; cards exportados com 1080 px exatos, PNG, _01…_NN
[ ] Nenhum texto/logo nas emendas nem na margem de 80 px (seamIssues vazio)
[ ] Cada emenda tem um elemento que cruza; o foco (rosto, produto) fica inteiro num card
[ ] Capa e último card funcionam sozinhos; capa legível no corte 3:4
[ ] Folha de contato dos cards em sequência conferida (qa-revisao-visual)
[ ] Conferido num rascunho do Instagram no celular, quando possível
```
