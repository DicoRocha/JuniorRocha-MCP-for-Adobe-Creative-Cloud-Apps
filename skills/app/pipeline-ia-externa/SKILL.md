---
name: pipeline-ia-externa
description: Integrar imagens, vídeos e áudios gerados por IA de terceiros (ou pela IA dos próprios apps) no fluxo do MCP — pedir com prompt e referências, receber, conferir, nomear, registrar origem, tratar no Photoshop/Lightroom, animar no After Effects e montar no Premiere. Use sempre que um asset vier de gerador externo.
---

# pipeline-ia-externa — a IA gera, o MCP termina

O MCP **não gera** imagem/vídeo por IA; isso fica com terceiros ou com os recursos de IA dos
apps (feitos pela pessoa no app). Prompts: `prompt-roteamento-modelos`, `prompt-imagem`,
`prompt-video`, `prompt-asset-sheets`, `prompt-diagnostico`.

## 1. Pedir

1. Escolha o gerador pelo tipo de asset (`prompt-roteamento-modelos`).
2. Prompt com a filosofia visual (`craft-filosofia-visual`) e referências (folha de personagem
   ou produto de `prompt-asset-sheets`); proporção e resolução finais desde o início.
3. Gere 3–4 opções por pedido; produto, logo e texto **reais** entram na pós (não peça ao gerador).

## 2. Receber e registrar

- Pasta `01_assets/ia/<ferramenta>/` com nome `projeto_asset_v01.ext`.
- Ao lado, `<nome>.txt` com ferramenta, modelo, data, prompt, seed e referências usadas.
- Licença/termos da ferramenta permitem uso comercial? Pessoa real reconhecível ou marca de
  terceiro = não usar.
- Lightroom: `lr_import_photos` + `lr_set_metadata` (palavra-chave "IA", título com a ferramenta).

## 3. Conferir (antes de trabalhar em cima)

`ps_open_document` + `ps_get_canvas_snapshot` (100 % em detalhes): mãos, dentes, olhos, texto
espúrio, logos falsos, objetos fundidos, perspectiva, borda de upscale. Defeito → `prompt-diagnostico`
e novo pedido, em vez de remendar por horas.

## 4. Tratar

- Foto/imagem: `foto-revelacao` (cor e contraste da série), `foto-recorte-e-composicao`
  (integrar produto real), grão uniforme para unir com fotos reais.
- Texto e marca por cima no Photoshop/Illustrator, nunca gerados.
- Vídeo gerado: importar no Premiere (`pr_import_media`), cortar só os trechos bons, cor
  (`video-cor-e-export`); ou no After Effects para compor com tipo e logo (`motion-post-animado`).
- Áudio gerado (voz/trilha): medir com `media_analyze_audio` e colocar com `pr_duck_music`.

## 5. Transparência

Onde a plataforma ou a lei exigir, marque o conteúdo como gerado/alterado por IA. Em saúde e
depoimentos, nunca use IA para simular pessoas, resultados ou relatos.

## 6. Portão de saída

```
[ ] Gerador escolhido pelo tipo; prompt com filosofia e referências
[ ] Asset nomeado com ficha de origem (ferramenta, prompt, seed, data)
[ ] Licença ok; sem pessoa real/marca de terceiro
[ ] Defeitos conferidos a 100 %; texto e marca reais na pós
[ ] Rotulagem de IA onde exigida
```
