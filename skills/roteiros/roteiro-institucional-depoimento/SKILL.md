---
name: roteiro-institucional-depoimento
description: Roteirizar vídeo institucional, case de cliente e depoimento — estrutura em atos, perguntas de entrevista que geram falas usáveis, lista de b-roll, autorização e montagem. Use para "vídeo da empresa", "vídeo de marca", "case", "depoimento de cliente" ou "entrevista com o fundador".
---

# roteiro-institucional-depoimento — gente real dizendo coisas verdadeiras

Antes: `plan-briefing`. Depois: `roteiro-storyboard`, `video-fala-limpa`, `video-vsl` (montagem longa),
`video-legendas-e-som`.

## 1. Formato e duração

| Peça | Duração | Uso |
|---|---|---|
| Institucional curto | 60–90 s | site, apresentação comercial |
| Case de cliente | 90–150 s | vendas, LinkedIn |
| Depoimento | 20–45 s | anúncio, reels |
| Recortes verticais | 15–30 s | 3–5 cortes do material longo |

## 2. Estrutura em 4 atos

1. **Contexto (10 %):** quem fala e onde está (nome, função, lugar). Imagem de abertura forte.
2. **Problema (25 %):** a situação antes, nas palavras da pessoa.
3. **Virada (40 %):** o que mudou e como — processo, pessoas, detalhes concretos.
4. **Resultado (25 %):** o depois, com fato verificável; fecha com marca e CTA discreto.

## 3. Perguntas de entrevista

- Abertas e no passado concreto: "Como era um dia típico antes de…?", "O que você fez primeiro?",
  "Qual foi o momento em que percebeu que…?".
- Peça para a pessoa **repetir a pergunta na resposta** ("Antes de vir aqui, eu…") — a fala vira frase
  independente e dispensa a voz do entrevistador.
- 8–12 perguntas; 20–30 min de gravação por pessoa rendem 60–90 s úteis.
- Proibido: dar a frase pronta para a pessoa repetir ou prometer resultado.

## 4. Lista de b-roll

Para cada ato, 3–5 planos: mãos trabalhando, ambiente, detalhe do produto/serviço, rosto escutando,
plano aberto do lugar. 2× mais b-roll do que parece necessário. Planos de 8–10 s parados.

## 5. Regras de verdade

- Autorização de imagem assinada por cada pessoa que aparece; em saúde, sem promessa de resultado
  nem antes/depois fora das regras do conselho do segmento.
- Número citado tem fonte (o cliente confirma por escrito).

## 6. Montagem (passagem para o Premiere)

1. Transcrever: `media_transcribe` no áudio da entrevista; marcar as falas boas no texto.
2. Corte por texto: `pr_edit_timeline` com os intervalos escolhidos, ou `pr_assemble_reel` para recortes curtos.
3. b-roll por cima dos cortes de fala; música de fundo com `pr_duck_music`.
4. Nome e função no 1º aparecimento: `ae_create_lower_third` (ou o .mogrt do template) e `pr_insert_mogrt`.
5. Legendas: `media_build_captions` → `pr_captions_as_mogrt`.

## 7. Portão de saída

```
[ ] Duração e estrutura em 4 atos definidas
[ ] 8–12 perguntas abertas; pessoa repete a pergunta na resposta
[ ] Lista de b-roll por ato (≥ 3 planos cada)
[ ] Autorizações e fontes dos números confirmadas
[ ] Falas escolhidas marcadas na transcrição antes da montagem
```
