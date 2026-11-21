---
name: ads-estatico
description: Produzir anúncios estáticos de performance (Meta, TikTok, Google Display, LinkedIn) — anatomia gancho/título/prova/marca/CTA, modelos que funcionam, template PSD por formato e produção em lote a partir de planilha com ps_batch_variants. Use quando pedirem criativos de anúncio ou variações para teste.
---

# ads-estatico — um ângulo por peça, em lote

Base: `docs/conhecimento/06` §5. Antes: `plan-anuncios` (matriz e CSV), `plan-copy`.

## 1. Anatomia (de cima para a ação)

1. **Gancho visual** — a imagem que para o dedo (produto em uso, rosto, contraste, número).
2. **Título** — benefício ou oferta, 5–8 palavras.
3. **Prova** — número, avaliação, selo, demonstração (reais).
4. **Marca** — logo pequeno, consistente.
5. **CTA** — botão/faixa com verbo ("Agende agora").

## 2. Modelos

produto herói + benefício · lista de 3 benefícios com ícones · depoimento em destaque
(real, autorizado) · oferta com preço e prazo · comparação nós × eles · "nativo" (parece post
orgânico) · antes × depois (só onde permitido).

## 3. Formatos (um template por formato)

| Posicionamento | Tamanho |
|---|---|
| Feed 4:5 | 1440×1800 |
| Stories/Reels 9:16 | 1080×1920 (zonas de `social-stories-capas`) |
| Quadrado 1:1 | 1440×1440 |
| Link 1,91:1 | 1200×628 |

Recompor por formato (`design-adaptacao-formatos`), nunca esticar.

## 4. Template para lote

Camadas com **nomes = colunas do CSV**: `Titulo`, `Apoio`, `CTA`, `Preco` (texto),
`Foto` e `Logo` (Smart Objects), `Selo` (camada a mostrar/ocultar com `show`/`hide`).
Texto em caixa com alinhamento definido para títulos de tamanhos diferentes caberem.

## 5. Produção em lote

1. Abra o template do formato (`ps_open_document`).
2. `ps_batch_variants({ documentName, csvPath, outputFolder: ".../06_entrega/ads/4x5",
   fileNamePattern: "ALIGN_{{angulo}}_{{gancho}}_4x5", format: "png", fileFolder })`.
3. Leia o retorno: `columnsWithoutLayer` (coluna sem camada = erro de nome) e `warnings`.
4. Confira 3 peças por amostragem (as de título mais longo): `ps_open_document` do PNG →
   `ps_get_canvas_snapshot`. Texto estourado → ajuste o template e rode de novo.
5. Repita para cada formato.

## 6. Regras

- Lê em 1–3 s, a 400 px. Texto ≤ ~20 % da área como guia.
- Preço, prazo e condição idênticos à página de destino; nada de selo/depoimento inventado.
- Sem botão falso de play/fechar. Saúde/estética/finanças: regras do segmento.
- Nomes iguais aos do gerenciador de anúncios.

## 7. Portão de saída

```
[ ] Anatomia completa; um ângulo e um CTA por peça
[ ] Templates por formato com camadas nomeadas = colunas
[ ] Lote sem colunas órfãs; amostra conferida (títulos longos)
[ ] Legível a 400 px; zonas seguras respeitadas
[ ] Dados reais; nomes padronizados
```
