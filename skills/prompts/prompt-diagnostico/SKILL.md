---
name: prompt-diagnostico
description: Diagnosticar resultado ruim de IA de imagem ou vídeo — sintoma → causa provável → para qual estágio voltar — em vez de re-rolar o mesmo prompt. Use após duas ou três gerações falhas ou quando um detalhe some, o rosto muda ou o cenário derrete.
---

# prompt-diagnostico — voltar um estágio custa menos

Base: `docs/conhecimento/09` §6 e `10` §11.

## 1. Regra

Três falhas seguidas com o mesmo problema = **pare**. Mude **uma** variável por vez e anote.
Re-rolar o mesmo prompt queima crédito e não ensina nada.

## 2. Tabela de diagnóstico

| Sintoma | Causa provável | Volte para |
|---|---|---|
| Cenário derrete, geometria impossível | Locação fraca, sem profundidade | Regerar locação 3/4, vazia (`prompt-asset-sheets`) |
| Rosto muda entre planos | Sheet sem close claro; resolução baixa em rosto | Sheet com close; 4K no take com rosto |
| Detalhe some (logo, número, cor) | Detalhe só na referência | Escrever em palavras + POSITIVE LOCKS |
| Ação errada, assets bons | Direção ambígua | Reescrever ACTION com sujeito, verbo, alvo |
| Olha para a câmera / "anuncia" a fala | Fala sem alvo | Alvo físico + "nobody looks into the lens" |
| Multidão rala, lugares vazios | Referência vazia sem override | Cláusula OVERRIDE de lotação |
| Objeto flutua, física estranha | Contato não descrito | Peso, apoio, sombra de contato |
| Roupa errada / acessório grudado | Sheet "veste" o personagem | "face and identity only" + bloco WARDROBE |
| Parece banco de imagem | Plano frontal travado | Câmera nomeada com movimento motivado, 3/4 |
| Texto gerado ilegível | Texto pedido ao modelo | Gerar sem texto; compor no Photoshop |
| Resposta à ideia errada | Briefing mal fechado | Reabrir `plan-conceito-criativo` |
| Mãos/dedos estranhos | Mãos em destaque | Reenquadrar, ocultar ou corrigir no Photoshop |

## 3. Corrigir no Adobe em vez de regerar

- Pequenos defeitos em imagem: Photoshop (seleção + preenchimento generativo pela pessoa,
  carimbo, `ps_selection_and_masks` + máscara). Mais barato que nova geração.
- Cor/contraste diferente da campanha: `ps_adjustment_layer` ou Lumetri (`pr_apply_effect`).
- Plano de vídeo com 1–2 s ruins: corte no Premiere em vez de regenerar o take.

## 4. Registro

Em `prompts.md`: sintoma · hipótese · variável mudada · resultado. A próxima campanha começa daí.

## 5. Portão de saída

```
[ ] Sintoma descrito com precisão (onde, quando, em quantos planos)
[ ] Causa escolhida da tabela; estágio de retorno definido
[ ] Uma variável mudada por tentativa; resultado registrado
[ ] Considerada correção no Adobe antes de regerar
```
