---
name: motion-continuidade
description: Planejar e animar peças sem "troca de slide" — cada mudança mantém um elemento vivo (forma, cor, linha, objeto) que se transforma no próximo momento, como em motion design de marca. Use para explicativos animados, posts animados com várias ideias, aberturas e vídeos de produto em motion.
---

# motion-continuidade — algo sempre sobrevive à mudança

Antes: `motion-fundamentos`, `motion-direcao-de-arte`. Estilos: `motion-estilos`. App: `app-after-effects`.

## 1. A regra

Entre duas ideias, **um elemento continua na tela e se transforma**: o círculo do ícone vira o ponto do
gráfico, a linha do sublinhado vira a borda do próximo card, a cor de fundo varre e vira o fundo da cena
seguinte. Se tudo some e tudo novo aparece, é slide — e o olho recomeça do zero.

## 2. Planejar no papel (antes do AE)

Tabela de passagem, uma linha por mudança:

| De (momento) | Elemento que sobrevive | Vira | Movimento | Tempo |
|---|---|---|---|---|
| Título | sublinhado | barra do gráfico | estica para cima | 0,6 s |
| Gráfico | barra mais alta | botão do CTA | encolhe e arredonda | 0,5 s |

- 1 elemento-ponte por passagem; os outros saem antes (stagger de 2–3 quadros).
- O elemento-ponte nunca para no meio: chega no destino com easing forte.

## 3. Construção no After Effects

1. Uma composição principal; cada "momento" é um grupo de camadas, não uma pré-composição separada
   (pré-composições quebram a ponte entre elementos).
2. Elemento-ponte numa camada de forma única (`ae_create_shape_layer`); mudança de forma por caminho
   (path) ou por tamanho/raio com `ae_set_keyframes` e `ae_set_property`.
3. Easing: `ae_set_easing` saída rápida e chegada suave (influência 80–90 %).
4. Parentesco: textos e ícones do momento como filhos do elemento-ponte enquanto ele se move
   (`ae_modify_layer` parent), soltos depois.
5. Prévia em 3 quadros por passagem (antes, meio, depois) com `ae_get_comp_frame_preview`; folha com
   `ae_contact_sheet`.

## 4. Ritmo

- Cada momento parado ≥ tempo de leitura (0,3 s por palavra + 0,5 s) antes da próxima passagem.
- Passagens 0,4–0,8 s; mais lentas parecem arrastadas, mais rápidas não se leem.
- Som marca as passagens, não os momentos parados.

## 5. Erros comuns

- Pré-compor cada cena (a ponte se perde).
- Dois ou três elementos-ponte disputando atenção.
- Ponte com movimento linear ou que "pisca" (corta e reaparece).

## 6. Portão de saída

```
[ ] Tabela de passagem com 1 elemento-ponte por mudança
[ ] Nenhuma passagem do tipo "tudo some, tudo aparece"
[ ] Leitura respeitada em cada momento parado
[ ] Easing forte e motion blur nas pontes
[ ] ae_audit_motion sem chaves lineares nem texto sem tempo de leitura
```
