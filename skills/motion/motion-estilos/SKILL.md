---
name: motion-estilos
description: Criar e aplicar uma biblioteca de estilos de motion nomeados (fichas com paleta, traço, forma, movimento, ritmo e som) para que todas as animações de uma marca pareçam da mesma família. Use ao começar motion de uma marca nova, ao padronizar um canal ou quando pedirem "um estilo", "um look" ou "vinheta no mesmo estilo".
---

# motion-estilos — um look com nome, regras e números

Antes: `motion-direcao-de-arte`. Usa: `plan-brand-kit` (cores e tipos). Peças: `motion-graficos-de-video`,
`motion-logo-e-vinheta`, `motion-transicoes`, `motion-continuidade`.

## 1. Ficha de estilo (uma por look, salva em `03_motion/estilos/<nome>.md`)

| Campo | Exemplo ("Calmo Clínico") |
|---|---|
| Paleta | fundo #F4F1EC, texto #1E2A33, destaque #2F7D6D (máx. 1 destaque por quadro) |
| Forma | cantos raio 24 px, linhas 4 px, círculos inteiros |
| Tipo | títulos 1 família, peso 600; corpo 400; caixa normal |
| Movimento | entradas de baixo 40 px + opacidade; easing 85 % saída/chegada; sem rotação |
| Ritmo | passagens 0,6 s; respiro 0,4 s entre elementos; stagger 3 quadros |
| Textura | grão 3 %, sem brilho/glow |
| Som | cliques suaves, whoosh baixo, trilha 80–90 BPM |
| Proibido | bounce elástico, neon, giro 3D, troca de fonte |

A biblioteca é nossa: não copie fichas de terceiros nem presets pagos sem licença.

## 2. Três a cinco estilos, não vinte

Contrastes úteis: "Calmo" (lento, poucas formas), "Energia" (rápido, cortes secos, destaque saturado),
"Editorial" (tipo grande, grids, fade), "Lúdico" (formas redondas, overshoot leve).
Uma marca usa 1 estilo principal + 1 de apoio.

## 3. Aplicar no After Effects

1. Cores e fontes vêm do kit: receitas `ae_create_lower_third`, `ae_create_title_card`,
   `ae_create_counter`, `ae_create_logo_reveal`, `ae_create_transition` com `kitPath`.
2. Valores de movimento da ficha: `ae_set_easing` (influência), `ae_set_keyframes` (distâncias e tempos).
3. Guardar o estilo como preset de animação quando possível (`ae_apply_preset` para reaplicar) e como
   .mogrt (`ae_export_mogrt`) para o Premiere.
4. Templates da marca em lote: `jradb_templates_build` (lower third, título, contador .mogrt).

## 4. Conferir a família

- 3 peças diferentes lado a lado (`ae_contact_sheet`) parecem da mesma marca sem logo?
- Mesmo easing e mesma distância de entrada em todas (`ae_audit_motion` para chaves lineares).
- Se uma peça precisa de exceção, a exceção entra na ficha ou a peça muda.

## 5. Portão de saída

```
[ ] Ficha com paleta, forma, tipo, movimento (números), ritmo, textura, som e proibidos
[ ] No máximo 1 estilo principal + 1 de apoio por marca
[ ] Receitas/templates gerados com o kit e a ficha
[ ] 3 peças comparadas lado a lado: mesma família
[ ] Ficha salva em 03_motion/estilos/
```

## Catálogo de ideias (18/11/2026)

`references/catalogo-de-ideias.md` lista 448 blocos e componentes de motion (transições, legendas, títulos e
tarjas, destaques de tela e cursor, gráficos e mapas, câmera, carrosséis, fundos, sobreposições) do catálogo
aberto do HyperFrames. É **banco de ideias**: escolha pelo nome e descrição e reconstrua no After/Premiere
com as ferramentas do MCP. Use quando faltar repertório ou a pessoa pedir "algo diferente".
