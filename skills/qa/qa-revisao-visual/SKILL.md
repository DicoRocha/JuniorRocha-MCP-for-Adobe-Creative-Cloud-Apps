---
name: qa-revisao-visual
description: Portão de saída de qualquer peça (post, anúncio, flyer, catálogo, vídeo, motion) — conferir visualmente no app, checar marca, fatos, formato e zona segura, montar folha de contato e relatar honestamente o que foi e o que não foi verificado. Use antes de toda entrega.
---

# qa-revisao-visual — portão de saída

Nenhuma peça sai sem passar por aqui. O retorno "ok" de uma ferramenta prova que o comando
rodou, não que a peça está certa.

## 1. Olhar de verdade

| App | Como ver | Quando |
|---|---|---|
| Photoshop | `ps_get_canvas_snapshot` (maxDimension 1080) | após cada bloco e no fim |
| Illustrator | `ai_get_artboard_preview` | idem |
| InDesign | `id_get_page_preview` (resolution 72–100) por página | toda página |
| Lightroom | `lr_get_photo_preview` antes × depois | a cada passo de revelação |
| After Effects | `ae_get_comp_frame_preview` em início, pico, transição, fim (salve antes: `jradb_checkpoint`) | fim de cada cena |
| Premiere | `pr_export_frame_or_sequence` (mode frame) em pontos-chave | após montar e após legendas |

Ao olhar, procure ativamente: texto cortado ou sobrando, elemento fora da zona segura, quase-
alinhamentos (2–3 px), contraste fraco de texto, halo de recorte, imagem pixelada, logo
deformado, erro de digitação.

**Auditoria automática (rode antes do olhar final, não no lugar dele):**

| App | Ferramenta | O que mede |
|---|---|---|
| Photoshop | `ps_audit_document` (`format` opcional) | zona segura do formato, contraste real texto × fundo (WCAG), texto pequeno no celular, RGB/sRGB/8 bits, camadas sem nome |
| InDesign | `id_audit_document` | texto excedente, sem estilo, corpo mínimo, texto perto do corte, sangria, ppi efetivo, vínculos, RGB em impresso, fontes |
| Premiere | `pr_audit_timeline` (`renderPath` para loudness) | buracos, mídia offline, clipes desativados, trilha muda, tamanho do quadro, loudness e pico |
| After Effects | `ae_audit_motion` | expressão com erro, mídia ausente, movimento linear, tempo de leitura do texto, faixas de degradê em 8 bpc |

Erros (`error`) se corrigem antes de entregar; avisos (`warn`) se conferem um a um e se explicam no
relatório quando ficam de propósito.

## 2. Checklist universal

```
[ ] Uma mensagem, um ponto focal, um CTA
[ ] Teste do aperto de olhos: desfocado, a hierarquia continua clara
[ ] Formato e pixels/mm do destino corretos (craft-formatos)
[ ] Nada essencial fora da zona segura
[ ] Texto legível no tamanho real (celular: imagem a ~400 px de largura)
[ ] Contraste de texto ≥ 4,5:1 (≥ 3:1 para texto grande)
[ ] ≤ 2 famílias, ≤ 3 pesos, 1 cor de destaque, espaçamento da escala
[ ] Marca: logo correto, com respiro, cores e fontes do kit
[ ] Fatos: preço, data, telefone, endereço, nomes conferidos contra a fonte
[ ] Nada inventado (depoimento, número, selo, resultado)
[ ] Arquivo editável salvo + saída exportada + nomes no padrão
[ ] Camadas organizadas por sentido: grupos com nome, nada relacionado solto (craft-organizacao-camadas)
```

Checklists específicos ficam no portão de cada skill de área (`social-post`,
`video-fala-limpa`, `print-fundamentos`…). Rode os dois.

## 3. Série e campanha

- **Folha de contato:** `jradb_contact_sheet` na pasta de entrega (ou `ae_contact_sheet` para uma
  animação) e compare: mesma grade, mesma tipografia, mesma cor de destaque, mesmo tratamento de foto.
- Peças derivadas (4:5, 9:16, 1:1) são **recompostas**, não esticadas: confira cada uma.
- Numere e nomeie: `01.png … 10.png` para carrossel; `cliente_campanha_peca_formato_v01`.

## 4. Correção

Achou problema → corrija → olhe de novo. Máximo de 3 voltas na mesma questão; se não
resolver, pare e descreva o problema para a pessoa em vez de insistir.

## 5. Relatório de entrega (sempre)

1. O que foi entregue e onde (caminhos).
2. Prévia: imagem das peças ou folha de contato.
3. **Suposições** feitas (texto provisório, cor escolhida sem kit, dado não fornecido).
4. **Não verificado** (impressão real, aparência na plataforma, fontes no computador de outra pessoa).
5. Depende de terceiros (gráfica, aprovação do cliente, regras da plataforma).

Nunca diga "idêntico à referência" ou "pronto para impressão" sem a evidência que sustente.

## Regras de 18/11/2026 — itens obrigatórios da revisão

```
[ ] Texto dentro de formas centralizado pela altura da maiúscula (zoom 200 %); ajuste óptico se preciso
[ ] Nenhum título ou apoio com palavra sozinha na última linha; linhas equilibradas
[ ] Espaços etiqueta/título/apoio semelhantes entre si
[ ] Série de fotos do mesmo ensaio com luz equilibrada (fundo e pele medidos, não no olho)
[ ] Bordas de máscara sem franja da cor antiga (zoom 100 % nas bordas)
[ ] Peça surpreende? Se é só o básico correto, volte e suba o nível (qa-anti-generico)
```
