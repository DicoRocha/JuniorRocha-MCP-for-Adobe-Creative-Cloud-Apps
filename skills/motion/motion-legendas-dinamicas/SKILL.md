---
name: motion-legendas-dinamicas
description: Legendas dinâmicas e textos de impacto para vídeo curto (Reels, TikTok, Shorts) no After Effects — catálogo de estilos de criador, comportamentos de destaque da palavra falada (cor, pílula que corre, preenchimento, pulo, sublinhado), estilos visuais, textos que não são legenda (palavra única, contador, emoji, callout), blocos técnicos de expressão e o JSON de entrada. Use sempre que um vídeo com fala for legendado; o padrão é legenda criativa palavra por palavra, mesmo sem pedido.
---

# motion-legendas-dinamicas — a legenda como motion

Leia antes: `video-legendas-e-som` (texto, tempo, som), `motion-fundamentos` (easing), `craft-tipografia` §7
(texto em forma pela altura da maiúscula). Fontes: use as do kit da marca; os estilos abaixo descrevem
**comportamento**, não fonte.

## 1. Entrada: palavras com tempo real

```json
{ "blocks": [ { "start": 1.20, "end": 2.45, "emphasis": [1],
    "words": [ { "t": "QUEM", "s": 1.20, "e": 1.38 }, { "t": "NUNCA", "s": 1.38, "e": 1.71 }, { "t": "RECEBEU", "s": 1.71, "e": 2.45 } ] } ] }
```

- Tempo **medido** por palavra (timestamp por token; B44). Nunca por contagem de caracteres.
- Revise o texto antes (nomes, marcas, termos). 1–4 palavras por bloco em vídeo vertical.
- `emphasis` = índices das palavras-chave (cor/escala extra); números falados podem virar contador (§5).

## 2. Estilos de criador (escolha um por vídeo; adapte à marca)

| Estilo | Comportamento | Quando |
|---|---|---|
| Impacto ("Beast") | Texto muito grande em caixa alta, contorno grosso e sombra dura; cada palavra entra com pulo forte (overshoot); a palavra falada troca de cor | Entretenimento, ritmo alto, público jovem |
| Centro forte ("Hormozi") | 2–3 palavras no centro, peso alto, caixa alta, sombra suave; palavra-chave na cor de destaque; entrada com pulo leve ou pequena rotação | Educação, negócios, tutorial — **padrão para tutorial** |
| Elegante | Sem serifa limpa + uma palavra de impacto em serifada/cursiva; cores suaves; movimento curto | Marca pessoal premium, lifestyle |
| Podcast / entrevista | Alinhado à esquerda ou no terço inferior; palavras "pousam" conforme ditas; números maiores | Corte de conversa, depoimento |

## 3. Destaque da palavra falada (combine um com o estilo)

| Comportamento | Como |
|---|---|
| Cor da palavra | A palavra atual na cor de destaque; ditas em branco; futuras esmaecidas (40–60 %) |
| Pílula que corre (karaoke box) | Forma arredondada atrás da palavra atual; desliza para a próxima no tempo da fala |
| Preenchimento (sweep / rise) | A cor preenche a palavra da esquerda para a direita, ou de baixo para cima |
| Leitura profunda | Texto começa translúcido; cada palavra ganha opacidade total ao ser dita |
| Pulo da palavra | Escala 100 → 120–130 → 100 % na palavra atual |
| Marca-texto / sublinhado | Traço cresce sob a palavra falada |

## 4. Estilos visuais para momentos (abertura, b-roll, virada)

Gelatina/elástico (estica e volta) · bloco 3D com sombra longa · neon com piscada na entrada ·
figurinha (borda branca grossa + balanço) · rabisco/giz com círculos e setas desenhados.
Use em 1–3 momentos do vídeo, não na legenda inteira.

## 5. Textos que não são legenda

| Recurso | Uso |
|---|---|
| Palavra única gigante | Uma palavra substitui a outra no centro; fala rápida, gancho |
| Contador de número | Número falado ("10 mil") sobe de 0 ao valor em 0,4–0,8 s |
| Emoji gigante | Texto pequeno embaixo; emoji grande pula ilustrando a reação |
| Callout flutuante | Caixa/seta que aponta ou segue um ponto da tela (nulo + rastreio); em tutorial, destaque **cada clique** |

## 6. Blocos técnicos (After Effects)

