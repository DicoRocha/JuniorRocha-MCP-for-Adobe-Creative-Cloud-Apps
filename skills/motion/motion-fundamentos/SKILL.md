---
name: motion-fundamentos
description: Fluxo obrigatório e regras de ofício para qualquer animação no After Effects — salvar e inspecionar, representação mais simples, tempos em quadros, easing com significado, coreografia e stagger, tempo de leitura, conferência de quadros e entrega (render ou Dynamic Link). Use antes de animar qualquer coisa (título, logo, post animado, abertura, lower third).
---

# motion-fundamentos — como animar bem no AE

Leia junto `motion-direcao-de-arte` (a linguagem da peça). Base: `docs/conhecimento/04`. 30 fps.

## 1. Fluxo obrigatório

1. **Projeto salvo antes de tudo:** `ae_manage_project` save com `filePath` em `03_motion/`
   (projeto novo com alterações pendentes → `PROJECT_DIRTY`: salvar ou `discardChanges: true`).
2. **Insumos:** PSD em camadas → `ae_manage_project` import `importAs: "compCroppedLayers"`
   (vira comp com as camadas, posições preservadas). AI/PNG para selos.
3. **Representação mais simples:** texto nativo (`ae_create_layer` text), formas em shape layer
   (`ae_create_shape_layer`), efeitos nativos. Nada de texto dentro de imagem.
4. **Poucas chaves, com curva:** `ae_set_keyframes` com `easing` (nunca linear em movimento principal).
5. **Checkpoint** antes de mudança estrutural ou script longo: `jradb_checkpoint` app after-effects.
6. **Conferir quadros:** `ae_get_comp_frame_preview` em início, pico, transição, fim — ou `ae_contact_sheet`
   (grade com a animação inteira) para ver ritmo e layout de uma vez.
7. **Salvar** (`ae_manage_project` save, em chamada própria) e **entregar** (seção 6).

## 2. Tempo (30 fps)

| Fase | Quadros | Uso |
|---|---|---|
| Estalo | 2–4 | flash, corte |
| Ação rápida | 8–12 | entradas |
| Ação cinematográfica | 18–30 | revelação lenta |
| Assentamento | 6–10 | após overshoot |
| Leitura | 30–90 | tempo de ler |

Leitura: **~3 palavras/s + 0,5 s**. Marca e informação-chave paradas **≥ 1 s** depois de assentar.
Na dúvida, mais lento.

## 3. Easing

| Intenção | `easing` | Influência |
|---|---|---|
| Entrada | easeOut na chegada (chave final com influência 75–90) | 60–90 |
| Saída | easeIn | 60–80 |
| Reposicionar, câmera | easeInOut | 66–80 |
| Linear | só opacidade e rotação contínua | — |

Opacidade resolve antes da posição (posição 0–12 q, opacidade 0–6 q). Overshoot só no elemento
focal, só escala ou rotação, 5–10%.

Chaves já criadas (preset, PSD animado, ajuste fino): `ae_set_easing` nas camadas — `strong` (85) para
entradas com cara de expo, `smooth` (60) para reposicionar, `snappy` (95/20) para pancadas no ritmo,
`hold` para cortes secos de texto; `side: "in"` mexe só na chegada.

## 4. Coreografia

- Espinha: **construir → assentar → segurar**.
- Ordem: herói primeiro; rótulos e números depois.
- Stagger 50–100 ms (1,5–3 q) por elemento; sequência total < 2 s; saídas em ~2/3 do tempo das entradas.
- Um floreio por batida; não entrar com opacidade + posição + escala + rotação ao mesmo tempo.
- Preferir revelação por máscara (`ae_add_mask`), traço (`ae_create_shape_layer` com `trimPaths`
  + `ae_set_keyframes` no Trim End) e animador de texto (`ae_add_text_animator`) a fade em tudo.

## 5. Receitas testadas (13/11/2026)

| Receita | Como |
|---|---|
| Revelar título letra a letra | `ae_add_text_animator` properties `{opacity:0, position:[0,40], blur:[12,12]}`, selector `rampUp`, animate offset −100→100 em 1,2 s |
| Desenhar anel/arco | shape com `trimPaths {end:0}` → keyframes em `["ADBE Root Vectors Group",1,"ADBE Vectors Group","ADBE Vector Filter - Trim","ADBE Vector Trim End"]` 0→100 em ~1 s |
| Brilho suave | `ae_apply_effect` "ADBE Glo2" (radius 30, intensity 0,6) |
| Respiração | `ae_set_expression` em Scale: `s = 100 + 2*Math.sin(time*2); [s, s]` |
| Degradê de proteção para título | Sólido escuro + `ae_add_mask` retângulo cobrindo a base com `feather [0, 380]`; projeto em 16 bits para evitar faixas |
| Título fade-up | Posição +30–40 px → 0 (easeOut) e opacidade 0→100 em 0,5–0,8 s |

Texto nasce alinhado à esquerda no ponto: para centralizar, script livre curto
(`td.justification = ParagraphJustification.CENTER_JUSTIFY`). Selo AI escalado: ligar
`collapseTransformation` (rasterização contínua).

## 6. Entrega

