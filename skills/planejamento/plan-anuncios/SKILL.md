---
name: plan-anuncios
description: Planejar um lote de anúncios para teste — ângulos × ganchos × formatos, hipótese de cada variação, nomenclatura e a planilha que alimenta a produção em lote (ps_batch_variants / vídeo). Use quando pedirem "anúncios para Meta/TikTok/Google", "criativos para testar" ou várias variações de uma oferta.
---

# plan-anuncios — matriz de teste

Base: `docs/conhecimento/06` §5. Antes: `plan-briefing`, `plan-copy`. Execução:
`ads-estatico` (estático), `video-anuncio` (vídeo), `roteiro-anuncio-video`.

## 1. Ângulos (por que comprar)

Escolha **3–5 ângulos** diferentes, cada um uma razão de compra:
dor (o problema) · desejo (o resultado) · prova (número, caso) · objeção (preço, tempo, medo)
· identidade ("para quem é") · oferta (condição, prazo) · comparação (antes/depois, nós × outro).

## 2. Ganchos por ângulo

Para cada ângulo, 2–3 ganchos (primeira linha / primeiro segundo): afirmação ousada,
pergunta que dói, número, "pare de…", prova primeiro, quebra de padrão.
Ganchos mudam; o corpo do anúncio fica igual dentro do ângulo.

## 3. Matriz

| id | ângulo | gancho | visual | formato | CTA | hipótese |
|---|---|---|---|---|---|---|

- Formatos padrão: feed **4:5 1440×1800**, story/reels **9:16 1080×1920**, quadrado 1:1 se a
  plataforma pedir. Zonas seguras em `craft-formatos`.
- **Uma variável por variação** (só o gancho, ou só o visual) — senão o teste não ensina nada.
- Tamanho de lote razoável: 3 ângulos × 2 ganchos × 2 formatos = 12 peças.

## 4. Nomenclatura (vale no arquivo e no gerenciador de anúncios)

`CAMPANHA_ANGULO_GANCHO_VISUAL_FORMATO_v01` — ex.: `ALIGN_DOR_G1_FOTO-A_4x5_v01`.
O mesmo nome no CSV (coluna `__file` vem do `fileNamePattern`).

## 5. Planilha de produção

CSV com cabeçalho = **nomes das camadas** do template PSD + colunas de controle:

```
angulo;gancho;Titulo;Apoio;CTA;Foto;Selo
DOR;G1;Cansado de esperar?;Avaliação em 30 min;Agende agora;fotos/a.jpg;show
```

Produção: abra o template de cada formato e rode `ps_batch_variants` com
`fileNamePattern: "ALIGN_{{angulo}}_{{gancho}}_4x5"` (um template por formato).

## 6. Regras de plataforma e verdade

- Texto na imagem curto (≤ 20% da área como guia); logo pequeno; produto/benefício visível em 1 s.
- Sem antes/depois, promessa ou alegação de saúde não permitida; sem botões falsos ("play") na arte.
- Preço e prazo idênticos ao da oferta real e ao da página de destino.

## 7. Saída

`00_briefing/anuncios.csv` (produção) e `00_briefing/anuncios.md` (matriz com hipóteses e o
que medir: CTR, custo por resultado, taxa de visualização de 3 s para vídeo).

## 8. Portão de saída

```
[ ] 3–5 ângulos distintos, cada um com 2–3 ganchos
[ ] Uma variável por variação; hipótese escrita
[ ] Nomes padronizados iguais no arquivo e no CSV
[ ] CSV com colunas = camadas do template; formatos e zonas seguras definidos
[ ] Regras da plataforma e do segmento conferidas
```