| Bloco | Uso |
|---|---|
| `sourceRectAtTime(time, false)` | Caixa/pílula que se ajusta ao texto; altura fixa pela **altura da maiúscula**, não pelo retângulo (acentos e descendentes deslocam) |
| Animador de texto + seletor de expressão (por palavra) | Cor, escala, opacidade e posição por palavra, guiados pelo tempo de cada palavra; uma camada por bloco ou uma camada com Texto-fonte em keyframes de retenção |
| Overshoot / inércia em Escala | Pulo natural sem vários keyframes: `amp*Math.sin(freq*t*2*Math.PI)/Math.exp(decay*t)` a partir do início do bloco |
| `text.sourceText.style` (AE 2024+) | Cor, fonte e tamanho de palavras dentro da mesma camada |
| Limite de largura | Escala = `min(100, larguraSegura / sourceRect.width * 100)` para nunca encostar na borda do 9:16 |

Regras de construção: sem `beginUndoGroup`/salvar/renderizar no script (B33); depois de parentear,
redefinir escala e posição (B45); rotação 2D é `ADBE Rotate Z`; motion blur ligado; base de script em
a biblioteca do reel v3 em `temp/Junior/_tmp/video`.

## 7. Fluxo

1. Cortar e mixar no Premiere; gerar a faixa de legenda do Premiere como guia (pode ficar oculta).
2. Renderizar o corte; transcrever com tempo por palavra; revisar texto.
3. Escolher estilo (§2) + destaque (§3) + 1–3 momentos (§4–5) de acordo com a marca e o conteúdo.
4. Montar no After; conferir quadros em 3–4 legendas (palavra destacada = palavra dita) e nas trocas.
5. Exportar; medir loudness no arquivo final.

## 8. Portão de saída

```
[ ] Tempo por palavra medido; texto revisado
[ ] Palavra falada destacada; bloco de 1–4 palavras; dentro da zona segura; fora do rosto
[ ] Texto em pílula centralizado pela altura da maiúscula; nada encosta na borda
[ ] Um estilo só no vídeo; momentos especiais ≤ 3
[ ] Cliques/pontos da tela destacados (tutorial)
[ ] Surpreende? Se é só "legenda branca correta", suba o nível
```

## 9. Ferramentas e variações (18/11/2026)

- `media_transcribe` com `wordTimestamps: true` → `<nome>.words.json` (tempo real por palavra).
- `ae_word_captions` monta as legendas na comp: estilos `centro`, `pilula`, `impacto`, `leitura`;
  `replace` corrige palavras mal ouvidas; `offsetSeconds` alinha ao início do clipe.
- Três formas de destaque que valem ter à mão: **marca-texto que varre** a palavra, **bloco que entra**
  atrás do texto, **sublinhado que se desenha**.
- Alternativa de construção: **uma única camada de texto** alimentada por uma tabela de tempos (CSV das
  legendas do Premiere) com seletor de expressão — menos camadas, bom para vídeos longos.
- Negrito/cor/tamanho de parte do texto por expressão (estilo por caractere, After 2025+).

## 10. Ajustes finos de legenda (18/11/2026)

Fonte: skills do projeto aberto HyperFrames (heygen-com/hyperframes, Apache 2.0), adaptado ao nosso fluxo.

- **Tamanho do bloco pela energia:** 2–3 palavras (alta), 3–5 (conversa), 4–6 (calma). Quebre no fim da
  frase, em pausa ≥ 150 ms ou no limite de palavras.
- Um bloco por vez; abre no início (ou pouco antes) da primeira palavra e fecha depois da última. Legenda
  em 0 s parece "já estava lá": comece 0,1–0,3 s depois. Todo bloco tem um fim seco (some de vez).
- **Casar palavras pelo índice**, não pelo texto (palavra repetida pega o tempo errado). Nunca duas
  palavras numa entrada de tempo.
- **Alucinação do Whisper:** em silêncio ele inventa "Obrigado." ou repete frases; descarte palavras que
  começam dentro de um silêncio final (ffmpeg `silencedetect=noise=-35dB:d=0.6`). Leia a transcrição antes
  de usar; muita palavra sem sentido = refazer com modelo maior.
- **Caber:** tamanho da fonte ajustado à largura segura (≈ 900 px em vertical); quando uma palavra cresce
  no destaque, desconte essa escala da largura.
- **Posição em vertical:** linha de base a ~600–700 px da base; nunca sobre o rosto; dentro da área segura.
- **Sobre vídeo:** escolha o tratamento pelo brilho atrás do texto (escuro: texto claro direto; médio: sombra
  ou pílula; claro: cor opaca). Legenda simples sobre fundo claro ganha um fundo **do tamanho do texto**,
  nunca uma barra de ponta a ponta. Fade no bloco **ou** nas palavras, não nos dois.
- Confira se o vídeo já traz legenda queimada em algum trecho (folha de quadros a 1 qps) antes de legendar.
- **Texto atrás da pessoa:** vídeo → texto → recorte da pessoa por cima. A palavra grande lê melhor com
  30–55 % coberta (menos de 15 % flutua, mais de 65 % some). Medir no tempo de cada legenda, a cabeça se mexe.
