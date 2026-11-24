---
name: craft-formatos
description: Dimensões, proporções e zonas seguras de redes sociais, anúncios, vídeo, slides e impressos (A4, A5, cartão, sangria), com data de revisão. Use para escolher o tamanho do documento e para conferir onde o texto pode ficar antes de criar ou exportar qualquer peça.
---

# craft-formatos — tamanhos e zonas seguras

A tabela completa e datada está em `references/formatos.md`
(`jradb_get_skill({ name: "craft-formatos", reference: "formatos.md" })`).

## Regras de uso

1. **Atalho:** imagem de feed e carrossel **3:4 (1080×1440)** — 4:5 (1080×1350) só quando a publicação
   vai por agendador/API da Meta; vídeo e story **9:16 (1080×1920)**.
   Cobre a maior parte das redes.
2. **Mídia paga:** confirme a especificação no gerenciador de anúncios antes de produzir em
   lote. Plataformas mudam; a tabela tem data de revisão.
3. **Zona segura:** posicione texto, logo e CTA dentro dela **ao diagramar**, não depois.
4. **Adaptar é recompor:** ao derivar 4:5 → 9:16 → 1:1, refaça a hierarquia para a nova
   proporção (mova o título, reenquadre a foto); nunca estique nem só aumente a tela.
5. **Resolução:** tela em px a 72 ppi; impresso em mm com 300 ppi efetivos no tamanho final
   e sangria (ver `print-fundamentos`).
6. **Documento no app:**
   - Photoshop: `ps_create_document({ width, height, resolution: 72, mode: "RGBColorMode" })`.
   - InDesign: `id_manage_document({ operation: "create", width, height, bleed: 3, units: "mm" })`.
   - After Effects: comp com o tamanho do destino e 30 fps (ou o fps do material).
   - Premiere: sequência com o tamanho do destino; reenquadrar com Auto Reframe.

## Zonas seguras (resumo)

| Formato | Zona útil |
|---|---|
| 9:16 (1080×1920) | Fora de ~250 px do topo, ~400 px da base, ~120 px da lateral direita → área central ≈ 840×1270 |
| Feed 3:4 (1080×1440) | Essencial a ≥ 60 px das bordas (é o mesmo recorte da grade do perfil) |
| Feed 4:5 (1080×1350) | Essencial a ≥ 60 px das laterais (a grade do perfil mostra 3:4) |
| Thumbnail YouTube | Nada importante no canto inferior direito (duração) |
| Slide 16:9 | 90% central para títulos (80% se for para TV) |
| Impresso | ≥ 5 mm da linha de corte; sangria de 3 mm |
