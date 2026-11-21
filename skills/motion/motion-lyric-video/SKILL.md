---
name: motion-lyric-video
description: Lyric video e tipografia cinética sincronizada à batida no After Effects (9:16 ou outro formato) — cada palavra cai no tempo, cada linha tem a sua gramática tipográfica e a câmera 3D viaja o tempo todo. Traz o processo com portões (letra conferida, storyboard aprovado, medição da câmera, congelamento), o cardápio de tratamentos, as regras de câmera, a expressão de "pop" e os números de revisão. Use para lyric video, texto no ritmo da música, abertura tipográfica com trilha ou vídeo de frase com batida.
---

# motion-lyric-video — a letra no tempo, a câmera em viagem

Leia antes: `motion-direcao-de-arte`, `motion-fundamentos`, `motion-tipografia-cinetica`, `app-after-effects`.
Origem das ideias: análise da skill externa guardada em `pesquisa/fontes-externas/lyric-video-openart.skill`
(motor próprio em WebGL, só Mac). Aqui fica só o que serve no After Effects, reescrito para as nossas ferramentas.
**Não rodou ao vivo ainda** (docs/16, B62).
As partes que servem a qualquer motion também estão em `motion-fundamentos` (expressões), `motion-transicoes`
(câmera e corte), `motion-direcao-de-arte` (variedade), `motion-tipografia-cinetica` (tratamentos) e
`qa-revisao-video` (medidas).

## 0. Onde cada coisa é feita (regra do usuário, 18/11/2026)

**O que dá para fazer no After Effects, faz-se no After Effects.** Fora do app só o que ele não faz, gerado
pelo assistente e importado. Blender entra quando estiver disponível; **no primeiro teste o Blender fica de fora**.

| Peça | Onde | Como |
|---|---|---|
| Batidas, BPM, compasso, energia por faixa | fora | `media_analyze_audio`; entra como JSON + marcadores |
| Tempo de cada palavra, encaixe na grade, imagem do espectro para conferir | fora | `media_transcribe` (`wordTimestamps`) + ajuste; entra como JSON + marcadores |
| Leitura dos tempos na animação | After | JSON importado como footage de dados ou marcadores; expressões leem dali |
| Aterrissagem, passo com chegada exata, pulso de batida, deriva | After | expressões (§3) |
| Câmera 3D, órbita, dolly-zoom, viagem entre cenas, tremor, soco na batida | After | câmera + nulos + expressões; `ae_camera_transition` |
| Lente olho de peixe em tudo | After | camada de ajuste com Optics Compensation (distorção inversa) sobre a comp 3D; comp interna maior que a saída para não faltar borda |
| Grade/sala 3D com paralaxe, ondulação na batida, névoa | After | sólidos 3D com Grid (chão, teto, paredes), ondulação por efeito na pré-comp do chão, névoa por opacidade conforme a distância à câmera |
| Desfoque de movimento | After | motion blur nativo (ângulo do obturador e amostras por quadro) |
| Extrusão | After | cópias empilhadas em z ou extrusão real do texto no renderizador 3D |
| Texto em anel/torre | After | texto em caminho circular com 3D por caractere (letras em pé), giro pela margem inicial |
| Fontes misturadas, etiquetas, balões, adesivos | After | camadas de texto e forma |
| Tipo preenchido com imagem, mundo de imagem, recortes em planos | After | track matte, plano 3D distante, Keylight ou recorte no Photoshop |
| Partículas, estilhaço, formas quicando | After | CC Particle World, Shatter, formas extrudadas com física em expressão |
| Brilho, aberração cromática, grão, vinheta, glitch, flash | After | efeitos em camada de ajuste |
| Ordem do traço para manuscrito (linha central da letra) | fora (ou Illustrator) | tentar Image Trace em modo traço no Illustrator; se a ordem não servir, o assistente calcula a linha central e entrega o caminho; no After: Trim Paths como máscara do texto e câmera seguindo a ponta |
| Esfera, toro, gema (o que não se extruda) | fora, depois Blender | modelo GLB gerado pelo assistente e importado como camada 3D |
| Imagens e clipes de IA | fora | só com aprovação de custo; nunca com texto dentro |
| Posição de cada palavra na tela no seu tempo, câmera parada | After | script lê a posição projetada e a velocidade da câmera; `ae_audit_motion`, `ae_contact_sheet` |
| Nitidez do quadro de aterrissagem, quadro de flash, quadros sem movimento, pico de áudio, conferência do arquivo final | fora | medidas sobre os quadros e o arquivo renderizados |
| Cortar o trecho, silêncio no fim, render | After / Premiere | linha do tempo e fila de render |

