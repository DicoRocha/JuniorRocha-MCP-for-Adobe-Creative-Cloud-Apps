---
name: design-mockup
description: Aplicar uma arte em mockup no Photoshop (tela de celular, embalagem, camiseta, cartão, fachada) por Smart Object — trocar o conteúdo, manter perspectiva, luz e textura, e exportar a apresentação. Use quando pedirem "mostra aplicado", "mockup", "apresentação para o cliente" ou "como fica na embalagem".
---

# design-mockup — a arte no mundo, sem colar por cima

App: `app-photoshop`. Arte de origem: `social-post`, `vetor-pacote-de-marca`, `print-papelaria`.

## 1. Escolha do mockup

- Arquivo PSD com Smart Object nomeado para a arte (ex. "Sua arte aqui", "Design", "Screen").
- Licença para uso comercial e apresentação ao cliente; sem marca de terceiros visível na cena.
- Resolução da área do Smart Object ≥ resolução da arte (ex. tela 1170×2532 para print de app).
- Perspectiva parecida com a do uso real (embalagem de frente para e-commerce, 3/4 para apresentação).

## 2. Trocar a arte

1. `ps_open_document` do mockup (trabalhe numa cópia: `ps_save_document` como `…_mockup_v01.psd` primeiro).
2. `ps_get_layer_tree` → achar o Smart Object da arte (às vezes dentro de grupo).
3. `ps_smart_object` replaceContents com o PNG/PSD/AI da arte. O PSB interno define o tamanho: arte com
   a mesma proporção do PSB; se não, ajuste a arte antes (não deforme).
4. Vários mockups da mesma série: o mesmo Smart Object pode estar vinculado em várias camadas — trocar
   uma vez atualiza todas.
5. `ps_get_canvas_snapshot` para conferir.

## 3. Realismo (o que separa mockup bom de colagem)

| Problema | Correção |
|---|---|
| Arte "flutua" | camada de sombra/luz do mockup acima da arte em Multiplicar/Tela; se faltar, `ps_adjustment_layer` curves suave recortada (`clipToBelow`) |
| Branco estourado | arte com branco puro em papel/camiseta: reduzir para 96–98 % |
| Textura sumiu | camada de textura em Sobrepor 20–40 % acima da arte |
| Bordas duras | máscara com desfoque de 0,5–1 px na borda da área |

## 4. Fundo e apresentação

- Fundo neutro ou da paleta (`craft-cor`); produto sem fundo: `ps_recipe_remove_background` e, para a cena
  pronta de e-commerce, `ps_recipe_product_shot` (fundo da marca + sombra de contato).
- Uma ideia por imagem; série de 3–5 mockups com a mesma luz e ângulo.

## 5. Saída

- Apresentação: PNG 1920×1080 ou 1080×1350 (`ps_export_web`, sRGB). Redes sociais: sempre PNG.
- Vários mockups numa folha para aprovação: `jradb_contact_sheet`.
- Não entregue mockup como arquivo final de produção: a arte de produção sai do arquivo original.

## 6. Portão de saída

```
[ ] Mockup com licença e Smart Object na resolução da arte
[ ] Arte trocada por replaceContents, sem deformar a proporção
[ ] Luz/sombra/textura do mockup por cima da arte; sem branco estourado
[ ] Série com mesmo ângulo e luz
[ ] PNG exportado e conferido em 100 %
```
