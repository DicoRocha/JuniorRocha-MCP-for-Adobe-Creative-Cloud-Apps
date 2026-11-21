---
name: motion-transicoes
description: Criar e usar um kit de transições de marca no After Effects (wipe, círculo, push, zoom, fade) com dois placeholders de cena e levá-lo ao Premiere — escolha do movimento, duração, easing, cores da marca e regras de quando NÃO usar transição. Use para "transições da marca", "vinheta entre cenas" ou ritmo de edição.
---

# motion-transicoes — mover o olhar, não enfeitar o corte

Antes: `motion-fundamentos`, `motion-direcao-de-arte`. App: `app-after-effects`, `app-premiere`.

## 1. Quando usar

- **Corte seco** é o padrão: 80–90 % das passagens de um vídeo.
- Transição marca **mudança de assunto, de tempo ou de lugar**; no máximo 1 a cada 15–20 s em vídeo curto.
- A mesma família de transição no vídeo inteiro (1 estilo + 1 variação).

## 2. Escolha do movimento

| Estilo | Sensação | Duração |
|---|---|---|
| wipe (faixa da cor de destaque cruzando) | energia, lista de itens | 0,6–0,8 s |
| circle (círculo cobre e descobre) | revelar, "agora o resultado" | 0,7–1,0 s |
| push (A sai, B entra) | sequência, próximo passo | 0,5–0,7 s |
| zoom (A aproxima e desfoca) | mergulho, detalhe | 0,6–0,8 s |
| fade | tempo passando, calma | 0,8–1,2 s |

## 3. Criar o kit (uma chamada por estilo)

1. `ae_create_transition({ style, transitionSeconds, kitPath })` cria a composição com **Cena A** e
   **Cena B** (pré-composições placeholder), o movimento nas cores da marca, easing forte, motion blur e
   marcadores de início e fim. Formato vertical: `format: "story9x16"`.
2. Olhe o quadro do meio do movimento (a ferramenta devolve a prévia) e o fim: B precisa estar
   **parado** ≥ 0,3 s antes do próximo evento.
3. Ajuste fino: `ae_set_easing` (influência 80–90 % para sair rápido e chegar suave), `ae_set_keyframes`.

## 4. Levar ao Premiere

- Rápido: renderizar a transição com fundo e usar como plano entre os clipes (`ae_render_queue`).
- Reutilizável: substituir o conteúdo das cenas por clipes reais no AE (Dynamic Link) ou montar a
  versão "cortina" (só a faixa/círculo sobre transparente) e colocar numa trilha acima do corte
  (`pr_place_clip_on_timeline`), centrada no ponto de corte.
- Transições nativas simples: `pr_apply_transition` (dissolve curto 6–10 quadros), nunca efeitos 3D de catálogo.

## 5. Erros comuns

- Transição em todo corte; transições diferentes no mesmo vídeo.
- Cor fora da paleta; faixa cobrindo legenda importante.
- Movimento linear (sem easing) e sem motion blur.
- Som ausente: um whoosh curto ajuda (`prompt-musica-voz`).

## 6. Portão de saída

```
[ ] Corte seco como padrão; transição só em mudança de assunto/tempo/lugar
[ ] 1 família de transição por vídeo, cores da marca
[ ] Duração na faixa da tabela; easing forte; motion blur
[ ] B parado ≥ 0,3 s; legenda não coberta
[ ] Auditoria (ae_audit_motion) sem chaves lineares no movimento
```

## Transições com causa (18/11/2026)

Fonte: skills do projeto aberto HyperFrames (heygen-com/hyperframes, Apache 2.0), adaptado ao nosso fluxo.

Use 3–5 tipos por vídeo, cada um **causado por algo na tela**. Corte seco fica dentro da cena (aproximações);
entre blocos, no máximo um terço das emendas é corte seco.

| Transição | Como se constrói |
|---|---|
| Zoom através de um botão | A câmera vai até o botão com desfoque (~0,6 s); ele cresce de ~8 % a ~250 % do quadro em ~0,35 s acelerando; o preenchimento dele vira o próximo quadro |
| Objeto vira o mundo | Uma pílula/cartão cresce além do quadro (~0,65 s); o entorno desfoca e some; o novo conteúdo aparece enquanto ela ainda cresce |
| Metamorfose | Um contêiner se alarga até virar o próximo (ícone → caixa), ~0,2 s, com desfoque horizontal que zera |
| Levar junto | O resultado encolhe com desfoque no meio do caminho e pousa dentro da próxima tela, que se monta em volta |
| Inundação de cor | O objeto principal fica; o fundo inteiro muda de cor em ~0,4 s |
| Chicote | Borrão horizontal ou vertical de 0,13–0,3 s; quem chega pousa borrado e fica nítido em ~0,13 s |
| Íris do clique | Um círculo abre a partir do ponto clicado para a próxima tela (~0,15 s) |
| Corte com mergulho | O quadro que sai escurece ~40 % por 3 quadros antes do corte seco |
| Troca por desfoque no mesmo palco | Sai: opacidade a zero com ~8 px de desfoque; entra: desfoque a zero; o fundo não corta |