Diferenças para o motor original, a conferir no teste: a lente é uma deformação aplicada depois (em lente
forte a borda perde definição); o motion blur tem teto de amostras, então chicote muito rápido pode mostrar
cópias; anel com muitas letras em 3D por caractere pesa no render.

## 0b. Ferramentas (18/11/2026, testadas ao vivo no After Effects 27)

| Passo | Ferramenta |
|---|---|
| Palavras em 3D com marcador, chegada exata e câmera que viaja | `ae_pop_words` (`wordsPath` ou `words`; `fonts`, `colors`, `sizePattern` alternam por palavra; `camera: false` para sem câmera) |
| Linha em anel de letras em pé que gira até cada palavra | `ae_text_ring` (`times` = tempo de cada palavra; calibrar `standAngle` e `frontOffsetDegrees` na primeira vez) |
| Onde cada palavra cai na tela (portão 3) | `ae_measure_landings` → `pass`, blocos reprovados, pares no mesmo ponto, fora da zona segura |
| Câmera parada ou salto não declarado (portão 3) | `ae_audit_camera` (`cuts` = tempos dos cortes escondidos) |
| Tira de quadros em volta de um corte ou de uma chegada | `ae_contact_sheet` com `aroundSeconds` (12 quadros a 1/60 s) |
| Corte escondido | `ae_camera_transition` (whip, zoom, spin, shake, glitch, flash) |
| Refrão em karaokê | `ae_word_captions` (`singleLayer: true` para uma camada só) |

Medido ao vivo (After Effects 27, 18/11/2026):
- `ae_pop_words` agrupa em **paradas**: palavras com menos de `minGap` (0,4 s) entre si empilham como linhas de um
  bloco e a câmera segura nele; sequência maior que `maxWordsPerStop` (5) é cortada na maior pausa. Uma viagem de
  câmera por palavra (`minGap: 0`) só serve para letra lenta: em ritmo de fala vira borrão.
- A câmera sai de um bloco `travel` (0,45 s) antes do próximo e nunca menos de 0,2 s depois da última palavra.
  As palavras da parada anterior somem quando a próxima chega (`holdStops: 0` mantém).
- Tudo é montado em 92 % da zona segura (deriva da câmera e rotação de assentamento comem alguns px).
- Em texto falado empilhado, a medida de espalhamento em y pode ficar um pouco abaixo de 250 px: registre.
- `ae_text_ring`: padrão `frontOffsetDegrees` 180 para câmera no lado −z; letras em pé com `standAngle` −90.
- Prévia de quadro sai sem a cor de fundo da comp: ponha um sólido de fundo para julgar texto claro.

Ordem: `ae_pop_words` → olhar 3–4 chegadas (`ae_get_comp_frame_preview`) → `ae_measure_landings` → `ae_audit_camera`
→ corrigir → `ae_contact_sheet` nos cortes → render.

## 1. Portões (alguém ou uma medida precisa dizer sim)

1. **Letra conferida pela pessoa.** A pessoa cola a letra (quebra de linha = frase cantada, repetições
   escritas). A transcrição automática só confere: em canto ela erra palavra e adianta o tempo.
2. **Storyboard aprovado antes de animar.** Uma página: janela de tempo, linhas, mundo/cor, tratamento,
   fonte principal, verbo de câmera, momento marcante.
3. **Câmera medida no primeiro rascunho montado** (§5). Vídeo que não viaja volta para as cenas.
4. **Congelamento.** Depois da revisão aprovada nada muda até a conferência do arquivo final.

Respeite também a regra 8 do `index.md` (validar cada etapa ou automático).

