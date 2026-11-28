---
name: craft-desconstrucao-referencia
description: (beta) Refazer uma arte a partir de uma referência (gerada por IA ou da internet) — desmontar em camadas, decidir o que gerar por IA ou fotografar (separado, sem fundo, sem efeitos embutidos) e o que construir no Photoshop ou Illustrator, gerar os assets, montar o PSD na ordem certa e fazer variações e outros formatos. Use quando a pessoa mostrar uma arte e pedir algo igual, parecido ou uma variação.
---

# craft-desconstrucao-referencia — da referência ao PSD (beta)

Leia junto: `foto-recorte-e-composicao`, `social-post`, `craft-tipografia`, `craft-organizacao-camadas`.

## 1. Desmontar (antes de gerar qualquer coisa)

Liste as camadas **de baixo para cima** e, para cada uma, a origem e o motivo:

| Tipo de elemento | Origem | Regra |
|---|---|---|
| Fundo (ambiente, cor, céu) | IA separada **ou** formas, degradês e desfoque | separado do sujeito. **Mais aberto do que o formato precisa** (ex.: a parede inteira da sala, 16:9 em 4K), como se faz com o sujeito: dá para escolher o enquadramento de cada formato (post, story, horizontal) com a mesma imagem. **Nítido**: o desfoque é feito no Photoshop (Desfoque gaussiano 10–20 px como filtro inteligente). **Com a mesma câmera do sujeito**: sujeito de frente pede **parede de frente** (sem canto da sala em ângulo) |
| Luz (onda, brilho, fumaça, raios) | IA **sobre fundo preto** ou imagem pronta | modo Tela/Clarear; cor ajustada no Photoshop (Matiz/Saturação, Mapa de degradê) |
| Sujeito (pessoa, produto, robô) | IA ou foto, **em fundo sólido da cor predominante do cenário final** (ex.: laranja para um fundo laranja), não cinza | recortado por máscara; a cor certa esconde imperfeições e arestas claras do recorte. Se algo passa **atrás** dele (texto gigante, luz, forma), o recorte é obrigatório |
| Objetos 3D, ícones | 3D ou IA, **nítidos, sem desfoque nem sombra embutidos**, fundo liso | desfoque de movimento, sombra e brilho feitos no Photoshop: rastro atrás **e um desfoque leve no próprio ícone** (dá a sensação de velocidade) |
| Texto, preço, cartões, tags de vidro, linhas, selos, logo | Photoshop ou Illustrator | nunca pedir texto ou logo para a IA |
| Grade de cor final | Photoshop | une tudo |

Escreva o plano em `<pasta>/plano.md` antes de gerar (camadas, prompts, textos, fontes).

### Descreva o sujeito em três níveis (quando o objetivo é copiar)

Antes de escrever o prompt, olhe a referência ampliada e anote:

| Nível | O que observar | Exemplo (robô, 25/11/2026) |
|---|---|---|
| Geral | silhueta, proporção cabeça/corpo, pose, ângulo de câmera, quanto ocupa do quadro | 3/4 para a direita, sentado de pernas cruzadas, cabeça grande |
| Médios | partes e materiais, cores por área, onde há luz própria | casco branco glossy, juntas cinza-escuro, visor preto, anéis azuis nas orelhas, selo "AI" no peito |
| Micro | divisões e encaixes, parafusos, frisos, aberturas, textura, reflexos | **linhas de divisão das placas** no peito, braços e pernas, juntas segmentadas, dedos articulados |

