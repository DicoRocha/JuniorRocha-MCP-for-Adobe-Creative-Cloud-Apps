---
name: video-fala-limpa
description: Editar fala gravada no Premiere (entrevista, depoimento, VSL, talking head, podcast, reels de fala) — modo de edição, transcrição, escolha de takes, cortes no silêncio, respiração, pausas, níveis, J/L cut e checklist por emenda. Use sempre que houver voz gravada para cortar.
---

# video-fala-limpa — edição de fala no Premiere

## 1. Combine o modo antes de cortar

| Modo | Objetivo | Limite |
|---|---|---|
| Limpeza | Mesma fala sem lixo | Só tira hesitação, repetição e silêncio morto |
| Melhores momentos | Os melhores N segundos | Pensamentos inteiros; ideia pela metade é pior que cortada |
| Reordenar | Nova estrutura | Move blocos inteiros; reconfere cada nova emenda |
| Roteiro-alvo | O roteiro manda | Fala sem take vira aviso, nunca remendo de fragmentos |

## 2. Preparar

1. `jradb_checkpoint({ app: "premiere", label: "antes-do-corte" })`.
2. `pr_get_project_info` e `pr_get_sequence_state` (faixas, clipes, tempos).
3. **Transcrição com tempos:** `media_transcribe` (Whisper local; os segmentos já vêm cortados pelo VAD
   nas pausas) e **silêncios**: `media_analyze_audio` `["silences","cutPlan"]` (a voz em dB, o limiar
   automático = ruído + 12 dB). Sem transcrição e sem dados de silêncio, **não corte no meio de frases**:
   mantenha takes contínuos.
4. Monte o **banco de frases**: cada fala, seus takes, o melhor de cada uma. Escreva a lista
   final (in/out por segmento) antes de mexer na timeline.

### Limpar ruído de fundo (Premiere 27, nov/2026)

O **Enhance Audio** do Premiere 27 (Enhance Speech V2 + separação em fala, música, ambiente, efeitos e
reverberação, com "Split to Clips") é o melhor limpador, mas **não tem API**: nem ExtendScript, nem UXP 27.0
(conferido no changelog oficial). O V2 roda na nuvem e gasta créditos generativos (≈2 por minuto); o V1 roda
no computador sem créditos. Caminhos:

1. **Melhor resultado:** peça à pessoa: clipe de fala selecionado → Properties > Audio > **Enhance Audio**
   (ou botão direito no clipe). Depois o MCP segue com cortes, níveis e auditoria.
2. **Automático, no Premiere:** `pr_apply_effect` de áudio **"DeNoise"** ou **"Adaptive Noise Reduction"**
   (efeitos clássicos, sem IA; bom para chiado constante, fraco para ruído variável). "Vocal Enhancer" dá
   presença à voz.
3. **Fora do Premiere:** a fala exportada pode ir ao Enhance Speech da Adobe (Adobe Podcast) por um conector
   Adobe, se a pessoa tiver e autorizar; o arquivo limpo volta como áudio substituto.

**Regra de mixagem do Enhance Audio (18/11/2026)** — vídeo de fala com barulho de ambiente (latido,
rua, ventilador, sala com eco):
- **Fala:** mantém, com o realce no ponto em que a voz ainda soa natural.
- **Ambiente:** mudo.
- **Efeitos sonoros do original:** ouvir e decidir; se não contam nada (clique de mouse, batida na mesa),
  mudo. Mantém só o que ajuda a cena.
- **Reverberação:** sempre muda — o objetivo é voz limpa e seca; a trilha e os efeitos do projeto
  entram depois, por cima.
- **Música do original:** muda quando a trilha vem do projeto.

Como aplicar, em ordem de preferência:

**(a) Conector da Adobe ("Adobe for creativity"), ferramenta de realce de fala — caminho automático padrão.**
Fora deste MCP; devolve três faixas: fala limpa, fundo (música/ambiente juntos) e reverberação.
1. Com o corte fechado, exporte o áudio da fala (ou o vídeo do corte) pelo Premiere.
2. **Peça o ok da pessoa antes de enviar:** o arquivo sobe para o armazenamento da Adobe (material de
   cliente pede autorização caso a caso) e pode consumir créditos da conta.
3. Inicialize o conector, envie o arquivo e rode o realce de fala.
4. Baixe só a **faixa de fala limpa**; descarte fundo e reverberação (regra acima).
5. `pr_import_media` + `pr_place_clip_on_timeline` na trilha de voz, alinhada ao início do corte; deixe o
   áudio original desativado (não apague). Confira sincronia em dois pontos e meça com `pr_audit_timeline`.
Limite: o fundo vem numa faixa só; se um efeito sonoro do original precisa ficar, use (b).

