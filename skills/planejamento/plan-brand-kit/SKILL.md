---
name: plan-brand-kit
description: Ler ou montar o kit de marca do cliente (cores HEX/RGB/CMYK/Pantone, fontes por função, versões do logo, área de respiro, tom) num kit-de-marca.json e criar as amostras e estilos nos apps (Photoshop, Illustrator, InDesign). Use no início de qualquer trabalho de cliente, ou quando o pedido falar em "cores da marca", "manual" ou "identidade".
---

# plan-brand-kit — fonte única de marca

Toda peça de cliente parte de um kit. Sem kit, você **propõe** um e diz que é proposta.
Esquema do arquivo: `skills/_shared/kit-de-marca.schema.json`. Base: `docs/conhecimento/02`.

## 1. De onde tirar

| Fonte | Como |
|---|---|
| Manual em PDF | Ler as páginas de cor, tipo e logo |
| Arquivo do logo (.ai/.svg) | `ai_manage_document` open → `ai_swatches` list → `ai_find_objects` |
| Peças antigas (PSD/INDD) | `ps_get_layer_tree` (fontes e cores das camadas de texto) · `id_get_document_info` (estilos e amostras) |
| Site | Pedir à pessoa as cores/fontes ou o manual; não adivinhar pelo print |
| Nada | Propor (seção 3) e marcar `"status": "proposta"` |

## 2. Conteúdo mínimo do kit

```json
{
  "cliente": "...", "status": "aprovado | proposta",
  "cores": [{ "nome": "Primária", "hex": "#...", "cmyk": [c,m,y,k], "pantone": null, "uso": "destaque" }],
  "tipos": { "titulo": { "familia": "...", "estilo": "SemiBold", "postscript": "..." },
             "corpo":  { "familia": "...", "estilo": "Regular", "postscript": "..." } },
  "logo": { "arquivos": { "positivo": "...", "negativo": "..." }, "respiro": "altura do 'x'", "minimo_mm": 15, "minimo_px": 80 },
  "tom": "...", "nunca": ["..."]
}
```

- Fontes pelo **nome PostScript** (é o que `ps_create_layer` e `ai_create_text` aceitam).
  Confira se existem na máquina antes de usar; ausente → avisar e propor substituta.
- Cor de impresso em **CMYK do manual**; sem CMYK oficial, converter e marcar "conversão".

## 3. Kit proposto (sem manual)

- Neutros: fundo, superfície, texto, texto secundário (ver `craft-cor`).
- **Uma** cor de destaque; 5–8 cores no total.
- 2 famílias: uma com personalidade (título) + uma neutra (corpo) (ver `craft-tipografia`).
- Escreva 3 linhas de tom de voz e 3 "nunca" (ex. "nunca prometer resultado").

## 4. Criar nos apps (uma vez por documento-modelo)

| App | Ferramenta |
|---|---|
| Illustrator | `ai_swatches` (operation add, name, color) |
| InDesign | `id_swatches` add com **[c,m,y,k]** para impresso · `id_manage_styles` create (Título, Corpo, Rótulo, CTA, Legenda) |
| Photoshop | não há amostras por script: guarde o HEX no kit e use em `ps_create_layer` / `ps_edit_text_layer` |
| After Effects | cores em `[r,g,b]` **0–1** (HEX ÷ 255) |

Grave o kit em `00_briefing/kit-de-marca.json` (ou mostre no chat se não houver arquivo).

Com o kit gravado, `jradb_templates_build({ kitPath })` gera os templates da marca em `templates/<cliente>/`:
posts .psdt (feed, story, quadrado; camadas Titulo, Apoio, CTA, Foto, Logo para `ps_batch_variants`),
flyer, catálogo e manual .indt, pranchetas .ait com amostras e estilos, e .mogrt de lower third, título e
contador. Rode de novo quando o kit mudar.

## 5. Erros comuns

- Cor de tela usada no impresso sem conversão (laranja/verde-limão RGB não imprimem).
- Fonte trocada silenciosamente pelo app (texto em Myriad no lugar da fonte do cliente).
- Logo redimensionado abaixo do mínimo ou sem respiro.
- Duas cores de destaque "porque o cliente tem duas cores".

## 6. Portão de saída

```
[ ] kit-de-marca.json salvo, com status (aprovado/proposta)
[ ] Fontes existem na máquina (ou substitutas declaradas)
[ ] Amostras e estilos criados no documento-modelo
[ ] CMYK de impresso definido (oficial ou conversão declarada)
```
