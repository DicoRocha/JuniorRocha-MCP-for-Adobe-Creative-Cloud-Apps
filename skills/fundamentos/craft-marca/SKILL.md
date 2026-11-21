---
name: craft-marca
description: Aplicar a marca do cliente nas peças — versão certa do logo para cada fundo, área de respiro, tamanho mínimo, posição fixa na série, selo e assinatura, consistência entre formatos e apps. Use ao colocar logo ou selo em qualquer peça, ou ao revisar se uma série parece da mesma marca.
---

# craft-marca — logo, respiro e consistência de série

Pré-requisito: kit em `00_briefing/kit-de-marca.json` (`plan-brand-kit`).

## 1. Versão do logo

| Fundo | Versão |
|---|---|
| Claro, sem textura | Positivo (cor ou preto) |
| Escuro | Negativo (branco ou claro) |
| Foto com textura | Monocromático sobre área calma, ou dentro de selo/placa |
| Uma cor só (impresso econômico, gravação) | Monocromático |

Selo de campanha: ter **duas versões** (fundo escuro e fundo claro). O teste de 13/11 usou um
selo em `ai_manage_artboards` com duas pranchetas, exportadas separadas por `ai_export_assets`.

## 2. Respiro e tamanho

- Respiro mínimo: o definido no manual; sem manual, **a altura do "x" do logotipo** (ou 1/4 da altura do símbolo) em volta.
- Tamanho mínimo: manual; sem manual, 80 px de largura em tela · 15 mm em impresso · símbolo sozinho 32 px / 8 mm.
- Nunca: distorcer, girar, recolorir fora do manual, sombra, contorno, sobre fundo que reduza o contraste.

## 3. Posição na série

- Logo/selo **no mesmo canto e no mesmo tamanho** em todas as peças da série (feed 4:5: canto superior
  direito ou inferior; margem igual à margem do texto).
- Em vídeo: marca nos primeiros 3 s ou no encerramento, parada **≥ 1 s**; nunca piscando.
- Em impresso: assinatura (logo + contato) na base, alinhada à grade.

## 4. Colocar sem perder a fonte

| App | Como |
|---|---|
| Photoshop | Inserir o PNG/AI como camada (Smart Object), redimensionar proporcional, nomear "Selo" |
| InDesign | `id_place_file` com o **.ai vinculado** e `fit: "proportionally"` (correções no AI se propagam) |
| After Effects | Importar o PNG/AI; em AI, ligar **continuously rasterize** (collapseTransformation) para escalar sem serrilhar |
| Illustrator | `ai_create_text` com `createOutlines: true` só na versão final do selo |

## 5. Consistência de série (checklist visual)

Coloque as peças lado a lado (folha de contato, `qa-revisao-visual`) e confira:
mesma grade e margens · mesma família e escala de tipo · mesma cor de destaque · mesmo tratamento de
foto (`foto-revelacao`) · mesma posição e tamanho de marca · mesmo estilo de CTA.

## 6. Erros comuns

- Logo grande "para aparecer" (consistência de série vende mais que logo gigante).
- Selo cobrindo rosto ou produto.
- Versão positiva sobre foto escura.
- Logo embutido (colado) no InDesign em vez de vinculado.

## 7. Portão

```
[ ] Versão certa para o fundo; contraste ok
[ ] Respiro e tamanho mínimo respeitados
[ ] Mesmo canto e tamanho em toda a série
[ ] Logo vinculado (ID) / Smart Object (PS); nada distorcido
```
