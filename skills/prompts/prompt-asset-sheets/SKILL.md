---
name: prompt-asset-sheets
description: Gerar sheets de personagem, locação, produto e figurino como entrada limpa para vídeo por IA — fundo cinza contínuo, luz neutra 5600 K, painéis padronizados, locações vazias em 3/4, variações por edição. Use antes de qualquer vídeo gerado com personagem ou cenário recorrente.
---

# prompt-asset-sheets — entrada limpa = vídeo bom

Base: `docs/conhecimento/09` §2. Antes: `prompt-roteamento-modelos`. Depois: `prompt-video`.

## 1. Regras comuns

- **Fundo cinza contínuo** (seamless), luz envolvente quase sem sombra, **5600 K**, sem cast de cor.
- Textura de pele legível, brilho nos olhos; sem filtro de beleza.
- Uma sheet por elemento; nome do arquivo = nome do elemento = tag do prompt (`char_ana`).
- Personagem que aparece uma vez só não precisa de sheet.

## 2. Personagem — 3 painéis

```
3-panel character sheet on seamless mid-grey: (1) full body front, feet in frame,
(2) full body back, (3) head-and-shoulders close-up, face clearly visible.
Neutral wraparound light, 5600K, no color cast. [rosto, idade, cabelo, roupa em palavras]
```

- Variações de figurino: **edite a mesma sheet** (GPT Image 2: "keep the person, change the
  jacket to …"), não regenere.
- A sheet "veste" o personagem: em cena com outra roupa, o prompt de vídeo diz
  "use this reference for FACE AND IDENTITY ONLY" e descreve a roupa.

## 3. Locação

- Em **3/4 com duas paredes visíveis** (dá profundidade à câmera).
- **Vazia** — sem pessoas nem multidão; a lotação entra no prompt de vídeo (com cláusula
  "if the reference shows empty stands, OVERRIDE and fully populate").
- Hora do dia e luz da cena definidas (golden hour para memória boa, fria para tensão).

## 4. Produto e props

- Em **3/4**, não frontal chapado; escala indicada por objeto de referência se importar.
- Roupas em manequim invisível, frente e costas no mesmo quadro.
- Logo, cor e texto do produto escritos em palavras; foto real do produto como referência
  sempre que existir (melhor que descrever).

## 5. Aprovação

Olhe cada sheet a 100 %: mãos, olhos, simetria, texto. Defeito na sheet vira defeito em todos
os planos. Upscale (Magnific) só da sheet aprovada.

## 6. Portão de saída

```
[ ] Fundo cinza, 5600 K, sem sombra dura, em todas as sheets
[ ] Personagem: frente com pés, costas, close de rosto
[ ] Locações em 3/4, vazias; props em 3/4
[ ] Variações por edição da mesma sheet
[ ] Nomes = tags do prompt; aprovadas a 100 % antes do vídeo
```
