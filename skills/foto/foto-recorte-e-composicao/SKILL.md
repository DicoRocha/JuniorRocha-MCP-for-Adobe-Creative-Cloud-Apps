---
name: foto-recorte-e-composicao
description: Recortar sujeito ou produto e compô-lo em outro fundo de forma crível no Photoshop — máscara não destrutiva, bordas difíceis (cabelo, vidro), casar luz, cor, perspectiva e grão, sombra de contato e texto atrás do sujeito. Use para montagens, capas, anúncios e fundos trocados.
---

# foto-recorte-e-composicao — parece que estava lá

Base: `docs/conhecimento/03`. Ver também `foto-produto`, `social-thumbnail`.

## 1. Recorte (sempre por máscara)

Asset gerado por IA para recortar: peça o sujeito em **fundo liso da cor dominante do cenário** onde ele vai
entrar (laranja num fundo laranja) — o Selecionar Assunto separou pessoa + sofá laranja de um fundo laranja
sem halo (25/11/2026), e qualquer resto de borda some no cenário. Atalho para colocar e recortar de uma vez:
`ps_place_file { filePath, into, cutout: true }`.

Atalho: `ps_recipe_remove_background({ filePath | documentName, cropToSubject, padding, psdPath })` faz
os passos 1–2 numa cópia do documento inteiro (Smart Object + máscara do Remover Fundo) e **salva em PSD**
(`<foto>_recorte.psd`): é esse PSD que entra no Illustrator, InDesign, After e Premiere. PNG (`outputPath`) só
para entrega final na web,
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

O Remover Fundo do Illustrator não é acessível por script. Por isso o **Photoshop só recorta** e salva um **PSD**
com a máscara editável (`<foto>_recorte.psd`); o PSD entra **vinculado** no Illustrator e **as máscaras de recorte
são feitas lá**. Ajuste a máscara depois no Photoshop e o Illustrator atualiza o vínculo:

1. Photoshop: Remover Fundo → **trim** no assunto (`cropToSubject`) → PSD. Menos sobra transparente
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

### Janela abstrata com vazamento parcial (testado 25/11/2026, posts "Define it yourself" e escola)

Quando a forma é uma janela (retângulos arredondados somados e subtraídos) e só **uma parte** do sujeito vaza
(cabelo e cadeira à esquerda e no recorte de cima, cabeças acima do contorno):

1. Forma: `ps_create_path_shape` (add/subtract) · Illustrator: retângulos arredondados + Pathfinder menos frente.
2. Foto inteira com máscara de corte na forma, **sem desfoque**. Regra (usuário, 25/11/2026): quando há uma
   cópia recortada do sujeito por cima do próprio cenário, **não desfoque o cenário** — o desfoque espalha o
   sujeito borrado para fora do recorte e cria uma borda/halo em volta dele (aparência amadora). Desfoque de
   fundo só quando o sujeito e o fundo são imagens separadas.
   Janela com **todos os cantos arredondados** (convexos e côncavos): `ps_create_path_shape` com `type: "polygon"`
   e raio por vértice; somar e subtrair retângulos arredondados deixa pontas onde as formas se cruzam.
3. Cópia recortada por cima, **sem** máscara de corte: Selecionar Assunto **∩ polígono da área que pode vazar**
   (janela + lado/topo onde o vazamento faz sentido), com os **mesmos cantos arredondados da janela** — um limite
   de cantos retos deixa o braço da cadeira cobrir o canto arredondado. Por script: caminho → `makeSelection`
   em interseção com o assunto. Sem o limite, cadeira e corpo aparecem pelos vãos de baixo.
4. **Duplicar uma camada recortada (clip) gera outra recortada:** solte a cópia (`Ungr`) para ela aparecer fora.
5. **Mover a camada move a máscara junto** (vinculada): depois de mover a foto, a área do vazamento desce e
   o sujeito aparece fora da janela. Desvincule a máscara (`userMaskLinked: false`) ou refaça-a depois de mover.
6. Foto que aparece dentro **e** fora da janela (janela só com contorno, como no post da escola): **o mesmo
   tratamento dentro e fora** — a foto inteira um pouco mais escura (preto ~25 % sobre ela, recortado na foto da
   janela e na cópia do pop-out para o contorno verde continuar vivo), sem diferença de claro/escuro nem de
   desfoque entre dentro e fora, e um **degradê de baixo para cima** (preto 85 % → transparente na metade) que
   escurece só a base. As camadas na mesma escala e posição; gere a imagem **mais aberta** (ou expanda para baixo
   no Magnific) para cobrir a prancheta inteira nessa escala.
