---
name: social-post
description: Produzir post estático para Instagram, Facebook, LinkedIn ou anúncio simples no Photoshop — do briefing ao PSD em camadas e PNG/JPG, com foto tratada, título, CTA e marca, em um ou vários formatos (3:4 1080×1440 por padrão, 4:5, 1:1, 9:16). Use para qualquer peça estática de rede social.
---

# social-post — post estático no Photoshop

Leia antes: `craft-composicao` e `craft-formatos`.

## 1. Antes de abrir

- Briefing mínimo: objetivo, mensagem única (título de 3–7 palavras), CTA, formato, marca.
- Texto real do cliente. Sem texto, escreva uma proposta e marque como proposta.
- Imagem: foto tratada no Lightroom (`lr_export_photos`, 2160–2400 px, sRGB) ou arquivo
  fornecido. Imagem gerada por IA vem de fora (Higgsfield/Magnific): sem texto embutido.

## 2. Montagem (uma etapa por chamada — evita timeout)

1. **Documento:** `ps_create_document({ name, width: 1080, height: 1440, resolution: 72, mode: "RGBColorMode" })` (3:4, padrão do Instagram; 1350 de altura = 4:5 só para agendador/API da Meta)
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

**Variações da mesma arte para mídia digital ficam num único PSD, uma prancheta por formato**, com nomes
claros (`Post 3x4 1080x1440`, `Story 9x16 1080x1920`, `Quadrado 1x1 1080x1080`). Fica mais fácil mudar as
duas à mão ou por automação (regra do usuário, 25/11/2026). Monte a 1ª prancheta inteira e crie as outras com
`ps_artboards` operation `duplicate` (`source`, `newName`, `width`, `height`), depois reenquadre; os Smart Objects dos assets
podem ser os mesmos (duplicados como instância) para trocar uma imagem e atualizar todas as pranchetas.
Exportação: uma imagem por prancheta, com o nome dela.

Em cada prancheta, reposicione foto e textos para a proporção (nunca esticar) e respeite a zona segura de
9:16 (texto fora de ~250 px do topo e ~400 px da base). Olhe cada versão.

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
