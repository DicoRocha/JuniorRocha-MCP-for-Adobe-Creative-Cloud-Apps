---
name: foto-recorte-e-composicao
description: Recortar sujeito ou produto e compô-lo em outro fundo de forma crível no Photoshop — máscara não destrutiva, bordas difíceis (cabelo, vidro), casar luz, cor, perspectiva e grão, sombra de contato e texto atrás do sujeito. Use para montagens, capas, anúncios e fundos trocados.
---

# foto-recorte-e-composicao — parece que estava lá

Base: `docs/conhecimento/03`. Ver também `foto-produto`, `social-thumbnail`.

## 1. Recorte (sempre por máscara)

Atalho: `ps_recipe_remove_background({ filePath | documentName, cropToSubject, padding, outputPath })` faz
os passos 1–2 numa cópia do documento inteiro (Smart Object + máscara do Remover Fundo, PNG transparente),
devolve a caixa do sujeito e avisa quando nada foi removido. As bordas difíceis (passo 4) continuam à mão.


1. Camada da foto como Smart Object (`ps_smart_object` convert ou `ps_place_file`).
2. `ps_selection_and_masks` selectSubject → addMaskFromSelection.
3. Confira a borda sobre fundo branco **e** preto (camada solidColor temporária abaixo):
   halo claro/escuro = máscara a ajustar.
4. Bordas difíceis:
   - cabelo/pelo: Selecionar e Máscara do app (pela pessoa) ou aceitar leve suavidade;
   - vidro/transparência: máscara em cinza (opacidade parcial), não preto/branco;
   - movimento/desfoque: borda suave combina com o desfoque da foto.
5. Nunca apagar pixels; máscara editável sempre.

## 1b. Out of bounds / pop-out (a pessoa "sai" da forma)

Pedidos típicos: "out of bounds", "pop-out", "saindo do círculo", "quebrando a moldura", "efeito 3D na foto".

A ideia é sempre a mesma: a forma corta o corpo; uma cópia do recorte, só da linha de corte para cima, fica
por cima e "sai" da forma.

### No Photoshop — `ps_recipe_pop_out`

`ps_recipe_pop_out({ filePath | documentName, inPlace | layerName, shape, shapeColor, overflow, cutAt, keepBackground, background, outputPath, psdPath })`

- Sem `inPlace`/`layerName`: trabalha numa cópia do documento.
- Com `layerName` (ou `inPlace` na camada ativa): monta **no próprio documento**, no lugar da camada da foto —
  é o caso da foto dentro de uma arte em andamento. As outras camadas não mudam. Se a camada já tem máscara, ela
  é aproveitada (`cutout: "auto"`).
- Grupo resultante, de cima para baixo: **<foto> top** (cópia sem máscara de corte, máscara preta do corte para
  baixo) → **<foto>** (recorte com máscara de corte na forma) → **Shape** (forma viva).
- `keepBackground: true`: dentro da forma aparece a foto original **com o fundo**; só a cópia de cima fica
  recortada.

À mão: recorte (seção 1) → `ps_create_shape` abaixo da pessoa → máscara de corte da pessoa na forma → duplicar
a pessoa acima, soltar a máscara de corte → na máscara da cópia, selecionar do corte até o fim e preencher de
preto → agrupar.

### No Illustrator — `ai_recipe_pop_out`

`ai_recipe_pop_out({ filePath, keepBackground, shape, shapeColor, strokeColor, strokeWidth, overflow, cutAt, placeHeight })`

O Remover Fundo do Illustrator não é acessível por script. Por isso o **Photoshop só recorta** e salva um PNG
transparente; a imagem entra no documento do Illustrator e **as máscaras de recorte são feitas lá**:

1. Photoshop: Remover Fundo → **trim** no assunto (`cropToSubject`) → PNG transparente. Menos sobra transparente
   = caixa da imagem justa, mais fácil de editar à mão depois.
2. Illustrator, num grupo: **Subject top** (grupo de recorte: retângulo justo na parte visível — largura do
   assunto, do topo até a linha de corte — + a imagem) e **Subject** (grupo de recorte cuja máscara é a própria
   forma + a imagem).
3. A cor de preenchimento e o contorno da forma são aplicados **depois** de criar a máscara de recorte: ao virar
   máscara o caminho perde preenchimento e contorno, então pintar antes não adianta. Não há forma separada atrás.

Quando **não** usar o trim: se a ideia é manter o **fundo original** da foto dentro da forma (`keepBackground`).
Aí são duas imagens do quadro inteiro, alinhadas: a foto original (com fundo) dentro da forma e o recorte só do
assunto por cima. O quadro inteiro é o que garante o alinhamento entre as duas.

Já tem o PNG recortado? `filePath` com `cutout: "no"`. A imagem já está no documento (sem fundo)? `imageName`.

### Ajustes (os dois apps)

- Pouca coisa saindo: aumente `overflow` (ou posicione a forma com `shapeBounds`).
- Braço/objeto cortado reto fora da forma: ele cruza a linha de corte fora da forma. Desça `cutAt` ou alargue a
  forma (`shapeScale`).
- Mover a forma reposiciona o efeito sem refazer nada; a linha de corte se ajusta na máscara/retângulo da cópia
  de cima.
- Cabelo e bordas difíceis: mesmas regras da seção 1.
- Acabamento opcional: contorno ou sombra na forma, fundo, texto atrás da pessoa.

## 2. Casar com o fundo

| Aspecto | Como conferir | Como corrigir |
|---|---|---|
| Direção da luz | sombras do fundo e do sujeito apontam igual | espelhar o fundo, ou D&B no sujeito |
| Cor/temperatura | branco do sujeito e do fundo | `ps_adjustment_layer` curves/colorBalance **cortada** no sujeito (`clipToBelow: true`) |
| Contraste e pretos | pretos do sujeito vs. fundo | curves cortada (pretos iguais) |
| Perspectiva e altura da câmera | linha do horizonte vs. olhos do sujeito | escolher fundo com câmera na mesma altura |
| Nitidez e grão | 100 % de zoom | desfoque leve no fundo; `applyAddNoise` 1–3 % em tudo |
| Escala | objetos conhecidos | `ps_transform_and_manage_layer` scale |

## 3. Sombras

- **Contato**: escura e curta onde o sujeito toca o chão (pincel/elipse com blur 5–15 px, multiply).
- **Projetada**: só se a luz do fundo for direcional; mesma direção e suavidade das sombras da cena.

## 4. Texto atrás do sujeito

Duplique a foto acima do título → selectSubject → máscara na cópia (`addMaskFromSelection`).
Título fica entre a foto e o recorte. Confira se a parte escondida do texto ainda deixa ler.

## 5. Grão e unificação final

Camada de ajuste no topo (curves leve ou colorLookup a 15–25 %) + grão uniforme: une tudo.
Olhe a 100 % e em tamanho de celular (`ps_get_canvas_snapshot` 400 px).

## 6. Portão de saída

```
[ ] Máscara editável; sem halo em fundo claro e escuro
[ ] Luz, cor, pretos, perspectiva e escala coerentes (tabela conferida)
[ ] Sombra de contato presente
[ ] Grão/nitidez uniformes
[ ] Se for publicidade: montagem não induz a erro sobre produto ou resultado
```