Pedido → ajuste: "rápido demais" = reduzir zooms e panorâmicas a 0,7× e mais nada; "os títulos se mexem" =
pousar e segurar parados; "parece slide" = entrar na próxima cena por um objeto da tela, cortar no meio do movimento.

## Transições de câmera e de tendência (18/11/2026)

Montagem padrão, não destrutiva: **camada de ajuste sobre o corte**, intensidade ligada a **controles
deslizantes** (ajustáveis nos Controles de efeito) e curvas extremas (80–100 % de influência): lento no
começo, rápido no meio do corte.

| Transição | Como montar | Ferramenta |
|---|---|---|
| Chicote (whip/swish pan) | Transformar (posição) + Desfoque direcional paralelo ao movimento; Mosaico de movimento para não aparecer borda | `ae_camera_transition` `whip` |
| Zoom com desfoque (in/out) | Escala brusca acelerando perto do corte + Desfoque radial em modo Zoom; opcional: Compensação óptica com distorção de lente invertida | `ae_camera_transition` `zoom` |
| Giro 180°/360° | Rotação com curva forte + Desfoque radial em modo Giro | `ae_camera_transition` `spin` |
| Tremor / impacto | Expressão de `wiggle` em posição e rotação, com amplitude ligada a um controle que vai de 100 a 0 em poucos quadros (sem keyframes de posição) | `ae_camera_transition` `shake` |
| Clarão / vazamento de luz | Sólido claro (ou ruído fractal esticado com curvas fortes) em Adicionar/Tela, opacidade sobe e desce no corte | `ae_camera_transition` `flash` |
| Glitch digital | Mapa de deslocamento com ruído fractal em blocos + separação dos canais RGB com posições animadas no corte | script curto (sem receita ainda) |
| Corte escondido por objeto | Máscara animada ou recorte da pessoa/objeto que passa na frente revelando a camada de baixo (fosco de controle) | ver "Recorte de pessoa em vídeo" |
| Metamorfose de formas | Contornos das duas formas reamostrados com o mesmo número de pontos e animados no caminho, com a cor | `ae_morph_shapes` (caminho, retângulo e elipse; só o primeiro caminho de cada camada; texto precisa virar forma antes) |
| Metamorfose fluida entre imagens | Dissolução rápida + leve distorção (malha/dissolver) | script curto |
| Papel rasgando / queimando | Feito dentro do After: Linear Wipe + Roughen Edges na camada que sai e uma tira cor de papel (ou brasa com brilho) atrás da borda | `ae_paper_transition` (`style` tear/burn). A queima é uma frente reta simples; fogo orgânico ainda pede fosco de vídeo |

Quando usar: conteúdo de energia alta (vlog, estilo de vida, bastidor, corte na batida). Em tutorial e fala
séria, no máximo uma por vídeo, e sempre com causa. A direção do desfoque acompanha a direção do movimento.

## Câmera que viaja e corte escondido (18/11/2026, da análise do lyric video)

- **A câmera vai até o conteúdo.** Coloque as cenas em lugares diferentes do espaço 3D e leve a câmera de
  uma à outra; durante a viagem as duas cenas aparecem. Corte seco entre cenas só quando for decisão.
- **Corte escondido no chicote:** a câmera de A acelera num giro, o corte fica no meio do borrão, a câmera
  de B desacelera na mesma direção (`ae_camera_transition`). O corte cai no **limite exato do quadro**.
- **Flash = um quadro**, em cor da paleta, só nos cortes declarados no roteiro. Mais de um quadro vira véu leitoso.
- **Descanso antes da transição:** o último texto da cena fica inteiro no quadro por ≥ 0,25 s antes do chicote.
- **Primeiro quadro depois do corte** já tem conteúdo legível; nada de parede vazia ou escura por 10–15 quadros.
- **Conferir:** tira de quadros 1/60 s (ou 1/30 s) em volta de cada corte com `ae_contact_sheet`: um quadro
  de flash, limpos antes e depois, sem salto de câmera.
- Chicote muito rápido pode mostrar cópias em vez de borrão (teto de amostras do motion blur): aumente as
  amostras por quadro na comp ou encurte o giro.