## 2. Tempo: de onde vêm os números

- Trecho: 15–35 s, começando 1–2 compassos antes da primeira palavra e terminando **no silêncio**, depois da
  última nota; o último quadro é um pôster parado em leve deriva, não um corte no meio da frase.
- Batidas e BPM: `media_analyze_audio`. Confira se o BPM não saiu em dobro ou metade.
- Palavras: `media_transcribe` com `wordTimestamps` dá o rascunho; o texto vale o da pessoa. Ajuste cada
  início de palavra olhando a forma de onda/espectro; em canto, voz com efeito ou refrão repetido, marque à mão.
- Encaixe na grade de semicolcheia só quando a diferença for pequena (até ~0,03 s); senão use o início real.
- Guarde tudo num JSON (`linha.palavra → início, fim`) e crie marcadores na comp (`ae_manage_markers`).
  A animação lê o tempo do marcador; nunca digite segundos soltos nas camadas.

## 3. Aterrissagem da palavra ("pop")

A palavra chega a 100 % **exatamente** no seu tempo (±1 quadro), passa um pouco e assenta. Expressão de
escala (`ae_set_expression`), com o tempo vindo do primeiro marcador da camada:

```js
var ts = marker.numKeys > 0 ? marker.key(1).time : inPoint;
var lead = 0.08, f = 3.4, z = 0.4, over = 0.14, a = time - ts, s;
if (a <= -lead) { s = 0; }
else if (a < 0) { var x = (a + lead) / lead; s = x * x * x; }
else {
  var w = 2 * Math.PI * f, wd = w * Math.sqrt(1 - z * z);
  var tp = Math.atan2(wd, z * w) / wd, pk = Math.exp(-z * w * tp) * Math.sin(wd * tp);
  s = 1 + over * Math.exp(-z * w * a) * Math.sin(wd * a) / pk;
}
[100 * s, 100 * s]
```

- `over` 0,08–0,15 e 3–6° de rotação que assenta. Uma palavra por vez quando o roteiro pede.
- Toda palavra fica legível parada por ≥ 0,2 s; a última de cada cena descansa ≥ 0,25 s dentro do quadro
  antes da transição; a última do vídeo ≥ 0,55 s.
- A câmera **responde** a cada aterrissagem com velocidade, avanço curto e um pouco de giro, sem mirar um
  canto novo a cada palavra.

## 4. Cardápio de tratamentos (um por linha; nunca dois iguais)

| Tratamento | Quando | No After Effects |
|---|---|---|
| Escada com extrusão | abertura, 3–5 palavras, nota final longa | camadas 3D em x/y/z diferentes, cópias empilhadas em z para o volume, sombra no chão, câmera sobe na última |
| Anel/torre giratória | bloco com mais palavras (15–25), subida até o drop | texto em caminho circular por linha (comp 3D ou CC Cylinder), giro que traz cada palavra à frente no seu tempo, câmera em órbita |
| Bilhete de resgate | linha curta e rápida (≤ 4 palavras) ou palavra longa | cada palavra ou letra com fonte, cor e rotação próprias em etiquetas; entrada por letra em semicolcheias; corte seco com flash |
| Manuscrito | linha íntima de 4–8 palavras, momento calmo | traçado revelado (Trim Paths ou máscara com Stroke), câmera segue a ponta |
| Balões repetidos | palavra repetida, eco, multidão | a mesma palavra em muitas fontes e tamanhos enchendo o espaço 3D; a câmera atravessa; a palavra final engole a tela |
| Título + estilhaço | título cantado ou final instrumental ≥ 4 s | lockup de pôster, quebra no drop (Shatter ou formas), formas quicando no chão nos tempos |
| Letreiro/corredor | segundo bloco longo | faixas de texto em paredes, câmera em travelling |
| Preenchimento karaokê | refrão | contorno que vira preenchimento conforme é cantado (`ae_word_captions` ou máscara) |

