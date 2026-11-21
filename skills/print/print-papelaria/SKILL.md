---
name: print-papelaria
description: Produzir papelaria da marca — cartão de visita, papel timbrado, envelope, pasta e assinatura de e-mail — com medidas padrão, sangria, áreas seguras, dados por pessoa em lote e arquivos para gráfica e para uso digital (timbrado em Word/PDF). Use para "cartão de visita", "timbrado", "envelope", "papelaria" ou "assinatura de e-mail".
---

# print-papelaria — peças pequenas, tolerância zero

Base: `print-fundamentos`, `craft-marca`. Apps: `app-indesign` (montagem e lote), `app-illustrator`
(logo e elementos). Logo: `vetor-pacote-de-marca`.

## 1. Medidas

| Peça | Formato final | Sangria | Margem segura |
|---|---|---|---|
| Cartão de visita | 90 × 50 mm (Brasil) / 85 × 55 mm (Europa) | 3 mm | 4 mm |
| Papel timbrado | A4 210 × 297 mm | 3 mm (se impresso em gráfica) | 15–20 mm |
| Envelope ofício | 229 × 114 mm (DL 220 × 110) | conforme a faca da gráfica | 10 mm |
| Envelope saco | 240 × 340 mm | faca | 15 mm |
| Assinatura de e-mail | 600 × 150 px máx. | — | — |

Faca e medidas finais **sempre** confirmadas com a gráfica antes de diagramar.

## 2. Cartão de visita

1. `id_manage_document` create 90×50 mm, 2 páginas (frente/verso), sangria 3 mm, margem 4 mm.
2. Logo vinculado (.ai) com `id_place_file`; tamanho mínimo do pacote de marca respeitado.
3. Dados: nome 9–11 pt, cargo 7–8 pt, contatos 7–8 pt (nunca < 6,5 pt); 1 família tipográfica.
4. Vários funcionários: template com `{{nome}}`, `{{cargo}}`, `{{telefone}}`, `{{email}}` → planilha →
   `id_data_merge` (um cartão por linha) → conferir nomes e telefones um a um.
5. Acabamentos especiais (verniz localizado, hot stamping): camada separada, cor especial nomeada.

## 3. Papel timbrado

- Uso real é digital: além do PDF de gráfica, gere modelo para o escritório (PDF de fundo ou DOCX com
  cabeçalho/rodapé). Área de texto livre ≥ 70 % da página.
- Cabeçalho ≤ 35 mm, rodapé ≤ 20 mm; endereço e CNPJ/registro no rodapé 7–8 pt.

## 4. Envelope e pasta

Diagrame sobre a faca da gráfica (camada "Faca" sem impressão, cor especial "Faca" em sobreimpressão);
nada importante a menos de 10 mm das dobras.

## 5. Assinatura de e-mail

PNG/HTML com largura ≤ 600 px; texto real (não imagem) para nome e telefone; logo em PNG 2× (até
300 × 100 px de exibição); exportar o logo com `ai_export_assets`.

## 6. Revisão e saída

1. `id_preflight` + `id_audit_document`: fontes, CMYK, texto a menos da margem segura.
2. Leia em voz alta cada telefone, e-mail e endereço contra a fonte do cliente.
3. PDF/X-4 com sangria e marcas de corte (se a gráfica pedir) via `id_export`; `id_package` com fontes e links.

## 7. Portão de saída

```
[ ] Medidas e faca confirmadas com a gráfica
[ ] Sangria 3 mm e margem segura respeitadas; texto ≥ 6,5 pt
[ ] Dados conferidos item a item contra a fonte; lote por id_data_merge revisado
[ ] Timbrado também em versão de uso digital
[ ] PDF/X-4 e pacote entregues
```
