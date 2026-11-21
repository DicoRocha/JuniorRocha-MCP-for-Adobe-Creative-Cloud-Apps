---
name: social-post
description: Produzir post estático para Instagram, Facebook, LinkedIn ou anúncio simples no Photoshop — do briefing ao PSD em camadas e PNG/JPG, com foto tratada, título, CTA e marca, em um ou vários formatos (4:5, 1:1, 9:16). Use para qualquer peça estática de rede social.
---

# social-post — post estático no Photoshop

Leia antes: `craft-composicao` e `craft-formatos`.

## 1. Antes de abrir

- Briefing mínimo: objetivo, mensagem única (título de 3–7 palavras), CTA, formato, marca.
- Texto real do cliente. Sem texto, escreva uma proposta e marque como proposta.
- Imagem: foto tratada no Lightroom (`lr_export_photos`, 2160–2400 px, sRGB) ou arquivo
  fornecido. Imagem gerada por IA vem de fora (Higgsfield/Magnific): sem texto embutido.

## 2. Montagem (uma etapa por chamada — evita timeout)

1. **Documento:** `ps_create_document({ name, width: 1080, height: 1350, resolution: 72, mode: "RGBColorMode" })`
   — ou abra o template da marca (`ps_open_document`).
2. **Foto:** abra (`ps_open_document`) e traga como camada; ajuste com
   `ps_modify_canvas` (crop/resizeImage) ou `ps_transform_and_manage_layer` (scale/translate).
   Enquadre o sujeito num terço, sem cortar cabeça/mãos/produto, com área calma para o texto.
3. **Recorte (se precisar):** `ps_selection_and_masks({ operation: "selectSubject" })` →
   `addMaskFromSelection`. Nunca apagar pixels. Confira o halo sobre fundo claro e escuro.
4. **Ajustes:** `ps_adjustment_layer` (curves, hueSaturation, colorLookup) com máscara e
   opacidade; mesmo look em toda a série.
5. **Proteção de leitura:** faixa sólida ou degradê (0 → 60%) onde o texto vai ficar.
6. **Texto:** `ps_create_layer({ layerType: "text", text, font: "<PostScript, ex. Arial-BoldMT>", fontSize, color, position })`.
   Título, subtítulo e CTA em camadas separadas e nomeadas. Ajuste com `ps_edit_text_layer`
   (tracking, leading, alignment).
7. **Marca:** logo do kit como Smart Object (`ps_smart_object`), com área de respiro, num canto
   consistente da série.
8. **Olhe:** `ps_get_canvas_snapshot({ maxDimension: 1080 })`. Corrija e olhe de novo.
9. **Salve:** `jradb_checkpoint({ app: "photoshop", label: "v1" })` e
   `ps_save_document({ filePath: ".../02_design/psd/<nome>_v01.psd", format: "psd" })`,
   depois `format: "png"` em `.../02_design/exports/` (redes sociais: sempre PNG).

## 3. Outros formatos (recompor, não esticar)

Para 1:1 e 9:16: duplique o PSD, mude o tamanho da tela (`ps_modify_canvas` resizeCanvas),
reposicione foto e textos para a nova proporção e respeite a zona segura de 9:16 (texto fora
de ~250 px do topo e ~400 px da base). Olhe cada versão.

## 4. Série (vários posts iguais)

- Monte um **template** com camadas nomeadas (Foto, Título, Subtítulo, CTA, Logo).
- Para cada peça: troque conteúdo do Smart Object da foto (`ps_smart_object` replaceContents),
  edite os textos (`ps_edit_text_layer` por `layerName`), olhe, exporte.
- Dados em planilha → um laço curto por peça (`jradb_batch` para agrupar edições de uma peça).

## 5. Regras de conteúdo

- Título legível com a imagem a ~400 px de largura (celular). Altura das letras do título
  ≥ 5% da altura da peça.
- Texto ≤ ~30% da área. Um CTA.
- Preço, condição e prazo reais. Sem depoimento ou selo inventado.
- Saúde/odontologia/estética: sem promessa de resultado; antes e depois só se permitido.

## 6. Portão de saída

```
[ ] Tamanho e zona segura corretos para cada formato
[ ] Título 3–7 palavras, legível reduzido; um CTA
[ ] Sujeito inteiro, recorte sem halo, foto sem estourar
[ ] Fontes e cores do kit; ≤ 2 famílias; 1 cor de destaque
[ ] Camadas nomeadas; PSD salvo + PNG exportado com nome no padrão
[ ] qa-revisao-visual rodado
```
