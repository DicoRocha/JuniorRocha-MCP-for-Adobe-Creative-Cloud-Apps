---
name: motion-direcao-de-arte
description: Definir a linguagem de movimento de uma peça antes de animar — tom × energia, personalidade com números (duração, overshoot), família de easing, unidade de tempo, família de transição, stagger, hierarquia herói/apoio/textura, contenção e continuidade — e gravar numa ficha que vale para a peça inteira. Use no início de qualquer motion, vídeo com grafismo ou campanha com várias peças animadas.
---

# motion-direcao-de-arte — a linguagem antes das chaves

Execução: `motion-fundamentos`. Base: `docs/conhecimento/04` §11.

## 1. Escolha a célula (tom × energia) — uma só

| | Suave | Seco |
|---|---|---|
| **Calmo** | Luxo, bem-estar, editorial: lento, eases longos, pausas generosas | Clínica, finanças, tecnologia premium: deliberado, limpo, sem pressa |
| **Cinético** | Lúdico, lifestyle, infantil: elástico, overshoot | Esporte, hype, games: cortes rápidos, estalos, overshoot na batida |

Saúde e odontologia: **calmo** (suave ou seco). Nunca cinético-seco.

## 2. Personalidade (números)

| Personalidade | Duração de entrada | Overshoot | Lê como |
|---|---|---|---|
| Premium | 350–600 ms | 0% | elegante |
| Corporativa | 200–400 ms | 0–3% | limpa, confiável |
| Lúdica | 150–300 ms | 10–20% | divertida |
| Enérgica | 100–250 ms | 15–30% | ousada |

## 3. Ficha da peça (preencha antes de animar)

```markdown
# Direção de motion · <peça>
Célula: calmo-suave | … · Personalidade: premium
Easing: entrada easeOut (influência 80) · saída easeIn (70)   ← máx. 2 curvas
Unidade de tempo: 0,4 s (micro 0,2 · entrada 0,4 · grande 0,8)
Transições: só fusão e corte por semelhança (sem wipe/zoom)
Stagger: 80 ms, de cima para baixo
Intensidade: deslocamento ≤ 40 px · escala 94→100% · overshoot 0
Pausa mínima: ≥ 0,4 s depois de cada momento; marca ≥ 1 s
Herói: <elemento> · Apoio: <…> · Textura: <…>
Momento "uau" (um só): <…>
```

Grave em `03_motion/direcao-motion.md` e siga em todas as comps e no Premiere (transições
escolhidas lá também seguem a família).

## 4. Hierarquia

- **Herói:** o movimento mais forte, cai na batida (ex. o título revelando).
- **Apoio:** menor, entra depois, sai do caminho (chapéu, CTA).
- **Textura:** quase subliminar (respiração do selo, grão, push lento da foto).
- Dois elementos disputando o olho no mesmo quadro → rebaixar um.

## 5. Contenção

- Não animar o quadro inteiro de uma vez.
- Não empilhar transição sobre transição (ex. dissolve no Premiere + fade dentro da comp no mesmo ponto).
- Não animar em laço um texto que está sendo lido.
- Sem overshoot em conteúdo sério; **um** momento "uau" por peça.

## 6. Continuidade

Em peça de produto ou campanha, prefira que algo **sobreviva** a cada troca (o anel do selo
vira o enquadramento da cena seguinte; a cor de destaque passa de um elemento a outro) a
trocar de cena como slide.

## 7. Exemplo (campanha "Ohne Eile", 13/11/2026)

Calmo-suave, premium · entrada 0,5–0,8 s easeOut · fusão, mergulho no preto e "film dissolve" ·
push lento nas fotos (82→90% em 3,5 s) · desfoque 30→0 na entrada da 1ª cena · anel desenhando
(1,1 s) + título revelando letra a letra · respiração ±2% no selo.

## 8. Portão

```
[ ] Ficha preenchida e salva antes de animar
[ ] Uma célula, uma personalidade, ≤ 2 curvas
[ ] Hierarquia herói/apoio/textura definida
[ ] Um único momento "uau"; nada em laço durante a leitura
[ ] Transições do Premiere da mesma família
```

## Descrever um motion com precisão e pré-visualizar (18/11/2026)

Aprendido do guia "Claude Animations" (Upscale) e do HyperFrames:

- **Descrição em quatro partes** antes de montar: (1) formato e duração; (2) **a cena**, com tamanhos, cores
  e tempos exatos de cada elemento; (3) curvas nomeadas por papel (chegada, deslizar, pouso com leve
  ultrapassagem); (4) marca (cores, fontes) e conferências.
- **Conferências fixas:** nada cortado nas bordas; texto nítido; **o último quadro funciona como imagem
  parada** (serve de miniatura e de fim de laço); cada quadro depende só do tempo (sem acaso), para o
  resultado se repetir igual.
- **Laço curto:** ~2 s de movimento + ~1 s parado no último quadro, para selos, logos e números.
- **Prévia antes do After (modo "validar cada etapa"):** quando a pessoa quer aprovar a ideia antes da
  montagem, mostre um rascunho animado simples do movimento na conversa (blocos e tempos, sem acabamento)
  e só depois construa no After Effects. Não é entrega; é para decidir rápido.
- Repertório de ideias: `motion-estilos/references/catalogo-de-ideias.md`.

## Câmera e variedade em vídeo de várias cenas (18/11/2026, da análise do lyric video)

**Câmera (quando a peça é 3D):**
- O defeito clássico é tudo mexendo no centro com a câmera parada. Desenhe o caminho da câmera **primeiro** e
  coloque o conteúdo onde ela vai olhar.
- Pelo menos **3 planos de profundidade** (frente, meio, fundo) para a paralaxe aparecer.
- A câmera **responde** ao acento com avanço curto e um pouco de giro, sem mirar um canto novo a cada elemento.
- Movimento grande começa e termina na batida: acelera para o acento, assenta com leve excesso.
- Um elemento de cola em todas as cenas (grade, textura, linha) que reage ao ritmo sem competir com o texto.
- Vocabulário para a ficha: avanço/recuo, travelling, grua, órbita, chicote, giro, atravessar, seguir, dolly-zoom,
  respiro de lente, rampa de velocidade, soco na batida, tremor que decai, deriva leve.

**Tabela de variedade (preencher antes de animar; reprova se duas linhas repetem célula):**

| cena | tratamento | fonte principal | gramática de movimento | verbo de câmera | verbo de entrada |
|---|---|---|---|---|---|

Cenas vizinhas não repetem fonte nem verbo; alterne mundo claro e escuro; uma cena calma entre as fortes;
elemento repetido (refrão, bordão) ganha tratamento novo e o último escala; abertura e final podem rimar de
propósito. Mostre a tabela à pessoa antes da parte cara (regra 9 do `index.md`).
