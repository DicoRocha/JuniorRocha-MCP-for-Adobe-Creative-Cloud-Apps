---
name: motion-post-animado
description: Transformar uma arte estática do Photoshop ou Illustrator em post animado (feed 4:5, story/reels 9:16, capa animada) no After Effects — importar camadas, texto editável, paralaxe/câmera, revelações curtas, loop ou final parado — e renderizar leve para rede social. Use para dar movimento a artes de campanha já aprovadas.
---

# motion-post-animado — a arte aprovada ganha movimento

Base: `docs/conhecimento/04`. Antes: arte estática aprovada (`social-post`), `motion-direcao-de-arte`.

## 1. Preparar o PSD/AI

- Camadas nomeadas e separadas pelo que vai se mover (fundo, sujeito recortado, título, apoio,
  logo, CTA). Ajustes e efeitos aplicados/rasterizados onde não forem animar.
- Sujeito recortado em camada própria se houver paralaxe ou texto atrás.

## 2. Importar e organizar

1. `ae_manage_project` import (`importAs: "comp"` mantém a tela inteira).
2. Renomeie a comp (`ae_modify_composition`), duração 6–10 s (feed) ou 5–15 s (story), 30 fps.
3. Textos do PSD em editável: selecione e use o menu "Convert to Editable Text"
   (`ae_execute_menu_command`) — permite `ae_add_text_animator`.

## 3. Movimento (escolha 2–3, não todos)

- **Câmera/paralaxe**: camadas 3D em profundidades diferentes + câmera com movimento curto
  (posição ±40 px, z +80) — foto e recorte no **mesmo z**; título pode ir atrás com escala
  `(zoom+z)/zoom` para manter o tamanho.
- **Revelação do título** por palavra (`ae_add_text_animator` ou `ae_apply_preset` "Fade Up Words" com `time`).
- **Entrada escalonada** dos elementos menores (0,1–0,15 s entre eles).
- **Zoom lento** da foto (100 → 106 %) em toda a duração.
- **Ponto de atenção** no CTA (pulso leve por expressão depois de 3 s).

## 4. Ritmo

Título completo até 1,5 s; tudo assentado até ~3 s; resto em movimento lento.
Para **loop**: primeiro e último quadro iguais (ou corte em movimento contínuo).
Para **final parado**: últimos 2 s estáveis (vira a capa do vídeo).

## 5. Conferir e renderizar

`ae_get_comp_frame_preview` em 0,5 s, 1,5 s e no fim (ou `ae_contact_sheet` com `count: 12`). Salve (`ae_manage_project` save) e
renderize pelo Media Encoder (`ae_render_queue` queueInAME, H.264); confira o arquivo na pasta
(o envio pode passar do tempo limite e continuar). Feed: ≤ 8–10 Mbps é suficiente.

## 6. Portão de saída

```
[ ] Arte aprovada preservada (cor, tipo, layout)
[ ] 2–3 movimentos com propósito; título legível até 1,5 s
[ ] Paralaxe sem "cabeça dupla" (foto e recorte no mesmo z); bordas não aparecem
[ ] Loop limpo ou final parado ≥ 2 s
[ ] Render conferido (duração, tamanho, primeiro quadro)
```
