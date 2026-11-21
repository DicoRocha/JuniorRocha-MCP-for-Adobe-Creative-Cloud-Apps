---
name: plan-espelho-impresso
description: Planejar um impresso de várias páginas (catálogo, folder, brochura, manual, revista) antes do InDesign — espelho de páginas, módulos, planilha de dados para data merge e especificação da gráfica (formato, sangria, papel, cor, acabamento). Use antes de print-catalogo, print-brochura-folder ou qualquer peça com mais de 2 páginas.
---

# plan-espelho-impresso — espelho, dados e especificação

Base: `docs/conhecimento/07`. Depois: `print-catalogo`, `print-brochura-folder`,
`print-fundamentos`.

## 1. Especificação da gráfica (pergunte ou proponha e marque como suposição)

| Item | Exemplo |
|---|---|
| Formato fechado / aberto | A4 210×297 / A3 aberto; folder A4 com 2 dobras = 297×210 aberto |
| Páginas | múltiplo de 4 para grampo/lombada canoa (8, 12, 16…) |
| Sangria / margem de segurança | 3 mm / 5 mm (confirmar com a gráfica) |
| Cor | CMYK (perfil da gráfica, ex. PSO Coated v3 / FOGRA51), 4/4 |
| Papel | couché 150 g (miolo), 300 g (capa) |
| Acabamento | grampo, lombada quadrada, laminação, verniz localizado, faca |
| Saída | PDF/X-4 com sangria e marcas (`id_export`) |

## 2. Espelho de páginas

Tabela página a página (ou miniaturas em 2 colunas = pares de páginas):

```
pág · conteúdo · módulo/página-mestre · imagens · texto (palavras) · origem do dado
```

- Capa e contracapa primeiro; páginas ímpares à direita.
- Ritmo: alternar página cheia de imagem com página de informação; seções com abertura.
- **Páginas-mestre** por tipo: A = padrão (fólio, rodapé), B = abertura de seção, C = produto.

## 3. Catálogo: planilha de dados

CSV com uma linha por item e colunas com nomes de campo (sem espaços/acentos se possível):
`codigo;nome;descricao;preco;foto;categoria`.
- `foto` com caminho relativo à pasta de imagens (`imageFolder` do `id_data_merge`).
- Preços como texto já formatado ("R$ 199,90") — o InDesign não formata número.
- Ordene pela ordem das páginas; categorias viram aberturas de seção.

## 4. Texto

- Conte palavras por página para o módulo caber (corpo 9–10 pt ≈ 350–450 palavras por coluna A4).
- Texto final e revisado antes da diagramação; correções depois custam páginas.

## 5. Saída

`00_briefing/espelho.md` (especificação + espelho), `00_briefing/dados.csv` (catálogo),
pasta `05_impressos/links/` com as imagens.

## 6. Portão de saída

```
[ ] Especificação da gráfica completa (ou suposições marcadas)
[ ] Nº de páginas compatível com o acabamento
[ ] Espelho página a página com página-mestre e origem do conteúdo
[ ] Planilha com campos nomeados, preços formatados, caminhos de imagem válidos
[ ] Textos aprovados antes da diagramação
```
