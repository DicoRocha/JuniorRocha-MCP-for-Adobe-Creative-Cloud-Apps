---
name: plan-campanha
description: Transformar briefing e conceito aprovado num plano de peças — matriz por etapa do funil com canal, formato, mensagem, CTA, app responsável, dependências e ordem de produção — e na estrutura de pastas da campanha. Use para qualquer pedido com várias peças ou vários apps.
---

# plan-campanha — matriz de peças e ordem de produção

Base: `docs/conhecimento/08` §5 e §8. Antes: `plan-briefing`, `plan-conceito-criativo`
(caminho aprovado), `plan-copy`. Depois: `pipeline-entre-apps` e as skills de cada peça.

## 1. Funil → peças

| Etapa | Objetivo da peça | Peças típicas |
|---|---|---|
| Atenção | Parar o dedo, apresentar a ideia | Reels 15–30 s, anúncio 4:5/9:16, cartaz, capa animada |
| Consideração | Explicar, provar | Carrossel, vídeo depoimento/tutorial, folder |
| Conversão | Oferta e ação | Anúncio de oferta (variações), VSL curto, flyer com QR |
| Relacionamento | Lembrar, fidelizar | Stories, catálogo, e-mail |

Corte o que o orçamento/prazo não comporta: melhor 5 peças boas que 20 genéricas.

## 2. Matriz (uma linha por peça)

```
id · etapa · canal · formato (px/mm) · mensagem · CTA · arte de origem · app(s) · skill · depende de · prazo
```

- **Arte de origem**: toda peça deriva da arte-chave ou de uma foto tratada; diga qual.
- **App(s)** na ordem do pipeline: LR → PS → AI → AE → PR → ID.
- Formatos: `craft-formatos` (feed 1080×1350, story/reels 1080×1920, A5 148×210 mm + 3 mm sangria).

## 3. Ordem de produção (dependências)

1. Kit de marca (`plan-brand-kit`) e textos aprovados (`plan-copy`).
2. Fotos tratadas (`foto-triagem-e-lote` → `foto-revelacao` → `foto-saida`).
3. Vetores: logo, selos, ícones (`vetor-logo-e-selo`).
4. Arte-chave (`social-post`), aprovada.
5. Derivações estáticas (`design-adaptacao-formatos`, `ads-estatico` em lote).
6. Motion (`motion-*`) → `.mogrt` ou Dynamic Link.
7. Vídeo (`video-*`).
8. Impressos (`print-*`) com PSD/AI vinculados.
9. Pacote (`qa-preflight-entrega`).

## 4. Pastas e nomes

Crie a estrutura antes de produzir:
`CLIENTE/ANO_CAMPANHA/{00_briefing,01_fotos,02_design/{psd,ai,exports},03_motion,04_video,05_impressos,06_entrega}`.
Nome: `cliente_campanha_peca_formato_v01.ext`. Salve `plano-de-pecas.json` (a matriz) e
`plano-de-pecas.md` (a mesma coisa legível) em `00_briefing/`.

## 4b. Executar o plano

Com `plano-de-pecas.json` no formato de `skills/_shared/plano-de-pecas.schema.json` (cada peça com `tipo` →
receita, `params` com caminhos `@/` relativos à pasta da campanha, `depende`), `jradb_campaign_run` faz:
`plan` (valida tudo sem abrir app) → `run` (peças na ordem de produção; para em cada aprovação) →
`approve` (gate conceito, arte-chave ou video) → `run` de novo → `report` (`06_entrega/relatorio-campanha.md`).
Peça feita à mão: `tipo: "a-mao"`; refeita fora: `mark`. O estado fica em `00_briefing/campanha-estado.json`.
Campanha longa: chame pelo `jradb_code` com `background: true`.

## 5. Pontos de aprovação

Defina com a pessoa onde ela aprova: conceito → arte-chave → primeiro vídeo → pacote.
Não avance de um ponto sem o "ok" (ou, se a pessoa estiver fora, registre a suposição no topo do plano).

## 6. Riscos e reservas

- Peças que dependem de terceiros (foto nova, IA externa, gráfica): prazo e plano B.
- Apps pesados (AE, PR): reserve tempo de render; peças longas pelo Media Encoder.

## 7. Portão de saída

```
[ ] Cada peça com etapa, canal, formato, mensagem, CTA, arte de origem e app
[ ] Ordem de produção respeita dependências (fotos e vetores antes das artes)
[ ] Quantidade compatível com prazo; o que ficou de fora está listado
[ ] Pastas criadas; plano-de-pecas.json e .md salvos
[ ] Pontos de aprovação combinados
```