Checagem de variedade (tabela cena × tratamento × fonte × gramática de movimento × verbo de câmera × verbo
de entrada): duas linhas não repetem célula; cenas vizinhas não repetem fonte nem verbo de câmera; alterne
mundo claro e escuro; pelo menos uma cena calma entre as fortes; refrão repetido ganha tratamento novo e o
último escala. Meta: 8 famílias de fonte no vídeo, dentro do kit da marca quando houver.

## 5. Câmera (o requisito nº 1)

- Tudo em 3D, em lugares diferentes; a **câmera vai até as palavras**. Desenhe o caminho primeiro e coloque
  o conteúdo onde a câmera vai olhar. O defeito clássico é tudo mexendo no centro com câmera parada.
- Nunca parada por mais de 0,25 s. Pelo menos 3 planos de profundidade para a paralaxe aparecer.
- Vocabulário: avanço/recuo, travelling lateral, grua, órbita, chicote, giro, atravessar o texto, seguir a
  ponta, dolly-zoom, respiro de lente, rampa de velocidade, soco na batida (×2–3 nos acentos), tremor que
  decai depois do impacto, deriva leve nas pausas.
- Movimento grande começa e termina na batida: acelera para o acento, assenta com leve excesso.
- Entre cenas a câmera **viaja**; corte só escondido dentro de um chicote (`ae_camera_transition`), no
  limite exato do quadro, com flash de **um** quadro em cor da paleta.
- Um elemento de cola em todas as cenas (grade, textura, linha de horizonte) que reage à batida sem
  competir com o texto.
- Medida (portão 3): em cada 10 palavras seguidas, o centro de cada palavra no quadro de aterrissagem deve
  variar ≥ 150 px em x e ≥ 250 px em y (desvio-padrão, em 1080×1920), com ≥ 5 enquadramentos e sem duas
  seguidas no mesmo ponto **e** tamanho. Meça por bloco, não só no vídeo inteiro. Use `ae_contact_sheet`
  nos tempos das palavras e `ae_audit_motion`.

## 6. Revisão (olhar quadros, não confiar no relato)

- Julgue o **composto montado**, não a cena isolada: emendas, chicotes e trocas de cor só falham juntos.
- Tira de quadros 1/60 s em volta de cada corte: um quadro de flash, limpos antes e depois.
- Lista de rejeição: câmera parada; palavra fora do tempo; duas linhas com o mesmo tratamento; cor fora da
  paleta ou mistura de meio-tom barrenta; texto borrado no tamanho de descanso; texto lido fora da zona
  segura (9:16: x 60–960, y 220–1540 no momento de leitura); mais de 0,25 s sem movimento; caos em que
  nada se lê; salto não planejado entre quadros; último quadro que não é um pôster.
- Lista de correção com **resultado medido** ("espalhar aterrissagens para ≥ 150 px em x entre 8 s e 13 s"),
  não com receita nem com "melhorar". Uma rodada pequena custa quase o mesmo que uma grande: junte os itens.
- Brilho e glow julgam-se na escala final, não no rascunho reduzido.

## 7. Entrega e retrabalho

- Pico real ≤ −1 dBTP; se passar, reduza a música pelo valor medido e meça de novo.
- Diga qual arquivo serve para quê (mestre para publicar, leve para mensagem).
- A música e a letra são de terceiros: lembre a pessoa de que precisa do direito de uso antes de começar e
  na entrega. Não copie a letra para notas, prompts ou nomes de camada além do necessário.
- Pedido depois da entrega = **versão nova** (`v2`, `v3`) em caminhos novos; nada do que a pessoa já tem é
  sobrescrito. O que ela viu e gostou é ponto fixo: mude o resto primeiro. "Voltar como era" = restaurar o
  arquivo, não refazer de memória.

## 8. Portão de saída

```
[ ] Letra conferida pela pessoa; tempos conferidos na forma de onda
[ ] Storyboard e tabela de variedade aprovados
[ ] Cada palavra aterrissa no seu tempo (±1 quadro) e fica legível ≥ 0,2 s
[ ] Câmera nunca parada > 0,25 s; espalhamento medido por bloco de 10 palavras
[ ] Cortes no limite do quadro; flash de 1 quadro; último quadro é pôster
[ ] Composto revisado em quadros; pico ≤ −1 dBTP; versão em caminho próprio
```
