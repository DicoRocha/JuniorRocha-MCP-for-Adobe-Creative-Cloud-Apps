---
name: craft-organizacao-camadas
description: Organização de arquivos editáveis por sentido — o que vira grupo e o que fica solto no Photoshop, Illustrator e InDesign (ícone + texto, texto sobre shape, listas, cards), nomes de camadas e pastas, e o equivalente no After Effects (pré-comp, nulo pai, rótulos) e no Premiere (bins e trilhas). Use em toda peça que cria ou muda camadas, antes de entregar.
---

# craft-organizacao-camadas — tudo em pastas, por sentido

Arquivo entregue com 40 camadas soltas está mal entregue, mesmo que a imagem esteja certa. Quem abre
o arquivo precisa achar cada parte em segundos. Regra do usuário (23/11/2026): **o que pertence junto
pelo sentido forma grupo; um objeto sozinho não.**

## 1. O que vira grupo

| Situação | Grupo | Nome |
|---|---|---|
| Texto sobre shape (botão, selo, tarja, etiqueta de preço) | texto + shape | `Rótulo – Saiba mais` |
| Ícone ao lado ou acima do texto dele | ícone + texto | `Item – Entrega rápida` |
| Ícone + título + descrição embaixo | os três | `Item – Entrega rápida` |
| Vários itens iguais em coluna (lista) | grupo pai com um grupo por item | `Lista (3 itens)` |
| Vários botões lado a lado | grupo pai com os rótulos | `Botões (2 botões)` |
| Card (fundo do card + foto + textos dele) | tudo do card | `Card – Plano Pro` (automático) |
| Vários cards iguais | grupo pai | `Cards (3)` |
| Cabeçalho (logo + menu), rodapé (contatos + redes) | por bloco | `Cabeçalho`, `Rodapé` |
| Logo feito de várias partes (símbolo + nome) | as partes | `Logo` |

## 2. O que NÃO vira grupo

- **Objeto sozinho:** um logo de uma camada, um título, uma foto, um fundo. Grupo com um item só esconde.
- **Fundo da peça** (cobre quase tudo): fica na base, solto e com nome `Fundo`.
- **Camadas de ajuste e luz geral** (curvas, gradiente de leitura): ficam acima do que corrigem, com nome.
- Grupo que obrigaria mudar a ordem de empilhamento (outra camada entre os membros, por cima deles):
  não agrupe, a imagem mudaria.
- Não aninhe mais de 3 níveis (Peça > Lista > Item). Mais que isso ninguém acha nada.

## 3. Nomes e ordem

- Nome de camada diz **o que é**, não o tipo: `Título`, `Preço`, `Foto produto`, nunca `Camada 12`,
  `Retângulo 3`, `Forma 1 cópia`.
- Na lista de camadas, a ordem de cima para baixo segue a leitura da peça (topo da peça em cima).
- Língua dos nomes: a do usuário (português aqui).
- Versões por formato (feed, story) em pranchetas/grupos separados com o nome do formato.

## 4. Como fazer em cada app

**Photoshop:** as receitas (`ps_recipe_social_set`, receitas do InDesign) já saem agrupadas. Peça montada
à mão: `ps_organize_layers { documentName }` mostra o plano (dry-run); confira e rode com
`apply: true`. Cada grupo é um passo de histórico. Ao **criar** a peça, já crie dentro de grupos
(`ps_create_layer layerType: "group"` e depois mova as camadas para dentro) em vez de organizar no fim.
`ps_audit_document` avisa `UNGROUPED_RELATED` quando sobram camadas relacionadas soltas.

**Illustrator:** `ai_organize_objects` (mesmas regras, dentro de cada camada). Camadas do AI por
função (`Fundo`, `Arte`, `Texto`, `Guias`) e grupos por sentido dentro delas. Grupo de recorte só para
recortar, não para organizar.

**InDesign:** `id_organize_objects { page }` por página. Em diagramação longa prefira **camadas**
(`Texto`, `Imagens`, `Fundo`) + estilos de parágrafo/objeto; agrupe só blocos que se movem juntos
(card, anúncio, box com ícone). Texto encadeado não se agrupa com outra coisa.

**After Effects:** não existe pasta de camadas. O equivalente:
- Pré-comp por **cena** ou por **elemento repetido** (card, item de lista que entra igual 3 vezes).
  Não pré-componha o que precisa ser animado por fora (perde o acesso rápido às chaves).
- Ícone + texto que andam juntos: **nulo pai** `CTRL Item 1` (as chaves ficam no nulo).
- Rótulo de cor por função (texto, forma, controle, áudio) e nomes claros (`Título`, `CTRL Cena 2`).
- **Menos camadas:** fill e stroke da mesma forma numa camada só; formas que andam juntas como grupos dentro de
  uma shape layer. Camada nova só quando precisa de efeito, matte, pai ou 3D próprios.
- Projeto em pastas: `01 Comps`, `02 Pre-comps`, `03 Midia`, `04 Audio`, `05 Solidos`.
- `ae_organize_project` (plano) → `apply: true`: pastas por tipo, rótulos de cor por função, nomes no lugar dos
  padrões (`CTRL …` para nulos) e lista de pares preenchimento/contorno que deviam ser uma camada.

**Premiere:** organização é de bins e trilhas:
- Bins: `01 Sequencias`, `02 Video`, `03 Audio`, `04 Graficos`, `05 Imagens` — `pr_organize_project` (plano) →
  `apply: true` move o que está solto na raiz; bins que já existem ficam como estão.
- Trilhas com função fixa: V1 vídeo principal, V2 cobertura (B-roll), V3 gráficos e legendas;
  A1 voz, A2 trilha, A3 efeitos. Nomeie as trilhas assim.
- Sequência com nome do formato e versão (`Reels 9x16 v2`).

## 5. Portão

```
[ ] Nenhuma camada relacionada solta (audit sem UNGROUPED_RELATED, ou explicado)
[ ] Nenhum grupo de um item só; no máximo 3 níveis
[ ] Nomes dizem o que é; ordem segue a leitura
[ ] A imagem não mudou depois de organizar (snapshot antes e depois)
```
