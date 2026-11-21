---
name: social-stories-capas
description: Produzir stories (sequência 9:16 com enquete/link/contagem), capa de Reels que funciona no feed 4:5 e na grade 3:4, e capas de destaques no Photoshop, respeitando as zonas da interface. Use para stories de campanha, bastidores, capas de vídeo vertical e destaques do perfil.
---

# social-stories-capas — 9:16 com a interface por cima

Base: `docs/conhecimento/06` §1. Formatos e zonas: `craft-formatos`. Post: `social-post`.

## 1. Zonas (1080×1920)

- Topo **~250 px**: barra de progresso, perfil — nada importante.
- Base **~400 px**: campo de resposta, CTA da plataforma, legenda de Reels.
- Lateral direita **~120 px** (Reels): botões de curtir/comentar.
- Área útil ≈ **840×1270**, centrada. Monte guias: `ps_play_action` set "Guides" (se houver) ou
  retângulos de referência numa camada oculta.

## 2. Sequência de stories (3–7 telas)

| Tela | Função |
|---|---|
| 1 | Gancho visual + pergunta ou promessa (≤ 7 palavras) |
| 2–N−1 | Uma informação por tela; elemento interativo previsto (enquete, quiz, caixa de pergunta) |
| N | CTA com espaço livre para o adesivo de link / contagem (≥ 600×200 px livre na área útil) |

- Mesmo template para todas (`ps_smart_object` replaceContents na foto, `ps_edit_text_layer`).
- Deixe **vazio** o espaço dos adesivos — eles são postos no app, não desenhados na arte.
- Texto ≥ 36 px; título ≥ 72 px.

## 3. Capa de Reels (3 recortes)

A capa 1080×1920 aparece recortada:
- **Feed 4:5**: faixa central 1080×1350 (corta 285 px em cima e embaixo);
- **Grade do perfil 3:4**: centro 1080×1440;
- No Reels: tela cheia.
Título e rosto **dentro de 1080×1350 central**, de preferência no terço superior desse recorte.
Confira: duplique o documento e corte (`ps_modify_canvas` crop) para 4:5 e olhe.

## 4. Capas de destaques

1080×1920 com o ícone no **círculo central de ~540 px** (o resto é cortado). Ícone de linha
da marca (`vetor-logo-e-selo`), fundo liso da paleta, mesmo peso de traço em todas.

## 5. Série

Template com camadas nomeadas (`Foto`, `Titulo`, `Apoio`, `Numero`) → `ps_batch_variants`
com CSV (uma linha por tela/capa) ou troca manual por tela. Exporte PNG numerado
(`01.png`…).

## 6. Portão de saída

```
[ ] Nada essencial fora da área útil 840×1270
[ ] Espaço livre para adesivos (link, enquete, contagem)
[ ] Capa de Reels lida no recorte 4:5 e 3:4
[ ] Destaques: ícone dentro do círculo central, série consistente
[ ] Arquivos numerados; PSD template salvo
```
