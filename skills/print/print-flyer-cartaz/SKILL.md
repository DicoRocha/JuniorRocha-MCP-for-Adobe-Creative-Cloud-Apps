---
name: print-flyer-cartaz
description: Receita de flyer (A5/A4/DL, frente e verso) e cartaz (A3/A2/grande formato) no InDesign — leitura em 3 segundos ou a distância, foto que se dissolve no fundo, hierarquia, QR code, verso com informação prática, PDF/X com sangria e marcas. Use depois de print-fundamentos, para qualquer peça impressa de uma folha.
---

# print-flyer-cartaz — uma folha que se lê de passagem

Leia antes `print-fundamentos` (documento, estilos, cores, preflight).

## 1. Planejar

| Peça | Frente | Verso |
|---|---|---|
| Flyer A5 (148×210) / A4 / DL (99×210) | título + imagem + oferta/mensagem + CTA | detalhes, mapa, horários, contato, QR |
| Cartaz A3 (297×420) / A2 / maior | uma imagem dominante + título + informação prática na base | — |

Distância de leitura do cartaz → altura de letra do título ≈ distância ÷ 200–250
(3 m → 12–15 mm de altura de letra ≈ 48–60 pt de versal).

## 1b. Atalho: primeiro rascunho em uma chamada

`id_recipe_flyer` cria o documento novo já pronto para revisar: cores do kit de marca como amostras CMYK
(os valores oficiais do campo `cmyk` do kit; sem eles, conversão simples avisada em `notes`), estilos
MCP Chamada/Titulo/Subtitulo/Corpo/Lista/CTA/Rodape, imagem com sangria, botão de CTA do tamanho do texto,
faixa de rodapé com contato e logo. `layout`: `imagem-topo` (retrato), `imagem-cheia` (foto atrás, véu
degradê sob o texto) ou `lateral` (paisagem). Se o texto não couber, reduz os tamanhos juntos (nunca abaixo
de 6,5 pt) e avisa; depois audita e devolve a prévia. `savePath`/`pdfPath` opcionais. `theme: "papel"` para
fundo branco. Revise a hierarquia e o corte da foto; a seção 3 abaixo segue valendo para o acabamento.

## 2. Documento

`id_manage_document` create: `units: "mm"`, tamanho final, `pages: 2` se frente e verso,
`facingPages: false`, `margins` 10 (A5) / 12–15 (A4/A3), `bleed: 3` (5 em grande formato),
`intent: "print"`. Amostras CMYK (`id_swatches`) e estilos (`id_manage_styles`):
Título · Chapéu · Corpo · CTA · Nota/Contato.

## 3. Frente — receita "foto que se dissolve no fundo" (aprovada em 13/11/2026)

1. Fundo: `id_create_shape` retângulo da sangria (x −3, y −3, largura + 6, altura + 6) em preto rico/cor do fundo.
2. Foto: `id_place_file` com `fit: "fill"`, quadro da sangria superior até **por baixo** do bloco de texto
   (~85–90% da altura); a foto precisa ter ≥ 300 ppi efetivos (retorno `effectivePpi`).
3. Esmaecer a base da foto no fundo: `id_modify_objects` com
   `feather: { type: "directional", sides: { bottom: <≈35% da altura do quadro> } }`
   (ex. 69 mm num quadro de 191 mm). Lateral também, se a foto não ocupar a largura (`sides.right`).
4. Texto por cima da parte já escura: chapéu → título → apoio → CTA, alinhados à margem esquerda.
5. Selo/logo: `id_place_file` do `.ai` vinculado, `fit: "proportionally"`.
6. Contato: dados reais do cliente; sem dado → caixa marcada "[a preencher pelo cliente]" e avisar.

## 4. Regras

| Item | Valor |
|---|---|
| Título A5 | ≥ 28–36 pt; leitura em 3 s |
| Corpo | 9–11 pt; ≤ 3 linhas na frente |
| Texto vazado (claro no escuro) | ≥ 7–8 pt, sem serifa fina |
| QR code | ≥ 20 mm, zona de silêncio 4 módulos, K100 sobre claro, **testado** com um celular |
| Margem de segurança | ≥ 5 mm do corte |

## 5. Verso (se houver)

Grade de 2 colunas; endereço, horários, telefone, mapa simplificado (vetor), QR, redes. Mesmo
fundo/paleta da frente; logo na base.

## 6. Conferir e sair

1. `id_get_page_preview` de cada página (72–100 ppi).
2. `jradb_checkpoint` app indesign · `id_manage_document` save em `05_impressos/`.
3. `id_preflight` (minPpi 225) → zero erros.
4. `id_export` pdf `pdfPreset: "[PDF/X-4:2008]"`, `cropMarks: true` → confira no retorno
   `pdf.bleed: true`. O PDF fica maior que o formato (sangria + marcas): é o certo.
5. PDF de aprovação: `pdfPreset: "[Smallest File Size]"`, `bleed: false`.

## 7. Erros comuns

- Foto de rede (1080 px) ampliada para impresso.
- Corte reto entre foto e fundo (use o esmaecimento direcional).
- Telefone/endereço inventado.
- QR pequeno ou sem teste; QR sobre foto.
- PDF/X sem sangria (preset de fábrica sem "usar sangria do documento" — o `id_export` já corrige).

## 8. Portão

```
[ ] Lido em 3 s (flyer) ou a distância (cartaz)
[ ] Foto ≥ 300 ppi efetivos; esmaecimento sem emenda visível
[ ] Dados reais ou marcados "a preencher"; QR testado
[ ] Preflight ok; PDF/X-4 com sangria e marcas + PDF de aprovação
```
