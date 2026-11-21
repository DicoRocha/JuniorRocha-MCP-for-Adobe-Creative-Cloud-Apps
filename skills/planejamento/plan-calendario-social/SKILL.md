---
name: plan-calendario-social
description: Planejar o calendário de conteúdo de redes sociais de um mês ou trimestre — pilares, frequência por canal, mix de formatos, datas fixas, lote de produção e templates que alimentam a produção em série. Use quando pedirem "calendário", "planejamento do mês", "linha editorial" ou "pauta de posts".
---

# plan-calendario-social — pauta que vira produção em lote

Antes: `plan-briefing` (objetivo, público, canais) e `plan-brand-kit`. Depois: `plan-copy`,
`social-post`, `social-carrossel`, `video-reels`.

## 1. Entradas mínimas

| Item | Pergunte se faltar |
|---|---|
| Objetivo do período | 1 objetivo principal (ex. agendamentos, vendas de X, seguidores locais) |
| Canais | Instagram, TikTok, LinkedIn, YouTube… e quem publica |
| Capacidade real | Quantas peças por semana a equipe aprova e grava |
| Datas fixas | Lançamentos, promoções, feriados e datas do segmento |
| Ativos | Fotos tratadas, vídeos brutos, depoimentos autorizados |

## 2. Pilares (3–5)

- Cada pilar responde a uma pergunta do público ou a uma objeção de venda. Ex. clínica: "como funciona",
  "quanto custa / formas de pagamento", "bastidores e equipe", "resultados reais autorizados", "dúvidas".
- Proporção sugerida: 40 % educa, 25 % prova (casos, bastidores), 20 % relacionamento, 15 % oferta direta.
- Um pilar sem pauta para 4 semanas seguidas é cortado ou fundido.

## 3. Frequência e mix

| Canal | Mínimo sustentável | Mix |
|---|---|---|
| Instagram feed | 3 por semana | 1 carrossel, 1 reels, 1 post único |
| Stories | 4–5 dias por semana | enquete, bastidor, repost, CTA com link |
| TikTok/Shorts | 3 por semana | o mesmo vídeo vertical do reels, gancho próprio |
| LinkedIn | 2 por semana | texto + documento (carrossel PDF) |

Menos posts com qualidade > calendário cheio que a equipe não cumpre. Planeje 80 % da capacidade.

## 4. Planilha do calendário

Uma linha por peça (CSV, salvo em `00_briefing/calendario.csv`):
`data, canal, formato, pilar, tema, gancho, cta, ativo, status, arquivo`.
Status: `pauta → roteiro → design → aprovado → agendado → publicado`.

## 5. Lote de produção

1. Agrupe as peças por formato (todos os posts do mês, todos os carrosséis, todos os reels).
2. Templates da marca uma vez: `jradb_templates_build` (posts .psdt com camadas Titulo, Apoio, CTA,
   Foto, Logo; flyer e manual .indt; .mogrt de lower third e título).
3. Posts em série: CSV com as colunas = nomes das camadas → `ps_batch_variants` no template (PNG).
4. Carrosséis: `roteiro-carrossel` → `social-carrossel`. Reels: `plan-roteiro-video` → `video-reels`.
5. Folha de contato do mês para aprovação de uma vez: `jradb_contact_sheet` na pasta de exportação.

## 6. Regras

- Toda peça tem 1 mensagem e 1 CTA; o CTA muda conforme o pilar (salvar, comentar, agendar).
- Repetir tema é permitido com outro formato e outro gancho (carrossel → reels → story).
- Nada de número, preço ou depoimento sem fonte (`plan-copy`, regra de verdade).
- Datas sazonais: produção pronta 7 dias antes.

## 7. Portão de saída

```
[ ] Objetivo do período e 3–5 pilares escritos
[ ] Frequência ≤ capacidade da equipe (80 %)
[ ] calendario.csv com data, canal, formato, pilar, gancho, CTA e status
[ ] Templates gerados ou escolhidos; lote agrupado por formato
[ ] Folha de contato do lote aprovada antes de agendar
```
