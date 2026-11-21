---
name: foto-saida
description: Exportar fotos do Lightroom Classic (ou do Photoshop) com formato, tamanho, espaço de cor e nitidez certos para cada destino — rede social, site, Photoshop/After Effects/Premiere, impressão — com nomes no padrão e pasta da campanha. Use ao entregar fotos tratadas ou ao preparar fotos para outro app.
---

# foto-saida — formato por destino

## 1. Tabela de destinos (`lr_export_photos`)

| Destino | format | longEdge | colorSpace | sharpen | quality |
|---|---|---|---|---|---|
| Rede social (entrega final) | JPEG | 2160–2400 | sRGB | screen, standard | 85–92 |
| Vai para Photoshop/AE/Premiere/InDesign (tela) | JPEG | 2400 | sRGB | **none** | 92 |
| Vai para o Photoshop (retoque pesado) | TIFF (16 bits) ou PSD | original | AdobeRGB | none | — |
| Site / e-commerce | JPEG | 1600–2000 | sRGB | screen | 75–85 |
| Impressão | TIFF ou JPEG 100 | tamanho final a 300 ppi (A5 = 1748 × 2480 px; A4 = 2480 × 3508) | AdobeRGB (CMYK no fim, no ID/PS) | matte ou glossy | 100 |
| Arquivo do cliente | ORIGINAL | — | — | — | — |

Insumo que ainda vai ser editado **não leva nitidez de saída** (ela é o último passo, no tamanho final).

## 2. Procedimento

1. Fotos certas: `ids` explícitos, ou `collection` (mais seguro que a seleção).
2. Pasta: `CLIENTE/ANO_CAMPANHA/01_fotos/` (o plugin cria a pasta).
3. `lr_export_photos` com a linha da tabela; `collision: "rename"` (padrão) — nunca `overwrite` sem pedido.
4. Renomear no padrão da campanha: `cliente_campanha_fotoNN_descricao.jpg`
   (o retorno traz os caminhos; renomeie fora do Lightroom ou pela ferramenta de arquivos do cliente).
5. Conferir 1 arquivo: abrir no cliente ou em `ps_open_document` e olhar pixel e perfil.

## 3. Impressão: checar resolução

PPI efetivo = pixels ÷ (tamanho em polegadas). Meta ≥ 300 (mínimo 225). O InDesign informa ao
colocar (`id_place_file` devolve `effectivePpi`). Abaixo de 225: foto maior ou quadro menor;
nunca ampliar foto pequena.

## 4. Photoshop como saída

Peça montada no Photoshop: `ps_save_document` psd (em camadas) **e** jpg/png na pasta exports.
Para site: `ps_export_web` (WebP/JPG sRGB, `sizes` 1920/1280/640 com sufixo, `maxKB` ~200–400 para hero).
Web: JPEG qualidade 10–12 (escala do PS) ≈ 300–600 KB para 1080×1350.

## 5. Erros comuns

- Exportar a seleção errada (sem `ids`).
- Nitidez de tela em arquivo que vai ser reduzido/ampliado depois.
- AdobeRGB em post de rede (cores lavadas).
- JPEG de 1080 px usado em impresso.
- Sobrescrever entrega anterior.

## 6. Portão

```
[ ] Linha da tabela certa para o destino
[ ] Arquivos na pasta da campanha, nomes no padrão
[ ] 1 arquivo conferido (tamanho, perfil, aparência)
[ ] Impresso: PPI efetivo ≥ 300 no tamanho final
```