Copie as três colunas para o prompt, em inglês e com as palavras certas ("visible panel lines and seams between
armor plates on the chest, arms and legs"). Sem o nível micro, a IA entrega uma versão "limpa" que
parece outro produto. Na conferência, compare os três níveis lado a lado com a referência, nessa ordem.

### Leia a luz da referência antes do prompt (robô, 25/11/2026)

- **De onde vem a luz e como ela chega.** Luz colorida sem reflexo de softbox na superfície brilhante = luz
  **rebatida e difusa** (uma luz forte bate na parede colorida do fundo e volta suave). Escreva isso no prompt
  ("soft, diffuse red fill bounced off a red wall; no specular reflections or highlight streaks from light
  sources"). "Rim light" ou "backlight" sozinho gera contornos duros e reflexos de softbox.
- **Material:** glossy? o que reflete nele (tela do notebook, luz azul)? tudo que acende tem brilho (bloom)?
- **Reflexos que viram outra coisa:** reflexo da tela no visor parecia uma boca. Proíba no prompt o que pode
  ser lido como traço do rosto ("the visor shows only the eyes, no screen reflection").
- **Chão e escala:** a rocha da referência é enorme (topo de colina ou chão fora de quadro); gere o sujeito
  **com o terreno saindo pelas bordas**, não um objeto isolado no estúdio.
- **Pose:** ângulo de câmera da referência (ex.: "three-quarter view facing right").
- Para corrigir só luz/reflexo mantendo pose e enquadramento: gere de novo **com a imagem anterior como
  referência** ("same robot, same pose, same framing; change only…"). As posições da montagem continuam valendo.

## 2. Prompts dos assets

- Um asset por imagem. Diga o enquadramento (vertical/horizontal) e "fundo liso cinza claro" para recortar.
- Fundo do sujeito: sólido, na cor predominante do cenário onde ele vai entrar.
- Cenário: mesma altura e direção de câmera do sujeito (frontal para sujeito de frente), **largo e nítido**
  ("everything in sharp focus, no blur"), com o centro livre onde o sujeito vai entrar.
- Proíba no prompt o que vai ser feito no app: "sem texto, sem logo, sem desfoque de fundo, sem desfoque de
  movimento, sem sombra no chão".
- Luz: "sobre fundo preto sólido, nada mais na imagem".
- Sujeito: inclua o que ele segura e a roupa da referência; peça foco em tudo.
- Resolução: 4K quando a pessoa pedir; o recorte e os outros formatos agradecem.

## 3. Montagem no Photoshop (testado 25/11/2026, arte Ultra Net)

1. `ps_create_document` no formato pedido (3:4 1080×1440 por padrão).
2. `ps_place_file` de cada asset (Smart Object) dentro da prancheta (`into`): fundo com `fit: "cover"` e
   Desfoque gaussiano no Photoshop; sujeito e objetos com `cutout: true` (Selecionar Assunto como máscara, sem
   crédito generativo — recortou pessoa + sofá laranja sobre laranja e o ícone 3D sem halo).
3. Baixar o asset gerado: `media_download_url { url, filePath }`.
4. Escala e posição pelo rosto/cabeça do sujeito (os limites da camada com máscara são os do recorte).
5. Luz: `blendMode = SCREEN`, atrás do recorte do sujeito, cruzando os dois lados dele.
6. Ícones com movimento: `ps_recipe_motion_trail { layerName, angle, distance: 90, offset: ±30, selfBlur: 12 }`
   — rastro desfocado atrás e desfoque **leve** no próprio ícone (velocidade sem perder a leitura).
7. Cartões: `ps_create_shape` rounded + textos com `ps_create_layer`; bloco de linhas centrado com
   `ps_center_text_in_shape { shapeLayerName, layerNames }`; preço com `ps_recipe_price_tag`
   (`craft-tipografia` §7); **crie cada cartão e seus textos em
   sequência**: se outra camada ficar entre eles na pilha, o `ps_organize_layers` não agrupa (preserva a
   sobreposição). Sombra suave: `dropShadow` com a cor escura do fundo, opacidade 30 %.
8. Grupos (de cima para baixo): Textos, Cartões, Ícones, Pessoa, Luz, Fundo.
9. `ps_save_document` psd **renomeia o documento** para `<nome>.psd`: use esse nome nas chamadas seguintes.

### Acabamento aprendido com a revisão do usuário (robô, 25/11/2026)

- **Margens:** a distância da borda de cima até o título ≈ a da borda de baixo até a última linha de texto
  (na referência, ~105 px e ~100 px em 1080×1440). Meça as duas antes de entregar; texto colado embaixo desequilibra.
- **Tags de vidro (sem exagero):** forma vermelha viva `#FF1A26`, modo **Multiplicação**, **Preenchimento 33 %**
  (não Opacidade), e estilos leves: Brilho externo Tela `#D2070A` 32 % 9 px; Brilho interno Tela `#D2070A` 41 %
  13 px; Traçado interno 2 px em degradê `#D2070A`→branco, ângulo 117°, Tela; Acetinado Multiplicação 18 %.
  Sem chanfro (nem nas tags nem no círculo do ícone). Círculo do ícone **só contorno**: forma sem preenchimento
  (`fillEnabled false`), traço 1 px vermelho `#FF0000`, Sobreposição, preenchimento 85 %, sem estilo.
  "Limpar estilo de camada" também volta o modo para Normal e o preenchimento para 100 %: aplique os dois de novo.
  Para tirar estilos, use "Limpar estilo de camada" (`disableLayerStyle`); um `setd` com descritor vazio
  **não** remove o que já existe.
- **Camadas por contexto:** grupo "Tags de vidro" e, dentro dele, **um grupo por tag** com o vidro, o círculo,
  o ícone, o texto, a linha e os dois pontos daquela tag. Agrupar por script: selecionar os IDs (`slct` com
  `addToSelection`) + `Mk ` de `layerSection` `From` a seleção (mantém o grupo dentro da prancheta).
- **Linhas de chamada:** forma de caminho (como a Caneta em modo Forma), traço 2 px branco sem preenchimento,
  **um trecho diagonal e depois reto** até a tag. Ponto duplo: anel de 18 px (traço 1 px, 90 %) + ponto cheio
  de 10 px. Por script: `pathItems.add` (subcaminho aberto) + `Mk contentLayer` com `strokeStyle`
  (`fillEnabled false`). Ferramenta: `ps_recipe_callout { points, name, groupWith }`.
- **Divisor do rodapé:** duas linhas de 3 px com degradê (branco→azul à esquerda, vermelho→branco à
  direita) e o ponto azul com Brilho externo Tela 59 % 9 px.
- **Texto pequeno sobre a rocha:** Brilho externo **Multiplicação preto 100 % 18 px** no lema (sombra difusa).
- **Sombra embaixo:** elipse preta grande, objeto inteligente com Desfoque gaussiano ~120 px, Multiplicação
  ~60 %, acima do sujeito — escurece a base para o rodapé sem apagar o sujeito (a 100 % engoliu as pernas).
- **Cabeça cobrindo o título:** "with" + "AI" inclinados −7°, "with" alinhado pelo topo do "AI", grupo
  **abaixo** do sujeito. Traços de pincel (largo → fino) feitos no Illustrator e colocados como objeto
  inteligente vetorial. O perfil de largura (`strokeWidthProfile`) não aceita valores por script e nenhum
  pincel padrão afina: desenhe o contorno equivalente.
- **Saturação do sujeito:** Matiz/Saturação **clipada** ao sujeito (vermelhos +35, cianos +45, azuis +40).
- **Recorte com chão até a borda:** Selecionar Assunto pega só o robô e larga a rocha. Use a varinha mágica
  no fundo liso em vários pontos (tolerância ~42, contíguo, somar) + inverter + máscara:
  `ps_selection_and_masks { operation: "maskFromBackground", points, layerName, artboard }`.
- **Janela abstrata / balão / moldura:** retângulos arredondados somados e subtraídos numa forma só
  (`ps_create_path_shape`, modos Combinar e Subtrair forma frontal); no Illustrator, `ai_pathfinder` unir /
  menos frente. A foto entra com máscara de corte na forma; o que "vaza" (cabelo, cadeira) é a cópia recortada
  por cima, sem máscara de corte (`foto-recorte-e-composicao` 1b).

## 3b. Medir e centralizar

- Conjuntos de texto (bloco de 3 linhas, preço) ficam **centrados no cartão nos dois eixos**; as linhas
  continuam alinhadas entre si (à esquerda no bloco). Centralize pelo retângulo que envolve o conjunto.
- Meça a forma com `layer.boundsNoEffects`: `bounds` inclui a sombra projetada e desloca o centro (~10 px).

## 3c. Medir a referência antes de montar (25/11/2026)

- Meça por pixel (cor do fundo, contorno, cartão, botão; bordas de cada forma linha a linha) e converta para o
  formato pedido: 3:4 de uma referência 4:5 = largura × 1,4674 e altura × 1,5652.
- Liste as formas como componentes: "retângulo arredondado menos recorte de cima, menos fenda à direita, menos
  vão embaixo"; balão = dois retângulos + rabicho − vão. Isso vira `items` do `ps_create_path_shape`.
- Olhe onde o sujeito **passa por cima** da forma (cabelo, cadeira, cabeças sobre o contorno): é pop-out
  (`foto-recorte-e-composicao`, janela com vazamento parcial).
- Marcas e selos de terceiros (logo do cliente da referência, Google Play, App Store): use marca inventada e
  texto; os selos oficiais a pessoa coloca a partir dos arquivos da Google e da Apple.

## 4. Outros formatos (recompor)

**Um PSD só, uma prancheta por formato** (`ps_artboards`), nomeadas (`Post 3x4 1080x1440`,
`Story 9x16 1080x1920`), com os mesmos Smart Objects; exportação por prancheta (regra do usuário, 25/11/2026).

Por ferramenta (testado 25/11/2026):
- Crie a 1ª prancheta (`ps_artboards` create, fundo de cor sólida), monte tudo nela e **duplique a prancheta
  inteira**: `ps_artboards { operation: "duplicate", source, newName, width, height }` (nomes sem " copy").
- Reenquadre as camadas na cópia (o fundo largo permite escolher outro trecho da mesma imagem).
- **Não** duplique camadas para dentro de grupos de outra prancheta (`duplicate(grupo)` de grupo falha e
  `move(grupo, INSIDE)` joga a camada para fora das pranchetas).
- Exporte com `ps_artboards` export (uma imagem por prancheta, com o nome dela).
- **Camada de degradê estraga ao duplicar a prancheta** (o Photoshop recalcula a posição considerando as
  duas pranchetas). Faça o fundo como **retângulo do tamanho da prancheta + Sobreposição de degradê** (radial,
  alinhar com a camada) — a duplicação não mexe. Ferramenta: `ps_recipe_gradient_background { artboard, sun }`. Se usar camada de degradê, corrija a posição à mão depois.
- **Disco de luz ("sol") atrás do título:** o disco tem a **mesma cor do centro do degradê** (Sobreposição de
  cor) e só aparece porque o degradê **escurece de verdade fora dele**. Medido em 1080×1440 (canal R): dentro
  do disco ~200–210, logo fora ~155, cantos ~105–125, laterais ~130. Degradê radial que pode servir de ponto de partida:
  `#D8060A` 0 % → `#B00206` 39 % → `#8A0106` 73 % → `#6A0105` 100 %, escala 105 %, deslocado −12 % para cima.
  Borda clara demais engole o disco. Meça dentro, fora e nos cantos antes de entregar.
  O disco é **nítido**: forma de elipse com desfoque de 0–1 px, só para suavizar a aresta (18 px virou brilho
  e deixou de parecer um sol).
- **Confira o tamanho do retângulo:** o raio do degradê radial sai do centro da forma; retângulo maior que a
  prancheta desloca o centro e escurece um lado (aconteceu: 3072 px em vez de 1080).
- **Nunca apague "pelo nome" depois de renomear:** `getByName` devolve a primeira camada com aquele nome (a
  nova). Apague pelo tipo ou pela referência guardada.
- **Copiar estilo entre documentos** pelo descritor (`executeActionGet` de um documento, `setd` em outro)
  falha calado: monte o descritor com os valores lidos.

Story 9:16 (1080×1920) com chão até a borda: expanda a imagem do sujeito para baixo (Magnific
`images_expand` 2:3, fonte no topo), use a expansão só como base da rocha e ponha a imagem 4K por cima,
recortada nela, com fade de ~140 px na base. Confira a expansão: uma das duas saiu com a rocha flutuando.
Conteúdo do post sem reduzir, **centrado na área segura** (250–1520 px).

Story 9:16 a partir de foto: `resizeCanvas` no centro, fundo em `cover`, aumente o sujeito a partir da
cabeça até ele passar da borda de baixo (sem base de sofá, tapete ou pés cortados à vista), títulos abaixo de
250 px do topo, cartões terminando acima de 1520 px; texto legal pequeno ganha sombra quando cai sobre a foto.

## 5. Download dos assets gerados

`media_download_url { url, filePath }` baixa pelo próprio MCP. Se ele não estiver disponível, o painel UXP do
Photoshop também baixa (`ps_execute_uxp_script` com `fetch` + `require("fs").writeFile("file:" + caminho, buf)`).

## 6. Portão de saída

```
[ ] plano.md escrito antes de gerar; cada asset tem origem e motivo
[ ] Nenhum asset com texto, logo ou desfoque embutido
[ ] Recortes por máscara, sem halo; luz atrás do sujeito em Tela
[ ] Fundo na mesma vista de câmera do sujeito; sujeito gerado em fundo da cor do cenário
[ ] Textos em bloco e preço lidos como um conjunto (craft-tipografia §7)
[ ] Formatos como pranchetas nomeadas num PSD só; PNG de cada prancheta
[ ] Sujeito descrito em geral, médios e micro detalhes (placas, encaixes, texturas)
[ ] Luz lida na referência (direta x rebatida/difusa, reflexos, bloom) e escrita no prompt
[ ] Margem de cima ≈ margem de baixo (medidas)
[ ] Disco/sol visível: fundo mais escuro fora dele (medido)
[ ] Efeitos de camada contidos (preenchimento baixo, estilos leves); fundo em retângulo + sobreposição de degradê
[ ] Comparado lado a lado com a referência (snapshot); diferenças anotadas
[ ] Referência de outra marca: só para estudo/variação, não publicar como dela
```
