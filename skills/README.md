# skills/

Casa das skills do `jr-adb-mcp-bridge`, servidas a qualquer cliente pela ferramenta
**`jradb_get_skill`** (sem argumentos devolve o roteador `index.md`; com `name`, a skill; com
`name` + `reference`, um arquivo de `references/`). Catálogo completo e fases: `docs/13` e `docs/14`.
As 7 skills antigas por app continuam em `.agents/skills/` até a migração.

## Escritas (fase 1 em 13/11/2026; fase 2 em 14/11/2026; fase 3 em 16/11/2026 — 85 skills; fase 4: `vetor-embalagem-rotulo`)

| Área | Skills |
|---|---|
| — | `index.md` — roteador `studio-router` |
| planejamento | `plan-briefing`, `plan-brand-kit` (+ `_shared/kit-de-marca.schema.json`), `plan-conceito-criativo`, `plan-copy`, `plan-campanha`, `plan-anuncios`, `plan-roteiro-video`, `plan-espelho-impresso`, `plan-calendario-social`, `plan-moodboard` |
| roteiros | `roteiro-reels-shorts`, `roteiro-carrossel`, `roteiro-anuncio-video`, `roteiro-ugc`, `roteiro-vsl`, `roteiro-storyboard`, `roteiro-institucional-depoimento` |
| prompts | `prompt-roteamento-modelos`, `prompt-imagem`, `prompt-asset-sheets`, `prompt-video`, `prompt-diagnostico`, `prompt-broll-metafora`, `prompt-musica-voz` |
| fundamentos | `craft-composicao`, `craft-tipografia`, `craft-cor`, `craft-marca`, `craft-formatos` (+ `references/formatos.md`), `craft-acessibilidade`, `craft-filosofia-visual` |
| foto | `foto-triagem-e-lote`, `foto-revelacao`, `foto-saida`, `foto-retrato`, `foto-produto`, `foto-recorte-e-composicao` |
| social | `social-post`, `social-carrossel`, `social-carrossel-seamless`, `design-adaptacao-formatos`, `social-stories-capas`, `social-thumbnail`, `ads-estatico`, `design-mockup` |
| vetor | `vetor-logo-e-selo`, `vetor-pacote-de-marca`, `vetor-icones`, `vetor-embalagem-rotulo` |
| motion | `motion-fundamentos`, `motion-direcao-de-arte`, `motion-tipografia-cinetica`, `motion-logo-e-vinheta`, `motion-graficos-de-video`, `motion-post-animado`, `motion-transicoes`, `motion-continuidade`, `motion-estilos` |
| video | `video-fala-limpa`, `video-reels`, `video-legendas-e-som`, `video-cor-e-export`, `video-vsl`, `video-ugc`, `video-anuncio` |
| print | `print-fundamentos`, `print-flyer-cartaz`, `print-catalogo`, `print-brochura-folder`, `print-manual`, `print-apresentacao`, `print-papelaria` |
| app | `app-photoshop`, `app-lightroom`, `app-illustrator`, `app-after-effects`, `app-premiere`, `app-indesign` (com as referências das skills antigas), `pipeline-entre-apps`, `pipeline-ia-externa`, `app-code-mode` |
| qa | `qa-revisao-visual`, `qa-anti-generico`, `qa-preflight-entrega`, `qa-revisao-video`, `ops-recuperacao` |

As skills `app-*` substituem as antigas de `.agents/skills/` (mantidas até o empacotamento da fase 2).

Regras para escrever uma skill nova: frontmatter com `name` (igual à pasta) e `description`
(quando usar, > 30 caracteres); 50–120 linhas; toda regra com número ou critério observável;
cada passo com a ferramenta do MCP; portão de saída no fim. O teste `tests/unit/fase0.test.ts`
reprova skill sem nome/descrição e skill que cite ferramenta inexistente.

## Estrutura prevista

```
skills/
├── index.md            roteador (servido pela ferramenta jradb_get_skill)
├── planejamento/       plan-*      briefing, kit de marca, conceito, copy, campanha
├── roteiros/           roteiro-*   reels, carrossel, anúncio, UGC, VSL, storyboard
├── prompts/            prompt-*    para IA do app, Higgsfield e Magnific
├── fundamentos/        craft-*     composição, tipografia, cor, marca, formatos
├── foto/  social/  vetor/  motion/  video/  print/     execução por área
├── app/                app-*, pipeline-*   contrato de cada app e passagem entre apps
├── qa/                 qa-*, ops-*  portões, revisão, entrega, recuperação
└── _shared/            formatos.json, kit-de-marca.schema.json, checklist-saida.md
```

Cada skill: `<nome>/SKILL.md` (60–120 linhas) + `references/` lidas só quando necessário.
Formato e critérios de qualidade: `docs/13-CATALOGO-DE-SKILLS.md`, seção "Formato de cada skill".
