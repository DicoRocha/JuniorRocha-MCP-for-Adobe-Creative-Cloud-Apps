---
name: social-thumbnail
description: Criar thumbnail de YouTube (1280×720) e capa de vídeo que se lê a 160 px — um rosto, uma emoção, 0–4 palavras que completam o título, sujeito recortado com separação forte do fundo, e variações para teste. Use para YouTube, cursos, podcasts em vídeo e capas horizontais.
---

# social-thumbnail — ler em um segundo, pequeno

Base: `docs/conhecimento/06` §4. Recorte: `foto-recorte-e-composicao`.

## 1. Ideia antes de abrir o app

- O título do vídeo diz X; a thumb mostra **o que o título não diz** (emoção, resultado, objeto).
- **0–4 palavras**, enormes, completando o título — nunca repetindo.
- Padrões: rosto + emoção + objeto, antes × depois, número gigante, A × B, objeto exagerado,
  seta/círculo de destaque. Escolha um.
- Escreva 3 conceitos e produza 2 para teste A/B (YouTube permite testar capas).

## 2. Montagem (1280×720, ideal 1920×1080 para nitidez)

1. `ps_create_document({ width: 1920, height: 1080 })`.
2. Fundo simples: cor da marca, degradê, ou foto desfocada (`ps_apply_filter` applyGaussianBlur 15–30).
3. Sujeito: `ps_place_file` → selectSubject → addMaskFromSelection; ocupa 40–60 % da altura,
   num terço, **olhando para o texto/objeto**.
4. Separação: contorno ou brilho externo (`ps_effects_and_adjustments` layerStyle stroke
   8–14 px branco, ou outerGlow) + contraste de cor complementar com o fundo.
5. Texto: sans pesada (Black/ExtraBold), ≥ 180 px de altura de letra em 1920 px, 1–2 linhas,
   contorno ou caixa. `ps_list_fonts` para o nome PostScript.
6. Rosto: expressão legível; curves cortada no rosto (+5–10 % brilho), saturação moderada.

## 3. Teste de leitura

`ps_get_canvas_snapshot({ maxDimension: 320 })` e **160 px**: entende em 1 s? O texto lê?
Canto **inferior direito** livre (duração do vídeo cobre ~200×90 px a 1280).

## 4. Série de canal

Mesma fonte, paleta e posição do rosto/texto em todos os vídeos (template com Smart Objects
`Sujeito`, `Fundo` e camada `Texto`); varie só conteúdo.

## 5. Verdade

Não prometer o que o vídeo não entrega; sem pessoa/marca de terceiros sem autorização.

## 6. Saída

PNG, 1280×720 (ou 1920×1080), sRGB: `ps_save_document` png. PSD com camadas. O YouTube aceita até 2 MB: se o PNG passar disso, avise o usuário em vez de trocar de formato por conta própria.

## 7. Portão de saída

```
[ ] Uma ideia, um rosto/objeto, 0–4 palavras que completam o título
[ ] Lê a 160–320 px de largura
[ ] Sujeito separado do fundo (contorno/brilho/contraste)
[ ] Canto inferior direito livre
[ ] 2 variações para teste; consistente com o canal
```
