---
name: app-code-mode
description: Code mode do MCP — quando trocar uma sequência de chamadas por um script `jradb_code` (vários passos, vários apps, listas grandes, só o resumo de volta), como ler assinaturas com `jradb_api`, rodar em segundo plano, tratar erros e mostrar imagens. Use antes de encadear 3+ chamadas ou ao processar listas (fotos, camadas, cenas).
---

# app-code-mode — script em vez de chamadas uma a uma

`jradb_code` roda o corpo de uma função assíncrona em JavaScript que chama as ferramentas do MCP
(`await tools.ps_audit_document({...})`). Só o que o script devolve volta para a conversa. As ferramentas
são as mesmas, com a mesma validação.

## Quando usar

- **3 ou mais chamadas seguidas** que não dependem de você olhar o resultado no meio: receitas em sequência,
  exportações, aplicar o mesmo ajuste em várias peças.
- **Listas grandes:** fotos do Lightroom, camadas, clipes. Filtre no script e devolva só ids e contagens.
- **Vários apps ao mesmo tempo:** `Promise.all` para apps diferentes (cada app tem a sua fila).

Chame direto, sem script, quando um único passo precisa de decisão visual (ver a prévia e decidir o próximo).

## Como

1. `jradb_api { tools: ["ps_recipe_social_set", "id_recipe_flyer"] }` — assinaturas em TypeScript, com
   padrões e notas. Sem nomes: `{ prefix: "lr_" }` ou `{ search: "mogrt" }` lista com uma linha cada.
2. `jradb_code { code }`. Helpers: `log(...)`, `show(i?)` (imagens da última chamada vão para a resposta),
   `sleep`, `readText/readJson/writeText/exists/mkdir/listDir`, `path.join/dirname/basename`.
3. Trabalho acima de ~60 s: `background: true` devolve `jobId`; consulte com `jradb_code { jobId }`.
   Dentro de um job em segundo plano cada chamada ao app espera o tempo que sobra do job (sem o corte de
   60 s): um build demorado seguido de render vai até o fim. Mesmo assim, **cada chamada ao app deve ser curta**
   (até ~20 s): enquanto um script roda, o app não responde e parece travado. O painel mostra
   "Executando: … · N s". Monte por partes (uma cena ou uma comp por chamada) em vez de um script gigante.

Exemplo:

```js
await tools.ps_open_document({ filePath: K });
const s = await tools.ps_recipe_social_set({ formats: ["story9x16", "square1x1"], outputFolder: OUT });
show(0); // só a folha do social set
return { verdict: s.artboards.map(a => [a.artboard, a.verdict, a.errors]), files: s.exported.map(e => e.path) };
```

## Regras

- Devolva **pouco**: veredito, contagens, caminhos, ids. O resto fica nos arquivos.
- Uma ferramenta com erro **lança exceção** com a mensagem dela: use `try/catch` para seguir e anotar o erro.
- Mostre imagem só onde a decisão é visual (`show()` após a chamada que tem a prévia).
- Ações que mudam fotos, enviam algo ou apagam continuam valendo as mesmas regras de permissão do uso direto.
- Photoshop, Illustrator e InDesign: passe `documentName` em **toda** chamada (a pessoa pode estar trabalhando em
  outro arquivo do mesmo programa); com mais de um documento aberto, chamada sem ele é recusada.
- O script não tem `require`, `process` nem rede: só as ferramentas e os helpers acima.

## Modo enxuto

É o **padrão** desde 16/11/2026: o cliente vê só `jradb_code`, `jradb_api`, `jradb_get_status`,
`jradb_get_skill`, `jradb_usage` e `jradb_launch_app`; as definições caem de ~49 mil para ~1,1 mil tokens.
Todas as outras ferramentas, inclusive os scripts diretos (`ps_execute_extendscript`, `ps_batch_play`,
`ae_execute_extendscript`, `ai_execute_extendscript`, `id_execute_extendscript`…), continuam disponíveis dentro do script.
**Nada fica limitado às receitas:** pedido fora do padrão → `jradb_api({ search })` para achar a ferramenta;
se nenhuma servir, script direto no app pelo `jradb_code`. Antes de improvisar um script, procure no
`jradb_api` — a ferramenta pronta costuma ser melhor. Modo completo (todas as ferramentas visíveis):
`--tools full` ou `JRADB_MCP_TOOLS=full`.
