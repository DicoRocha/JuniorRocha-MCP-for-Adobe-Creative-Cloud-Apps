---
name: vetor-pacote-de-marca
description: Exportar logo, selo ou ícones em todas as versões e formatos de entrega — SVG, PNG transparente em vários tamanhos, PDF vetorial, versões cor/negativa/mono, favicon e avatar — com nomes padronizados e uma folha de uso. Use ao entregar identidade, selo de campanha ou família de ícones.
---

# vetor-pacote-de-marca — tudo o que o cliente vai pedir depois

Antes: `vetor-logo-e-selo` (versões prontas, uma por prancheta). App: `app-illustrator`.

## 1. Estrutura do pacote

```
06_entrega/marca/
├── svg/      marca_cor.svg · marca_negativa.svg · marca_mono-preto.svg · marca_simbolo.svg
├── png/      marca_cor_512.png · _1024 · _2048 (transparente) · negativa e mono idem
├── pdf/      marca_vetor.pdf (todas as versões, uma por página)
├── web/      favicon_32.png · favicon_180.png (apple-touch) · avatar_1080.png (fundo sólido)
├── fonte/    marca.ai (editável, com amostras)
└── uso.pdf   folha de uso (áreas de proteção, tamanhos mínimos, cores)
```

Nome: `cliente_marca_versao_tamanho.ext`, minúsculas, sem acento.

## 1b. Atalho: o pacote em uma chamada

Com o logo aprovado aberto no Illustrator (uma prancheta; outra chamada `simbolo`/`icone` vira a marca
quadrada), `ai_recipe_logo_package` com `outDir` e o kit de marca: salva uma **cópia** em `fonte/` (o
original não muda), cria as pranchetas negativa (branco puro), mono-preto (preto 100 %), avatar, favicon e a
folha de uso (versões sobre claro/escuro, área de proteção, tamanho mínimo, cores HEX/CMYK) e exporta
`svg/`, `png/` (512, 1024, 2048 px transparentes), `web/` (favicon 32/180/512, avatar 1080) e `pdf/`.
Devolve uma folha com cada versão sobre fundo claro e escuro. Imagens ou objetos especiais dentro do
logo são avisados (não dá para recolorir: vetorize/expanda e rode de novo). Depois siga o portão abaixo.

## 2. Exportar (uma prancheta por versão)

1. Confira as pranchetas: `ai_get_document_info` (nomes e índices).
2. SVG por prancheta: `ai_export_assets({ format: "svg", artboardIndex, filePath })`.
3. PNG transparente: `ai_export_assets({ format: "png", artboardIndex, scale, transparency: true })`
   — escala a partir do tamanho da prancheta (prancheta 256 pt → scale 200 = 512 px; 400 = 1024 px).
4. Avatar/favicon: prancheta própria com fundo sólido e margem (símbolo ocupa ~70 %).
5. PDF vetorial: salvar cópia como PDF (`ai_execute_extendscript` com `PDFSaveOptions`,
   script curto) ou pela pessoa no app.
6. Olhe cada PNG sobre fundo claro e escuro (abra no Photoshop: `ps_open_document` +
   `ps_get_canvas_snapshot`).

## 3. Folha de uso (1 página)

Feita no InDesign ou Illustrator: logo com **área de proteção** (ex. altura do "x" da marca em
volta), **tamanho mínimo** (mm e px), versões e quando usar cada uma, cores em HEX/RGB/CMYK
(e Pantone se houver), usos proibidos (esticar, mudar cor, sombra, sobre fundo poluído).

## 4. Cores por destino

- SVG/PNG/web: sRGB (HEX).
- Impresso: CMYK da gráfica no PDF/AI; se houver Pantone, amostra spot nomeada.
- Confira que a negativa é branca pura e a mono é preto 100 % (não preto composto).

## 5. Portão de saída

```
[ ] Todas as versões × formatos da estrutura exportados e abertos
[ ] PNG transparentes sem borda/halo; tamanhos certos (px conferidos)
[ ] SVG abre e mantém cor; PDF vetorial
[ ] Favicon/avatar legíveis em 32 px
[ ] Folha de uso com proteção, mínimo, cores e proibições
[ ] Nomes padronizados; editável (.ai) incluído
```
