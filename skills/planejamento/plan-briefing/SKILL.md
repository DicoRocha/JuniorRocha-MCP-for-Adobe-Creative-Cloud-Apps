---
name: plan-briefing
description: Montar o briefing de qualquer trabalho de agência (peça, série ou campanha) antes de abrir um app — objetivo, público, oferta, mensagem única, prova, restrições do segmento, formatos e aprovação — e gravar em 00_briefing/briefing.md. Use quando o pedido não traz objetivo, público ou formato, ou quando for uma campanha.
---

# plan-briefing — o mínimo para começar

Execução sem briefing produz peça bonita que não vende. Este passo gera **um arquivo** que as
skills de execução leem. Base: `docs/conhecimento/08-planejamento.md`.

## 1. Quando usar / quando pular

| Pedido | Ação |
|---|---|
| Ajuste pontual ("aumenta o título") | Pular |
| Peça única com objetivo e formato claros | Briefing curto (6 campos) no próprio chat |
| Série, campanha, cliente novo, segmento regulado | Briefing completo em arquivo |

## 2. Campos (pergunte só o que faltar)

| Campo | Pergunta | Se faltar |
|---|---|---|
| Objetivo | O que muda no negócio (venda, lead, agendamento, lembrança)? Meta e prazo? | **Perguntar antes de produzir** |
| Público | Quem é, o que quer, o que teme, onde está | **Perguntar** |
| Oferta | O que é, preço, condição, prazo, garantia | **Perguntar** se a peça vende algo |
| Mensagem única | Se a pessoa lembrar de uma coisa só, qual? | Propor e marcar como proposta |
| Prova | Números, depoimentos, selos (reais e autorizados) | Sem prova → peça sem prova; nunca inventar |
| Tom | Como a marca fala e o que nunca diz | Propor |
| Obrigatórios | Logo, textos legais, cores, fontes | Ver `plan-brand-kit` |
| Canais e formatos | Onde roda, quantas peças | Propor pelo atalho 4:5 + 9:16 |
| Referências | 3 que gosta, 3 que não gosta, por quê | Opcional |
| Aprovação | Quem aprova, quantas rodadas, até quando | Registrar "não informado" |

Até **3 perguntas por rodada**, as que bloqueiam (objetivo, público, formato). O resto vira
suposição explícita no arquivo.

## 3. Nível de consciência do público → abordagem

| Nível | Abordagem da peça |
|---|---|
| Não sabe do problema | Educar, conteúdo |
| Sabe do problema | Nomear e agitar a dor |
| Conhece soluções | Diferencial |
| Conhece o produto | Prova e oferta |
| Pronto para comprar | Oferta, prazo, facilidade |

## 4. Segmentos regulados

Saúde, odontologia, estética, finanças, jurídico, bebidas, infantil, apostas: escreva no
briefing a linha **"Restrições"** — sem promessa de resultado, sem antes e depois onde é
vedado, sem preço/depoimento não autorizado, idioma e país do conselho. Não substitui
orientação jurídica do cliente; diga isso uma vez.

## 5. Arquivo

Crie a estrutura de pastas da campanha (ver `qa-preflight-entrega`) e grave
`00_briefing/briefing.md` com:

```markdown
# CLIENTE · CAMPANHA · "Assinatura" (data)
**Objetivo:** … **Público:** … **Oferta:** … **Mensagem única:** …
**Conceito:** … **CTA:** … **Tom:** … **Restrições:** …
## Peças
| # | Formato | Foto/insumo | Chapéu | Título | Apoio |
**Paleta (kit ou proposta):** … **Tipos:** …
## Suposições
- (tudo o que foi proposto sem confirmação)
```

Sem ferramenta de arquivo no cliente? Mostre o briefing no chat e peça confirmação.

## 6. Erros comuns

- Começar a diagramar sem saber o CTA.
- Duas mensagens numa peça ("agende" + "conheça nossa história").
- Texto em idioma diferente do público (consultório na Alemanha → alemão).
- "Depoimento" ou número inventado para preencher o layout.

## 7. Portão de saída

```
[ ] Objetivo, público e formato confirmados (ou perguntados)
[ ] Mensagem única em uma frase; um CTA
[ ] Restrições do segmento escritas
[ ] Suposições listadas e visíveis para o cliente
[ ] briefing.md salvo em 00_briefing/
```

## Regras de 18/11/2026 — perguntas que não podem faltar

- Carrossel: Photoshop ou Illustrator? (se a pessoa não disse)
- Fotos em fundo infinito: preservar o fundo ou recortar a pessoa? (perguntar depois de ver as fotos)
- Material de cliente aparecendo nas peças: pode?
- Antes de tudo: **validar cada etapa ou automático?** (regra 8 do `index`).
- Depois de analisar os assets: **responder o briefing ou "faça como julgar melhor"?** (regra 9). No
  briefing, pergunte só o que a análise levantou — tipicamente: objetivo e público, onde será publicado,
  tom, o que não pode aparecer, prazo, e as três perguntas acima.
