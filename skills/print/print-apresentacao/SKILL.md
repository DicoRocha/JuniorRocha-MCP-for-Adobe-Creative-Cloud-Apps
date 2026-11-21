---
name: print-apresentacao
description: Diagramar apresentação 16:9 no InDesign (proposta comercial, apresentação institucional, pitch, relatório em slides) — uma ideia por slide, grade, estilos, páginas-mestre por tipo de slide e PDF para tela e para impressão. Use quando a apresentação precisar sair em PDF com acabamento de design e a pessoa não pediu um arquivo PowerPoint.
---

# print-apresentacao — um slide, uma ideia

Base: `craft-composicao`, `craft-tipografia`. App: `app-indesign`. Para PowerPoint editável use a
ferramenta de apresentações do próprio cliente; aqui o produto é o PDF.

## 1. Formato

- Página 1920 × 1080 px (ou 338,7 × 190,5 mm), intenção web, sem sangria; margens 80 px (6 %).
- Grade de 12 colunas, medianiz 24 px; linha de base 8 px.
- Impressão do mesmo PDF: A4 paisagem com escala — confira tamanhos mínimos (corpo ≥ 18 pt na tela).

## 2. Tipos de slide (páginas-mestre)

| Mestre | Uso |
|---|---|
| A-Capa | título, subtítulo, logo, data |
| B-Seção | número + nome da seção em tela cheia na cor de destaque |
| C-Conteúdo | título no topo + área de 12 colunas |
| D-Imagem | foto sangrando + legenda curta |
| E-Número | um número grande + 1 frase de contexto |

Criar: `id_manage_document` (create), `id_manage_pages` para mestres e páginas, `id_manage_styles`.

## 3. Regras de conteúdo

- 1 ideia por slide; título é a conclusão ("A fila caiu 40 %"), não o tema ("Resultados").
- ≤ 30 palavras por slide de conteúdo; bullets ≤ 5, sem frases completas encadeadas.
- Títulos 44–60 pt, corpo 20–28 pt, legenda ≥ 16 pt.
- Gráficos simples refeitos (não print de planilha): `id_create_table` ou vetor do Illustrator vinculado.
- Número só com fonte (rodapé do slide).

## 4. Montagem

1. Estilos: `Titulo`, `Subtitulo`, `Corpo`, `Lista`, `Numero Grande`, `Legenda`, `Fonte` (`id_manage_styles`).
2. Textos: `id_create_text_frame` com estilo; imagens: `id_place_file` (ajuste proporcional, foto ≥ 1920 px).
3. Cores: `id_swatches` do kit (RGB, intenção web).
4. Conferir slide a slide: `id_get_page_preview`; série inteira numa folha com `jradb_contact_sheet` a
   partir das prévias exportadas.

## 5. Saída

- PDF para tela (preset leve, RGB) com `id_export`; tamanho < 20 MB para envio por e-mail.
- Versão para impressão só se pedida (A4 paisagem, CMYK, `id_preflight` antes).

## 6. Portão de saída

```
[ ] 1920×1080, margens 6 %, grade de 12 colunas
[ ] Mestres por tipo de slide; todo texto com estilo
[ ] Títulos são conclusões; ≤ 30 palavras por slide de conteúdo
[ ] Tamanhos mínimos respeitados (corpo ≥ 20 pt)
[ ] PDF de tela < 20 MB conferido página a página
```
