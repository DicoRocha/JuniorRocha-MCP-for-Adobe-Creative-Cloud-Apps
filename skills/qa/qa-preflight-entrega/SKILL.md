---
name: qa-preflight-entrega
description: Fechar e entregar um trabalho — estrutura de pastas da campanha, nomes e versões, arquivos editáveis salvos, saídas por canal em 06_entrega, PDFs de impressão e aprovação, pacote, folha de contato e relatório honesto (feito, suposto, não verificado, pendente). Use no fim de qualquer peça, série ou campanha.
---

# qa-preflight-entrega — o pacote final

Depois de `qa-revisao-visual` (cada peça olhada).

## 1. Estrutura

```
CLIENTE/ANO_CAMPANHA/
├── 00_briefing/    briefing.md, kit-de-marca.json, roteiros, direcao-motion.md
├── 01_fotos/       fotos tratadas exportadas (insumo)
├── 02_design/      ai/  psd/  exports/  (carrossel/)
├── 03_motion/      .aep, _checkpoints/, render/
├── 04_video/       .prproj, qa/ (quadros de conferência)
├── 05_impressos/   .indd, _checkpoints/
└── 06_entrega/     feed/  stories/  video/  impressos/  selo/  folha-de-contato.jpg
```

O MCP cria pastas ao salvar/exportar; mesmo assim crie a árvore no início (`plan-briefing`).

## 2. Nomes e versões

`cliente_campanha_peca_formato_v01.ext` — minúsculas, sem acento nem espaço, versão com 2 dígitos.
Nunca "final", "final2". A versão sobe a cada rodada de alteração enviada ao cliente.

## 3. Conferir o que existe (não o que a ferramenta disse)

| Item | Como |
|---|---|
| Editáveis salvos | PSD/AI/AEP/PRPROJ/INDD existem e abrem; `jradb_checkpoint` da versão entregue |
| Vínculos | `id_links` sem ausente/modificado; Premiere sem mídia offline; AE sem footage faltando |
| Saídas | listar a pasta `06_entrega` (tamanho > 0, datas recentes) |
| Vídeo | arquivo final (não temporários do Media Encoder), duração e resolução certas |
| PDF impressão | PDF/X-4 com sangria e marcas (`id_export` retorna `pdf.bleed`, `pdf.cropMarks`) |
| PDF aprovação | leve, sem marcas |
| Fontes | sem substituição (camadas de texto conferidas) |

## 4. Folha de contato

Uma imagem com todas as peças lado a lado (posts, stories, quadro dos vídeos, impresso exportado em JPG,
selo): `jradb_contact_sheet({ folder: ".../06_entrega", recursive: true })` — ordem pelo nome, ignora
pastas e arquivos que começam com "_", grava `_folha-de-contato.png` na pasta. Olhe a folha antes de
entregar: unidade de cor, tipo e grade na série.

## 5. Pacote (quando pedido)

InDesign: `id_package({ folder, includeIdml: true })` (fontes, vínculos, relatório; documento salvo) —
confira `fontFiles`/`linkFiles` no retorno. After Effects: Collect Files (pela pessoa). Zipar `06_entrega`.

## 6. Limpeza

- Arquivos de teste e temporários fora da entrega (mover para `_lixo/` ou pedir permissão para apagar).
- Arquivos de bloqueio (`~*.idlk`) somem ao fechar o documento.
- Pastas `Auto-Save` do Premiere ficam (são do app).

## 7. Relatório de entrega (sempre)

1. **Entregue:** lista por canal com caminhos.
2. **Prévia:** folha de contato + prévia leve do vídeo.
3. **Suposições:** textos propostos, cores sem kit, idioma, dados "a preencher".
4. **Não verificado:** impressão real, aparência na plataforma, fontes em outra máquina, loudness (se não medido).
5. **Depende de terceiros:** gráfica, aprovação, regras da plataforma/conselho.

## 8. Portão

```
[ ] Estrutura de pastas e nomes no padrão
[ ] Editáveis salvos + saídas conferidas no disco
[ ] Vínculos ok; nenhum temporário na entrega
[ ] Folha de contato gerada
[ ] Relatório com suposições e o que não foi verificado
```
