---
name: vetor-embalagem-rotulo
description: Diagramar rótulo, etiqueta ou embalagem no Illustrator sobre a faca da gráfica — camadas de faca e verniz, sangria, áreas de dobra e colagem, painel principal, informações obrigatórias (tabela nutricional, ingredientes, validade, lote), código de barras e PDF de produção. Use para "rótulo", "etiqueta", "embalagem", "caixa" ou "sachê".
---

# vetor-embalagem-rotulo — a faca manda

Base: `print-fundamentos`, `craft-marca`, `craft-tipografia`. App: `app-illustrator`.
Mockup para aprovação: `design-mockup`. Logo: `vetor-pacote-de-marca`.

## 1. Antes de desenhar (perguntar à gráfica e ao cliente)

| Item | Por quê |
|---|---|
| Faca (PDF/AI) com medidas finais | dobras, cortes e colagem vêm dela; nunca desenhar a faca "de cabeça" |
| Substrato (papel, BOPP, kraft, metalizado) | branco de base, cores que mudam no kraft/metalizado |
| Processo (offset, digital, flexo) e cores (CMYK, Pantone, branco) | traço mínimo, retícula, cor especial |
| Textos legais do segmento | o cliente fornece e responde por eles (alimentos, cosméticos, saneantes) |

## 2. Documento

1. `ai_manage_document` create em CMYK, prancheta = faca aberta + 3 mm de sangria por lado.
2. Camadas (`ai_manage_layers`), de cima para baixo: `Faca` (não imprime), `Verniz`/`Branco` (se houver),
   `Textos`, `Arte`, `Fundo`. Faca e acabamentos em **cores especiais nomeadas** (`ai_swatches`: "Faca",
   "Verniz") com sobreimpressão.
3. Margem segura: 3 mm de cada corte e 2 mm de cada dobra para texto e logo.

## 3. Hierarquia do painel principal (vista a 1–2 m na gôndola)

1. Marca (reconhecível em 1 s), 2. o que é o produto, 3. variante/sabor/cor, 4. conteúdo líquido
   (exigência legal na face principal na maioria dos segmentos), 5. selos verdadeiros.
- Uma cor de destaque por variante; a família de rótulos muda só a cor e a variante.
- Contraste do texto legal ≥ 4,5:1; corpo mínimo 6–7 pt (confirmar a norma do segmento).

## 4. Informações obrigatórias (painéis laterais/traseiro)

- Ingredientes, tabela nutricional ou composição, modo de uso, advertências, fabricante, CNPJ, SAC,
  lote e validade (área em branco ou reservada para impressão posterior, combinada com a gráfica).
- Tabela: `ai_create_text` com tabulações, ou montar no InDesign e colar vetorizada.
- Nada de inventar alegação ("sem açúcar", "natural", "clinicamente testado") que o cliente não comprovou.

## 5. Código de barras e QR

- EAN-13 do cliente (nunca inventar número); gerado em vetor, 100 % preto sobre branco, tamanho nominal
  37,29 × 25,93 mm (mín. 80 %), zona de silêncio respeitada, fora de dobras e curvaturas.
- QR com link real testado no celular, ≥ 15 mm.

## 6. Revisão e saída

1. Prévia: `ai_get_artboard_preview` com e sem a camada Faca; mockup 3D para aprovação (`design-mockup`).
2. Converter fontes em curvas **numa cópia** (o original fica editável); imagens ≥ 300 ppi vinculadas.
3. Leia em voz alta todos os textos legais contra o arquivo do cliente.
4. PDF/X-4 de produção (`ai_export_assets` / salvar como PDF) com faca e acabamentos em camadas
   separadas; arquivo editável `.ai` junto.

## 7. Portão de saída

```
[ ] Faca da gráfica, substrato, processo e cores confirmados antes do layout
[ ] Camadas Faca/Verniz em cores especiais nomeadas com sobreimpressão
[ ] Sangria 3 mm; texto a ≥ 3 mm do corte e ≥ 2 mm da dobra
[ ] Informações obrigatórias completas e conferidas contra o cliente; nenhuma alegação sem prova
[ ] EAN real em vetor, tamanho ≥ 80 %, preto sobre branco; QR testado
[ ] PDF/X-4 + .ai editável + cópia com textos em curvas
```
