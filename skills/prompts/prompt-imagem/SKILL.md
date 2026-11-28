---
name: prompt-imagem
description: Escrever prompt de imagem estruturado (sujeito, ação, ambiente, enquadramento, lente, luz, paleta, textura, estilo, formato) com camadas de profundidade numeradas, alvo em vez de proibição e bloco de estilo fixo para séries. Use para keyframes, fundos, produtos e cenas a gerar fora do Adobe.
---

# prompt-imagem — descrever o alvo com precisão

Base: `docs/conhecimento/10` §8 e `09` §3. Antes: `prompt-roteamento-modelos`.

## 1. Estrutura (nesta ordem)

```
SUBJECT: quem/o quê, aparência, roupa, material
ACTION/POSE: o que faz, para onde olha (alvo do olhar)
ENVIRONMENT: lugar, hora, clima, objetos
SPACE: LAYER 1 (nearest) … LAYER 2 … LAYER 3 (farthest) + overlap tests
CAMERA: enquadramento (close/medium/wide), ângulo (3/4, baixo), lente (35/50/85 mm), profundidade de campo
LIGHT: fonte, direção, dureza, temperatura (ex. janela à esquerda, suave, 5600 K)
PALETTE: 3–5 cores (hex do kit) e acento
TEXTURE: grão, material, acabamento
STYLE: referência de linguagem (fotografia editorial, documental), sem nome de artista vivo
FORMAT: proporção (4:5, 9:16, 16:9) e área livre para texto ("upper third clean for headline")
```

## 2. Regras que mais mudam o resultado

- **Alvo, não proibição:** "arquibancada vazia", não "sem pessoas".
- **Camadas numeradas** e testes de sobreposição ("o fio passa na frente DELE; nenhum fio
  cruza o casal") — modelo não entende "lado da rua".
- Objeto com frente/verso: **qual face a câmera vê** ("a câmera vê só o verso do celular").
- **Detalhe crítico em palavras** (número, cor, logo, texto pequeno), mesmo com referência.
- **Sem texto gerado**: deixe a área livre e componha título no Photoshop (`social-post`).
- Plano frontal travado parece banco de imagem: prefira 3/4 e uma ação no meio.
- Mãos, dentes, letras: peça enquadramentos que os escondam ou confira com zoom.

## 3. Série coerente

Fixe um **bloco de estilo** (luz + paleta + lente + textura + formato) e cole igual em todos
os prompts da série. Mude só sujeito/ação. Referência de rosto/produto aprovada em todas.

## 4. Para usar no Adobe

- **Arte que vai ser montada no Photoshop** (post com recorte, texto atrás, luz atrás): gere **cada
  elemento separado** e prepare-o para a montagem (regras testadas em 25/11/2026):
  - cenário **mais aberto do que o formato** (parede inteira, 16:9) e **nítido** ("everything in sharp focus,
    no blur"): o desfoque e o enquadramento de cada formato são feitos no Photoshop;
  - mesma câmera do sujeito (sujeito de frente → parede de frente, sem canto da sala em ângulo);
  - sujeito em **fundo liso da cor dominante do cenário** (laranja para cenário laranja): o recorte fica
    limpo e as arestas não clareiam;
  - luz (onda, brilho, fumaça) **sobre fundo preto sólido**, para modo Tela;
  - objetos 3D/ícones **nítidos, sem desfoque de movimento nem sombra no chão**, fundo liso;
  - nunca texto, logo nem preço na imagem.
- Peça a resolução da peça final ou maior (feed 2160×2700 para recorte), sRGB.
- Reimporte e iguale à campanha: `ps_place_file` → `ps_adjustment_layer` (curves, colorLookup)
  → grão (`ps_apply_filter` applyAddNoise 1–3 %). Ver `pipeline-ia-externa`.

## 5. Ética e marca

Sem pessoa real identificável sem autorização, sem logo de terceiros, sem imitar estilo de
artista vivo pelo nome. Em saúde: nada de "resultado" gerado apresentado como real.

## 6. Portão de saída

```
[ ] Todos os blocos preenchidos; formato e área de texto definidos
[ ] Alvos descritos (nenhum "sem X")
[ ] Espaço em camadas numeradas quando há mais de 2 elementos
[ ] Detalhes críticos escritos; nenhum texto a ser gerado
[ ] Bloco de estilo fixo para a série
[ ] Registrado em prompts.md
```
