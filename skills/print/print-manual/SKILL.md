---
name: print-manual
description: Diagramar manual, guia, apostila, regulamento ou livreto de muitas páginas no InDesign — páginas-mestre com numeração automática, estilos de títulos e corpo, sumário gerado, avisos destacados, referências cruzadas, seções e PDF para impressão e para tela. Use para "manual do paciente", "guia do colaborador", "apostila", "livro" ou "regulamento".
---

# print-manual — texto longo que se acha e se lê

Antes: `plan-espelho-impresso` (quantas páginas, capítulos), `print-fundamentos`. App: `app-indesign`.

## 1. Atalho: esqueleto em uma chamada

`id_recipe_manual_skeleton({ title, chapters: [{ title, sections: [...] }], size: "A5", kitPath })` cria
documento novo com páginas espelhadas: capa na faixa da marca, sumário automático (com pontilhado e
página), abertura de capítulo em página ímpar (mestre B, só número), texto encadeado em quantas páginas
precisar (mestre A, cabeçalho + número automático), seções numeradas 1.1, 1.2…, texto provisório e um
"Aviso" de exemplo. Depois é trocar o texto e regenerar o sumário.

## 2. Formato e grade

| Tipo | Formato | Corpo | Margens |
|---|---|---|---|
| Manual/guia de bolso | A5 (148×210) | 9,5–10,5 pt / entrelinha 1,4–1,5 | 15–18 mm, interna +3 mm |
| Apostila | A4 | 10,5–11 pt, 2 colunas se > 75 caracteres por linha | 18–20 mm |

Linha de 55–75 caracteres; páginas espelhadas para impresso encadernado; total múltiplo de 4 (grampo)
ou de 16 (lombada) — confirmar com a gráfica.

## 3. Estilos (nada formatado à mão)

`Titulo 1` (capítulo), `Titulo 2` (seção), `Corpo`, `Lista`, `Aviso` (sombreamento na cor de destaque
18 %), `Legenda`, `Cabecalho`, `Numero Pagina`. Criar/ajustar: `id_manage_styles`. Viúvas e órfãs:
manter 2 linhas juntas no Corpo; Titulo 1/2 "manter com a próxima".

## 4. Texto

1. Texto do cliente (DOCX/TXT) colado ou importado na história encadeada; aplicar estilos por busca:
   `id_find_change` (ex. linhas que começam com "1.1 " → Titulo 2).
2. Avisos (cuidados, alertas legais) sempre no estilo `Aviso`, nunca em vermelho solto.
3. Novos quadros/páginas: `id_manage_pages` + `id_thread_text`.

## 5. Navegação

- Sumário: `id_create_toc` com Titulo 1 (nível 1) e Titulo 2 (nível 2); regenerar a cada mudança.
- Seções e numeração (capa sem número, miolo começando em 1): `id_manage_sections`.
- PDF para tela com marcadores e links do sumário (`id_export` pdf, preset leve).

## 6. Revisão e saída

1. `id_audit_document` + `id_preflight`: texto excedente, fontes, imagens < 300 ppi, RGB no impresso.
2. Prévia de 1 página por capítulo (`id_get_page_preview`).
3. PDF/X-4 para gráfica com sangria 3 mm (`id_export`) e PDF leve para envio; `id_package` se pedido.

## 7. Portão de saída

```
[ ] Formato, corpo e margens conforme a tabela; total de páginas aceito pela gráfica
[ ] 100 % do texto com estilos; avisos no estilo Aviso
[ ] Sumário regenerado depois da última mudança; números de página automáticos
[ ] Auditoria sem texto excedente nem imagem abaixo de 300 ppi
[ ] PDF de impressão e PDF de tela exportados
```
