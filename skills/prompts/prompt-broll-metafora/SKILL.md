---
name: prompt-broll-metafora
description: Transformar uma frase abstrata do roteiro ("crescimento", "confiança", "liberdade") em b-roll gerado por IA — escolher a metáfora visual, gerar o still, depois animar por primeiro e último quadro com consistência. Use quando o roteiro pedir imagem para uma ideia que não se filma.
---

# prompt-broll-metafora — da ideia ao plano animado

Base: `prompt-roteamento-modelos`, `prompt-imagem`, `prompt-video`. Diagnóstico: `prompt-diagnostico`.
Reimportar: `pipeline-ia-externa`.

## 1. Da frase à metáfora (3 candidatas, escolha 1)

| Frase | Metáfora concreta (objeto + ação + lugar) |
|---|---|
| "crescimento constante" | broto atravessando uma rachadura no concreto, luz de manhã |
| "tudo se encaixa" | peças de madeira deslizando e travando sobre uma mesa |
| "sem pressa" | xícara fumegando ao lado de uma janela com chuva fina |

Regras: objeto físico, ação simples, um só sujeito; nada de símbolo gasto (lâmpada, aperto de mãos,
gráfico subindo) sem um giro. A metáfora precisa ser entendida em 2 s sem legenda.

## 2. Still (imagem-chave)

Estrutura do prompt (`prompt-imagem`): sujeito → ação congelada → ambiente → luz → lente/plano →
paleta da marca → proporção. Ex.: "close de um broto verde saindo de uma rachadura em concreto
cinza, gota de orvalho, luz lateral quente das 7h, lente 100 mm macro, fundo desfocado, tons
creme e verde-oliva, 9:16".
- Gere 4 variações, escolha 1; refine só o que falhou (`prompt-diagnostico`).
- Formato do still = formato final do vídeo (9:16, 16:9).

## 3. Primeiro e último quadro

1. Quadro inicial = o still escolhido.
2. Quadro final = edição do still com a ação concluída (broto 3× maior, folha aberta) — mesmo
   enquadramento, mesma luz, mesma lente. Peça a edição a partir do still, não um prompt novo.
3. Vídeo por primeiro e último quadro, 4–6 s, movimento de câmera mínimo (push-in lento ou fixo).
   Prompt de vídeo descreve **só o movimento** ("o broto cresce e abre a segunda folha; câmera fixa").

## 4. Consistência numa série

- Mesmo "bloco de estilo" em todos os prompts (luz, lente, paleta, textura).
- Mesma proporção e duração; 1 metáfora por frase do roteiro, no máximo 1 a cada 6–8 s de vídeo.

## 5. Reimportar e montar

Arquivo em `03_motion/ia/`, nome `cena_frase_v01.mp4`; `pr_import_media` → timeline; cor igualada ao
resto (`video-cor-e-export`). Créditos/termos da ferramenta de IA conferidos para uso comercial.

## 6. Portão de saída

```
[ ] 3 metáforas concretas avaliadas, 1 escolhida e entendida em 2 s
[ ] Still no formato final, com bloco de estilo da série
[ ] Último quadro editado a partir do still (mesmo plano e luz)
[ ] Prompt de vídeo só com o movimento; 4–6 s
[ ] Plano conferido quadro a quadro (mãos, texto, objetos deformados)
```
