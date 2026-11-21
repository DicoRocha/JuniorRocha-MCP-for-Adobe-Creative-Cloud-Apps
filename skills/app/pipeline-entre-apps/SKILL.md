---
name: pipeline-entre-apps
description: Como passar trabalho entre Lightroom, Photoshop, Illustrator, After Effects, Premiere e InDesign numa campanha — ordem dos apps, formato de cada passagem, vínculo em vez de cópia (PSD/AI no InDesign, Dynamic Link AE→PR), o que atualizar quando algo muda e as armadilhas observadas nos testes de 12 e 13/11/2026. Use em qualquer trabalho que envolva mais de um app.
---

# pipeline-entre-apps — o que passa, em que formato

## 1. Ordem

```
Lightroom (fotos tratadas) → Photoshop (posts, arte-chave, derivações)
                           → Illustrator (selo, logo, ícones)        ─┐
After Effects (abertura, títulos, encerramento) ← PSD em camadas, AI ─┤
Premiere (montagem, transições, som, export) ← fotos + comps AE (DL)  │
InDesign (impressos, pranchas) ← fotos, PSD, AI vinculados ───────────┘
→ 06_entrega (qa-preflight-entrega)
```

## 2. Passagens

| De → Para | Formato | Como |
|---|---|---|
| LR → PS/AE/PR/ID (tela) | JPEG 2400 px sRGB, **sem nitidez** | `lr_export_photos` (coleção) para `01_fotos/` |
| LR → impresso | TIFF/JPEG 100 no tamanho final a 300 ppi | idem |
| PS → AE | **PSD em camadas** nomeadas | `ae_manage_project` import `compCroppedLayers` (comp com as posições) |
| PS → ID | PSD vinculado | `id_place_file` (fit proportionally) |
| PS → PR | JPG/PNG exportado | `pr_import_media` |
| AI → PS | PNG transparente da prancheta | `ai_export_assets` png → inserir como camada |
| AI → AE | .ai ou PNG | importar; ligar rasterização contínua se escalar |
| AI → ID | **.ai vinculado** | `id_place_file` |
| AE → PR | **Dynamic Link** | `pr_import_media` com o `.aep` e `aeCompNames` |
| AE → arquivo | render | `ae_render_queue` |
| PR → ID (prancha, storyboard) | quadros PNG | `pr_export_frame_or_sequence` frame + `timeSeconds` → `id_place_file` |
| PR → entrega | MP4 H.264 | Media Encoder (`video-cor-e-export`) |

`jradb_bridge_transfer` faz PS→AE numa chamada (exporta e importa).

## 3. Vínculo, não cópia

- Correção no PSD/AI → `id_links` update no InDesign e reabrir no AE (Dynamic Link atualiza sozinho no Premiere).
- Reexportar um quadro com o **mesmo nome** atualiza o vínculo no InDesign (`id_links` update).
- Nunca colar imagem embutida no InDesign; nunca achatar a arte-chave antes de derivar.

## 4. Ordem de produção numa campanha

kit de marca → fotos tratadas → selo/vetores → posts (template + Smart Object) → derivações →
motion (abertura, títulos, encerramento) → montagem e export → impressos/pranchas → folha de
contato e entrega.

## 5. Armadilhas observadas

| Situação | O que fazer |
|---|---|
| AE travado → Premiere trava ao mostrar a comp DL | Recuperar o AE primeiro (`ops-recuperacao`); depois o Premiere |
| Script no AE que salva com o Premiere aberto | Salvar só por `ae_manage_project` |
| Projeto novo no Premiere com outro aberto | `pr_manage_project` new já fecha o anterior |
| Foto de rede usada no impresso | Exportar de novo do LR em alta |
| Selo PNG pequeno escalado no AE | Usar o .ai com rasterização contínua, ou PNG em 2× |

## 6. Portão

```
[ ] Cada passagem no formato da tabela
[ ] Impressos com PSD/AI vinculados; vínculos atualizados
[ ] Comps do AE no Premiere por Dynamic Link (ou render existente)
[ ] Uma peça alterada → todas as dependentes atualizadas
```