**Se a pessoa não tem o conector:** diga que a limpeza automática de fala depende do conector da Adobe
no Claude e oriente a instalar: no Claude, abrir a lista de conectores, procurar "Adobe" (Adobe for
creativity), conectar e entrar com a conta Adobe; depois reabrir a conversa. Enquanto isso, siga por
(b), (c) ou (d) e diga qual usou.

**(b) Enhance Audio do Premiere pelo controle do computador** (clipe selecionado → Propriedades > Áudio >
Enhance Audio, com os níveis da regra acima), quando a pessoa autorizar o uso do mouse — é o único que
separa ambiente de efeitos sonoros. **(c)** Pedir à pessoa para clicar. **(d)** Sem nenhum dos anteriores,
`pr_apply_effect` "DeNoise" + "DeReverb" como aproximação, avisando que é inferior.

Quando: aplique o Enhance Audio **com o corte fechado** — ele processa só o trecho usado na sequência e
reanalisa se o clipe for aparado depois. Para transcrever e achar pausas antes disso, a fala crua ou com
"DeNoise" basta.

## 3. Regras de corte

| Regra | Valor |
|---|---|
| Onde cortar | Só em pausa entre frases, no silêncio |
| Tempos da transcrição | ±50–100 ms: guia, não ponto de corte |
| Ar no início / fim da peça | ≤ 0,15 s antes da 1ª palavra · ≤ 0,2 s depois da última |
| Consoante explosiva (p/t/k/b/d/g) | ~50 ms de ar antes |
| Respiração | Pertence à frase seguinte; nunca cortar no meio; não tirar todas |
| Pausa dentro da frase | 0,1–0,3 s |
| Entre frases | 0,3–0,5 s |
| Entre blocos | 0,6–1,0 s (nunca > 1,2 s nem < 0,1 s) |
| Clique na emenda | microfade de 5–15 ms (transição de áudio curta) |
| Takes diferentes | igualar nível (`pr_set_volume`), em geral ±2–3 dB |

- **Takes repetidos:** fica um. Em geral o último completo.
- **Nunca** montar frase que a pessoa não disse juntando pedaços.
- **Fillers:** "é…", "ãh", estalos e falsos começos saem sempre; "então", "tipo", "bom" são
  julgados caso a caso — na dúvida, ficam.
- **J/L cut** em algumas emendas (áudio 0,5–2 s antes/depois da imagem), não em todas.
- Riso e emoção inteiros, com entrada e saída.

## 4. Montar no Premiere

- Remover/fechar buraco: `pr_modify_timeline_clip({ remove: true, ripple: true })`; tirar um trecho no meio de
  um clipe (tropeço): `pr_edit_timeline({ operation: "extract", startSeconds, endSeconds })` — trave a trilha
  da música antes, se ela não deve encurtar.
- Nível: `pr_set_volume({ db })`; microfade: `pr_apply_transition` com transição de áudio
  (`pr_list_effects({ kind: "audioTransitions" })` para o nome exato) e `durationSeconds` 0,01.
- Marque emendas duvidosas: `pr_manage_markers({ operation: "add", name, comments })`.
- **Montagem por lista de segmentos:** `pr_apply_cut_plan` com os trechos `keep` (segundos da mídia
  original): coloca cada trecho em seguida, com o áudio. Fonte dos trechos: `cutPlan.keep` do
  `media_analyze_audio` (pausas longas fora, `padding` 0,1–0,15 s de ar) ou a sua lista editorial a
  partir da transcrição (tira repetição, falso começo). Guarde os `placed` devolvidos: são os tempos da
  fala na timeline para legenda (`media_build_captions` `keep`) e ducking (`pr_duck_music`).

**Trave a fala primeiro.** Só depois de cortes, pausas e níveis aprovados entram B-roll,
gráficos, música e legenda — mexer na fala depois desalinha tudo que está por cima.

## 5. Checklist por emenda

```
[ ] No silêncio?               [ ] Respiração inteira?
[ ] Sem palavra repetida/perdida (conferir com a transcrição)?
[ ] Pausa na faixa certa?      [ ] Nível igual?      [ ] Energia contínua?
```
Relate emendas suspeitas com **frase + timecode** ("…e foi por isso → 'o segundo ponto' @ 01:24").

## 6. Portão de saída

```
[ ] Modo combinado e respeitado; roteiro conferido contra a lista final
[ ] Nenhuma emenda audível; sem palavra repetida; sem frase "Frankenstein"
[ ] Pausas dentro das faixas; nenhuma > 1,2 s
[ ] Níveis iguais entre takes; voz em torno de 0 dB de referência
[ ] Prévias (pr_export_frame_or_sequence) nos pontos de emenda
[ ] Projeto salvo; qa-revisao-visual rodado
```
