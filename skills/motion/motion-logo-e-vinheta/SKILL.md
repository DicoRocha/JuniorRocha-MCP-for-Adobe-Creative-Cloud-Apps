---
name: motion-logo-e-vinheta
description: Animar logo e criar vinhetas de abertura e encerramento no After Effects — logo vetorial do Illustrator como camadas, revelação construída a partir da geometria da marca, 2–5 s, som opcional, versões com fundo e transparente. Use para intro/outro de vídeos, assinatura de anúncios e reels.
---

# motion-logo-e-vinheta — a marca entra com intenção

Base: `docs/conhecimento/04`. Antes: `motion-direcao-de-arte`; logo pronto (`vetor-logo-e-selo`).

## 1. Ideia

A animação nasce **da forma do logo** (o traço que desenha o símbolo, as partes que se
encaixam, a letra que gira para virar ícone). Escreva em uma frase antes de abrir o app.
Duração: abertura 2–4 s, encerramento 3–5 s (com CTA/endereço), assinatura de anúncio 1–2 s.

## 2. Preparar o logo

- No Illustrator: uma camada por parte que vai se mover, nomeadas; textos em curvas.
- No After Effects: `ae_import_vector_as_shapes({ filePath: logo.ai })` → comp com uma camada de forma
  por camada do .ai (prontas para Trim Paths). Só ver o logo, sem animar traço: `ae_manage_project` import
  com `importAs: "compCroppedLayers"`.

## 3. Animar

Atalho: `ae_create_logo_reveal({ logoPath, kitPath, format })` — círculo de destaque cresce, logo entra com
easing forte e fica parado ≥ 1 s; auditada. Para traço desenhado, siga os passos abaixo.


1. Comp 1920×1080 e 1080×1920 (ou só a do canal), 30 fps, fundo da marca.
2. Revelação típica (escolha uma):
   - **traço**: Trim Paths 0 → 100 % no contorno, depois preenchimento entra;
   - **montagem**: partes entram de direções coerentes e encaixam com overshoot curto;
   - **máscara**: `ae_add_mask` com Mask Expansion animado revelando;
   - **letra a letra**: no nome, `ae_add_text_animator` (ou forma, se em curvas).
3. Easing: `ae_set_keyframes` com `easeInOut`/influência 70–85 %; nada linear.
4. Assentar: o logo para **≥ 1 s** completo antes do corte.
5. Brilho/partícula só se fizer parte da marca; sombra e 3D com parcimônia.

## 4. Som

Um "hit" ou whoosh curto sincronizado com o encaixe, −12 a −6 dB abaixo da trilha, opcional;
na pós se a vinheta for entrar num vídeo com trilha própria.

## 5. Saídas

| Versão | Render |
|---|---|
| Com fundo, para vídeo | H.264 pelo Media Encoder (`ae_render_queue` queueInAME) |
| Transparente, para sobrepor | ProRes 4444 / QuickTime com alfa (template do módulo de saída) |
| Para Premiere editável | `.mogrt` (`ae_export_mogrt`) com texto/cor expostos |

## 6. Portão de saída

```
[ ] Ideia derivada da forma do logo, escrita em uma frase
[ ] Duração dentro da faixa; logo parado ≥ 1 s no fim
[ ] Easing em todas as chaves; nada linear
[ ] Logo correto (cor, proporção) — não distorcido
[ ] Versões com fundo e transparente (ou .mogrt) entregues
```