| Destino | Como |
|---|---|
| Premiere (peça única) | Dynamic Link: `pr_import_media` com o `.aep` e `aeCompNames` |
| Premiere (modelo reutilizável: título, lower third, legenda animada, CTA) | `.mogrt`: salve o projeto → `ae_export_mogrt` (`properties`: camadas de texto e controles com nomes curtos) → `pr_insert_mogrt` com `values`. Textos dinâmicos: use parágrafo/caixa com alinhamento definido e animação por *range selector* (o texto novo herda a animação). |
| Arquivo | `ae_render_queue` (o módulo de saída pode trocar a extensão — use o `outputPath` devolvido); render pronto = arquivo existe com a duração certa |
| Alfa | ProRes 4444 / sequência PNG |

## 7. Não fazer

- Script longo que edita várias comps **e** salva no fim (travou o AE em 13/11): um passo por chamada; salvar à parte.
- Pedir prévia pesada sem salvar.
- Declarar pronto sem olhar quadros.

## 8. Portão

```
[ ] Projeto salvo e checkpoint feito
[ ] Nada linear no movimento principal; stagger e assentamento
[ ] Texto legível pelo tempo de leitura; marca parada ≥ 1 s
[ ] Quadros conferidos (início, pico, transição, fim)
[ ] Entregue por Dynamic Link confirmado ou render existente com duração certa
```

## Ofício do movimento — números de referência (18/11/2026)

Fonte: skills do projeto aberto HyperFrames (heygen-com/hyperframes, Apache 2.0), adaptado ao nosso fluxo.

| Tema | Regra |
|---|---|
| Duração | Movimento rápido: 0,3–0,6 s, com desfoque de movimento; um movimento = uma interpolação |
| Chegar e sair | Chega devagar (saída longa da curva), sai limpo; a saída dura 40–50 % menos que a entrada; saída é um gesto só |
| Curva por papel | Chegada: desaceleração longa. Câmera e troca de cor: suave nos dois lados. Zoom-através e saída: aceleração. Linear só para rotação, progresso e velocidade constante. A mesma curva em tudo "parece gerado" |
| Mola | Amortecimento 0,7–0,85 = premium; 0,4–0,6 = brincalhão; posição e tamanho podem quicar, opacidade e cor nunca |
| Sobreposição | O próximo elemento entra quando o anterior está 30–50 % concluído; palavras com 60–120 ms de diferença, itens de lista 40–80 ms |
| Batida | quadros por batida = fps × 60 / BPM; calcule cada batida pelo índice (não some valores arredondados); corte na batida, mude o layout no compasso |
| Corte | No quadro mais rápido do movimento, com direção e velocidade iguais dos dois lados |
| Título | Depois que pousa, fica **parado**; o movimento passa para o próximo elemento ou para o fundo. Varie as entradas no mesmo vídeo |
| Tempo de leitura | ≈ 0,5 s + 0,3 s por palavra; a última frase do vídeo, ≥ 2 s |
| Tamanho de título | 4–9 % da altura do quadro, 1–2 linhas; uma palavra na cor de destaque, e ela carrega sentido |
| Ritmo | Contraste de velocidades: montagem corta a cada 0,13–0,8 s; demonstração segura um enquadramento por 7–10 s enquanto a tela age; pausa de 0,3–0,75 s antes do resultado |

**Sinais de "vídeo gerado" (evitar):** laços de respirar/flutuar/pulsar no lugar de movimento; título que continua
deslizando ou crescendo depois de pousar; zoom lento "de enfeite"; quique em interface; anéis de clique em
tudo; todas as cenas entrando igual; tudo com fade + subir.

## Expressões de tempo exato (18/11/2026, da análise do lyric video)

Servem para logo, título, lower third, legenda, contador, ícone. O tempo vem de um **marcador** da camada
(`ae_manage_markers`) ou de um JSON; nunca de segundos digitados na expressão. Aplicar com `ae_set_expression`.
Ainda não rodaram ao vivo (docs/16, B62).

**Chegada exata ("pop")** — 0 antes, 100 % **no** tempo marcado, leve excesso e assenta. Uma mola comum só
*começa* no tempo e chega ~0,16 s atrasada; esta chega no quadro certo. Escala:

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

**Passo com chegada** — o valor fica no anterior, acelera e **está** no novo valor no marcador `k`
(giro de anel, troca de produto, barra de gráfico). Use a mesma curva `s` acima como progresso:
`valorAnterior + (valorNovo - valorAnterior) * s`, com `ts = marker.key(k).time`.

**Pulso de batida** — reage à trilha sem chaves (`p` = período da batida em s, `t0` = tempo da batida 0,
vindos de `media_analyze_audio`):

```js
var p = 0.488, t0 = 0.32, d = 7;
var u = ((time - t0) % p + p) % p;
value * (1 + 0.06 * Math.exp(-d * u))
```

**Deriva que zera no tempo de leitura** — balança entre dois marcadores e vale exatamente 0 em cada um:

```js
var m = marker, amp = 12, r = value;
if (m.numKeys >= 2) {
  var n = m.nearestKey(time).index, i = (m.key(n).time > time) ? n - 1 : n;
  if (i >= 1 && i < m.numKeys) {
    var u = (time - m.key(i).time) / (m.key(i + 1).time - m.key(i).time);
    r = value + [amp * Math.sin(Math.PI * u), 0];
  }
}
r
```

Regras: o impacto visual cai no tempo ±1 quadro; depois de pousar, o elemento descansa em deriva lenta
(nunca congelado, nunca ainda deslizando); nada de `random()` sem `seedRandom(n, true)`.
