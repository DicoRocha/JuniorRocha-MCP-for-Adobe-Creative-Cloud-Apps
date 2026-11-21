---
name: plan-conceito-criativo
description: Criar 2–3 caminhos criativos distintos para uma campanha ou peça-mãe — insight, ideia, assinatura, território visual e esboço da arte-chave — antes de produzir em série. Use depois do briefing e antes de qualquer lote de peças.
---

# plan-conceito-criativo — da tensão à arte-chave

Base: `docs/conhecimento/08` §3. Antes: `plan-briefing` (objetivo, público, oferta) e
`plan-brand-kit`. Depois: `plan-campanha` ou a skill da peça.

## 1. Quando usar

- Campanha, série ou arte-chave nova. Peça avulsa simples não precisa (vá direto à execução).
- Cliente pediu "algo diferente", "uma ideia", "um conceito". Briefing sem direção visual.

## 2. Do insight à ideia (escreva, não desenhe ainda)

1. **Tensão do público** em uma frase: "quer X, mas Y impede". Use as palavras do público
   (comentários, avaliações, perguntas do briefing). Sem tensão real, o conceito vira enfeite.
2. **Insight**: a verdade por trás da tensão (≤ 20 palavras). Teste: alguém do público diria
   "é isso mesmo"?
3. **Ideia**: como a marca resolve a tensão, em uma frase com verbo.
4. **Assinatura**: título/slogan de 2–6 palavras, que funcione sem imagem.
5. **Prova**: o que torna a ideia crível (dado, processo, pessoa, garantia) — real e autorizado.

## 3. Três caminhos que diferem na ideia (não no estilo)

Para cada caminho, um bloco:

```
Nome do caminho · Insight · Ideia · Assinatura
Território visual: luz, paleta (3–5 cores do kit + acento), tipo, estilo de foto, grafismo, movimento
Arte-chave em 3 linhas: o que está no quadro, onde está o título, o que a pessoa sente
Peça que mais se beneficia (reels, carrossel, cartaz) · Risco (o que pode dar errado)
```

- Os três devem mudar a **ideia central** (ex.: "tempo", "controle", "descoberta"), não só cor.
- Um caminho seguro (próximo da marca), um intermediário, um ousado. Diga qual é qual.
- Rode `qa-anti-generico` em cada um: sem clichê de banco de imagem (aperto de mão, lâmpada,
  pessoa apontando para tela), sem promessa que o segmento não permite.

## 4. Prancha de estilo (opcional, para o caminho escolhido)

Uma prancha 1920×1080 no Photoshop com 6–9 referências, paleta e amostras de tipo:
`ps_create_document` → `ps_place_file` (referências fornecidas ou geradas fora, ver
`pipeline-ia-externa`) → textos com `ps_create_layer` → `ps_get_canvas_snapshot`.
Imagens de terceiros só como referência interna; nunca entram na peça final.

## 5. Arte-chave antes da série

Produza **uma** peça-mãe do caminho aprovado (`social-post` ou `print-flyer-cartaz`) e aprove
antes de derivar formatos. Derivações: `design-adaptacao-formatos`.

## 6. Saída

Arquivo `00_briefing/conceito.md` com os três caminhos, a escolha e o porquê; a prancha (se
houver) em `00_briefing/referencias/`. As skills de execução leem esse arquivo.

## 7. Portão de saída

```
[ ] Tensão e insight escritos com palavras do público
[ ] 3 caminhos com ideias centrais diferentes (seguro / intermediário / ousado)
[ ] Cada caminho: assinatura ≤ 6 palavras, território visual, arte-chave em 3 linhas, risco
[ ] Prova real para a ideia; restrições do segmento respeitadas
[ ] Caminho escolhido pela pessoa antes de produzir a série
[ ] conceito.md salvo no projeto
```
