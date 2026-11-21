---
name: plan-copy
description: Escrever títulos, textos de apoio, CTAs e legendas de post/anúncio por fórmula (AIDA, PAS, BAB, 4U, FAB) e por canal, com variações para teste e limites de caracteres. Use antes de montar qualquer peça com texto.
---

# plan-copy — texto que cabe na peça e vende

Base: `docs/conhecimento/08` §4 e `06` §5. Antes: `plan-briefing` (público, oferta, tom,
nível de consciência). O texto entra nas peças por `social-post`, `ads-estatico`, `print-*`.

## 1. Escolha a fórmula pelo nível de consciência

| Público | Fórmula | Primeira linha |
|---|---|---|
| Não sabe do problema | Educação / curiosidade | Fato ou pergunta que revela o problema |
| Sabe do problema | **PAS** (problema → agitação → solução) | A dor, com as palavras dele |
| Compara soluções | **FAB** / diferencial | O que só você faz |
| Conhece o produto | Prova + oferta (**AIDA**) | Resultado ou número real |
| Pronto para comprar | Oferta, prazo, facilidade | O que leva e até quando |
| Transformação clara | **BAB** (antes → depois → ponte) | O "depois" desejado |

## 2. Título

- 3–8 palavras para peça visual; benefício concreto > trocadilho. Teste **4U** (útil, urgente,
  único, ultraespecífico): marque 2 de 4 no mínimo.
- Números reais ("em 4 passos", "30 min"). Verbo de ação. Sem "incrível", "inovador", "melhor".
- Escreva **5 variações** de título e escolha 1 + 2 reservas para teste.

## 3. Texto de apoio e CTA

- Apoio: 1 frase que tira a principal objeção (preço, tempo, medo, esforço). ≤ 120 caracteres na peça.
- **CTA**: verbo + resultado ("Agende sua avaliação", "Baixe o guia"). Um por peça.
- Prova social/escassez/autoridade só se forem reais e verificáveis.

## 4. Por canal (limites usuais — conferir na plataforma)

| Canal | Onde | Limite prático |
|---|---|---|
| Texto na arte (feed/story) | título / apoio / CTA | 8 / 20 / 4 palavras |
| Legenda Instagram | primeira linha decide o "ver mais" | gancho ≤ 125 caracteres; total ≤ 2.200 |
| Meta Ads | texto principal / título / descrição | ~125 / ~40 / ~30 caracteres visíveis |
| Google Ads (RSA) | títulos / descrições | 30 / 90 caracteres (15 títulos, 4 descrições) |
| LinkedIn | primeiras linhas | ~150 caracteres antes do corte |
| Impresso (flyer A5) | título / corpo | ≤ 8 palavras / ≤ 60 palavras |

## 5. Tom e verdade

- Fale como o cliente fala (use o vocabulário do briefing). Frases curtas; voz ativa.
- Segmentos regulados (saúde, odontologia, estética, finanças): sem promessa de resultado,
  sem "garantido", sem antes/depois sem permissão; preço e condição reais.
- Idioma da peça = idioma do público (ex.: alemão para clínica alemã), revisado por quem fala.

## 6. Saída

`00_briefing/copy.md` com uma tabela por peça:

| Peça | Fórmula | Título (+2 variações) | Apoio | CTA | Legenda | Caracteres |
|---|---|---|---|---|---|---|

Para lote de anúncios, a mesma tabela em CSV (colunas = nomes das camadas do template) serve
de entrada para `ps_batch_variants`.

## 7. Portão de saída

```
[ ] Fórmula escolhida pelo nível de consciência do público
[ ] Título concreto, 3–8 palavras, com 2 variações para teste
[ ] Um CTA com verbo + resultado
[ ] Limites de caracteres do canal respeitados (contados)
[ ] Nenhuma promessa, número ou depoimento sem base; regras do segmento ok
[ ] Revisão de ortografia no idioma da peça
```