7. Illustrator: foto colocada com grupo de recorte pela janela; PSD recortado (`ps_recipe_remove_background`,
   `cropToSubject: false` para alinhar com a foto) **vinculado** e recortado pelo mesmo limite arredondado.
   Trocar o caminho de recorte de um grupo: depois, `caminho.clipping = true` **e** `grupo.clipped = true`
   (sem isso o limite aparece como forma preenchida por cima da foto).

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

## 4b. Vinheta (ensinada pelo usuário, 25/11/2026)

Valoriza o assunto: escurece o que não queremos que a pessoa olhe e deixa no tom original (mais claro, por
contraste) o que ela deve ver. Na maioria das vezes não deve ser notada — pode ser forte, desde que não se perceba
a forma que faz a sombra.

1. Seleção do que fica no tom original: normalmente uma elipse, mas pode ser o assunto com a seleção **expandida**
   (maior que ele).
2. Inverter a seleção e criar uma camada de ajuste nela: Matiz/Saturação (luminosidade, ex. −42), Curvas ou Níveis.
3. Na máscara do ajuste, **Feather (Difusão) de 60 px ou mais** nas propriedades da máscara (não destrutivo):
   80 px em 1080×1440; arquivo maior, feather maior. A transição tem de esconder a forma.
4. **A vinheta escurece só o fundo, nunca o assunto** (correção do usuário, 25/11/2026): uma **cópia recortada do
   assunto vai por cima da vinheta**. Sem ela, onde a elipse alcança as pessoas (cabelo, braços, mochila nas
   bordas) elas escurecem junto. Ordem: foto/cenário → Vinheta → assunto recortado → escurecimento geral
   (se houver) → cartões e textos.
Ferramenta: `ps_recipe_vignette { aboveLayer, shape: "ellipse" | "subject", bounds, adjustment, amount, feather }`
— por padrão (`protectSubject: true`) já cria a camada "Assunto sobre a vinheta" a partir de `aboveLayer`/`subjectLayer`.
Se já existe um recorte do assunto (ex.: depois do fundo desfocado sem halo), passe `protectSubject: false` e
coloque a vinheta **abaixo** desse recorte.

## 4c. Fundo desfocado sem halo (ensinado pelo usuário, 25/11/2026)

Desfocar um cenário que ainda tem as pessoas espalha as pessoas borradas para fora do recorte → halo. Antes:
1. Selecionar o assunto na camada do cenário e **expandir ~10 px**.
2. Tirar as pessoas do fundo: ferramenta **Remover** (IA) — ocultar antes todas as camadas de cima, porque ela usa
   tudo o que está visível; ela cria uma camada só com a correção: selecionar fundo + correção e **Carimbar
   (Ctrl+Alt+E)** ou duplicar as duas e Mesclar. Sem o Remover: **Preenchimento sensível ao conteúdo**.
3. Converter a camada limpa em objeto inteligente e desfocar (Desfoque gaussiano ou Desfoque de campo).
4. Assunto recortado do cenário original por cima.
Com janela e pop-out já montados (post "Define it yourself"): faça a placa limpa a partir da foto da janela,
deixe-a recortada na janela no lugar da foto (a original fica oculta embaixo) e mantenha a cópia recortada do
pop-out por cima — não crie outra. Para o Illustrator, exporte a placa limpa desfocada como PNG e troque o vínculo
da foto no grupo de recorte (`relink`, mesma caixa).
Ferramenta: `ps_recipe_background_blur_clean { layerName, expand: 10, radius, addSubject }`.
- **Padrão `method: "contentAware"`**: preenchimento sensível ao conteúdo, local, sem crédito. Testado ao vivo
  (25/11/2026, posts da escola e "Define it yourself"): sem halo no cabelo nem no perfil.
- **`method: "remove"`** (ferramenta Remover, IA, preenche melhor): **pode gastar créditos generativos da Adobe da
  pessoa — pergunte antes** e só passe `allowGenerativeCredits: true` com o "sim" dela. São dois passos:
  `step: "prepare"` (oculta tudo acima do cenário, seleciona o assunto +10 px) → a pessoa clica **Remover** na
  barra contextual → `step: "finish"` com os `hiddenLayerIds` (carimba cenário + "Remove tool edits",
  objeto inteligente, desfoque, mostra as camadas de novo). O "prepare" foi testado; o "finish" ainda não ao vivo.
- `addSubject: false` quando o documento já tem a cópia recortada por cima (pop-out): a placa limpa entra no lugar
  da foto, recortada na janela.


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
