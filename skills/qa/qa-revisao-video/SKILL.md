---
name: qa-revisao-video
description: Revisar vídeo antes da entrega — conferir arquivo (resolução, fps, duração, codec), quadros-chave, legendas contra o áudio, nomes e números, loudness e picos, zonas seguras, emendas, cor entre planos e direitos de música e imagem. Use em todo vídeo (reels, anúncio, VSL, UGC, motion) antes de dizer que está pronto.
---

# qa-revisao-video — assistir com checklist

Base: `docs/conhecimento/05`. Revisão de peça estática: `qa-revisao-visual`.

## 1. Arquivo

- Abra o render final (não o projeto): resolução, fps, duração exata, codec H.264/H.265,
  áudio 48 kHz estéreo. `media_analyze_audio` no arquivo dá duração e loudness.
- Nome dentro do padrão (`video-anuncio` §3) e na pasta `06_entrega/`.

## 2. Imagem (quadro a quadro onde importa)

`pr_export_frame_or_sequence` mode frame (ou `ae_get_comp_frame_preview`; no AE, `ae_contact_sheet` dá a visão geral) em:
1º quadro (vira miniatura em alguns lugares), gancho (1–2 s), cada troca de bloco, oferta/CTA e último quadro.
Confira:
- texto dentro da zona segura e legível em celular;
- cor coerente entre planos (pele igual de plano a plano);
- sem quadro preto/flash nas emendas, sem clipe "vazado" além do fim;
- logo correto, não distorcido; fotos espelhadas por engano (texto invertido).

## 3. Legendas

- Compare o SRT com a transcrição revisada: nomes próprios, números, preço, marca.
- Sincronia: legenda entra com a fala (tolerância ~0,1 s) e não fica após o corte.
- Máx. 2 linhas, sem palavra órfã; nenhuma legenda sobre texto de tela.

## 4. Som

| Medida | Alvo web/social |
|---|---|
| Loudness integrado | −14 LUFS (±1); VSL/YouTube −14 a −16 |
| Pico | ≤ −1 dBTP |
| Música sob voz | ≥ 12 dB abaixo |

`media_analyze_audio` (loudness) no render. Ouça as emendas (estalo = falta de crossfade curto),
início e fim (sem corte seco de música).

## 5. Conteúdo e direitos

- Promessas, preços, prazos e depoimentos iguais ao aprovado; regras do segmento.
- Música licenciada para o uso (anúncio pago exige licença comercial); imagens e pessoas autorizadas.
- Assets de IA registrados (`pipeline-ia-externa`).

## 6. Assistir inteiro uma vez

Sem pausar, como espectador, no celular se possível. Anote o tempo de cada problema
(`pr_manage_markers` add com comentário) e corrija antes de re-renderizar.

## 7. Portão de saída

```
[ ] Arquivo: resolução, fps, duração, codec, áudio corretos; nome e pasta
[ ] Quadros-chave conferidos (1º, gancho, blocos, CTA, último)
[ ] Legendas conferidas (texto e sincronia)
[ ] Loudness −14 LUFS ±1, pico ≤ −1 dBTP; emendas limpas
[ ] Conteúdo aprovado e direitos ok; assistido inteiro
```

## Revisão como diretor exigente (18/11/2026)

Fonte: skills do projeto aberto HyperFrames (heygen-com/hyperframes, Apache 2.0), adaptado ao nosso fluxo.

Você montou a timeline e sabe o que acontece; quem assiste vê **uma vez, na velocidade normal, no celular**.
1. **Medir antes de olhar:** frase na tela por menos tempo que a leitura pede (0,5 s + 0,3 s/palavra); mais
   de 3 s sem nada mudar; texto menor que ~2,6 % do lado menor do quadro; primeiro quadro vazio (é a
   miniatura); loudness e picos do arquivo final.
2. **Três folhas:** início e meio de cada cena; uma tira em cada corte (−0,2 s a +0,2 s); e os quadros
   principais **na largura de celular (360 px)**.
3. **Descrever cada quadro principal em uma frase, como um estranho.** O que precisaria de explicação é
   problema grave. Os quadros em ordem contam a história sem o áudio?
4. Perguntas: lê-se como o que é? O assunto se separa do fundo? Enquadramento e bordas (texto sob a
   interface da plataforma)? Tempo para quem vê pela primeira vez? Sinais de "gerado"? Lê no celular?
5. **Notas no formato** `t=4,2s · onde · problema → mudança exata · o que fica`, classificadas:
   **P0** quebra a leitura (ilegível, errado, quebrado), **P1** enfraquece (trecho morto, resultado fraco,
   emenda que pula), **P2** polimento. Corrigir todo P0 e os P1 que valem; texto → tempo → detalhe.
6. Nunca dar nota de 0 a 10 (nota não acha o que corrigir). Olhos novos: um subagente que recebe só o
   roteiro e as folhas e devolve P0/P1. Copie o projeto antes de corrigir.
7. Você não ouve o áudio: diga isso e apoie-se nas medições.

## Medidas de movimento e de montagem (18/11/2026, da análise do lyric video)

- **Julgue o vídeo montado**, não a cena isolada: emenda, chicote e troca de cor só falham juntos.
- **Sincronia:** o quadro de impacto de cada elemento marcado cai no seu tempo ±1 quadro (tira de 12 quadros
  seguidos em volta do tempo, `ae_contact_sheet`).
- **Leitura:** cada palavra legível parada ≥ 0,2 s; o último texto da cena ≥ 0,25 s inteiro no quadro antes
  da transição; o último do vídeo ≥ 0,55 s. Descanso é deriva lenta, não congelamento.
- **Espalhamento (peça com câmera 3D):** em cada 10 elementos seguidos, o ponto de chegada varia ≥ 150 px em x
  e ≥ 250 px em y (1080×1920), com ≥ 5 enquadramentos; dois seguidos não caem no mesmo ponto **e** tamanho.
  Meça por bloco. Palavra larga não alcança o número dentro da zona segura: registre a exceção, não saia da zona.
- **Câmera e ar morto:** sem câmera parada nem quadro sem movimento por mais de 0,25 s (`ae_audit_motion`).
- **Cortes:** no limite do quadro; flash de um quadro só; quadros limpos dos dois lados.
- **Cor:** só a paleta; mistura de meio-tom barrenta conta como fora da paleta. Brilho e glow julgam-se na
  escala final, não no rascunho reduzido.
- **Último quadro:** é um pôster (serve de capa), não um amontoado.
- **Correção:** escreva o resultado medido e o intervalo de tempo ("chegadas entre 8 s e 13 s com ≥ 150 px em x"),
  não a receita nem "melhorar". Junte itens pequenos numa rodada só.
- **Depois da entrega:** pedido novo = versão nova em caminho próprio; o que a pessoa viu e aprovou é ponto
  fixo; todo número dito na entrega é uma medida que diz com o que compara.
