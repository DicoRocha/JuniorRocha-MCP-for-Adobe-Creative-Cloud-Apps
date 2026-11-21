---
name: ops-recuperacao
description: O que fazer quando um app Adobe trava, dá timeout, retorna APP_BUSY, HOST_BLOCKED, SCRIPT_PARSE_ERROR ou erro de script, ou perde trabalho — diagnóstico, o que nunca repetir e como retomar sem perder o que já foi feito. Use em qualquer erro de ponte ou de app.
---

# ops-recuperacao — app travado, timeout e erros

## 1. Prevenção (barata, sempre)

- `jradb_checkpoint` antes de: mudança estrutural, render, prévia de comp pesada, script
  longo, abrir arquivo grande. No teste de 12/11 o After Effects reiniciou e a animação não
  salva se perdeu.
- Scripts curtos: divida "abrir + montar + salvar" em 2–3 chamadas.
- Uma operação pesada por vez em cada app; não dispare outra antes da resposta.

## 2. Leia o erro antes de agir

Todo erro traz `code`, `recoverable`, `hint` e `nextTools`. Siga a dica.

| Código | Significa | Faça | Não faça |
|---|---|---|---|
| `BRIDGE_TIMEOUT` | O app não respondeu a tempo; pode ainda estar trabalhando | `jradb_get_status` (veja `queues`); confira se o efeito aconteceu (ex. arquivo salvo, camada criada) antes de repetir | Reenviar o mesmo comando pesado em laço |
| `APP_BUSY` | Depois de um timeout, o app não respondeu nem a uma sonda de 5 s; nada foi enviado | Peça à pessoa para olhar o app (diálogo aberto? render?) e espere | Insistir; abrir outro app para "contornar" |
| `HOST_BLOCKED` | O app não roda nem um script de uma linha | Peça para fechar o diálogo aberto no app | Supor bug do MCP |
| `SCRIPT_PARSE_ERROR` | O app roda scripts, mas rejeita o arquivo do handler instalado | Peça `npm run install-bridges` na pasta do MCP; use outros apps enquanto isso | Repetir o comando |
| `EVALSCRIPT_FAILED` | Painel antigo: não sabe distinguir diálogo de erro de sintaxe | Peça para checar diálogos; se não houver, reinstalar as pontes | — |
| `BRIDGE_NOT_CONNECTED` | O painel/plugin do app não está ligado | `jradb_launch_app`; pedir para abrir o painel (Janela › Extensões) ou o plug-in do Lightroom | — |
| `ACTION_NOT_SUPPORTED` | Nenhuma ponte conectada implementa a ação | Use o script livre do app (`*_execute_extendscript`, `ps_batch_play`, `lr_execute_lua`) | — |
| Erro de script (`SyntaxError`, `ReferenceError`…) | Seu código falhou na linha indicada | Corrija; ES3 (sem let/const/arrow/template); explore com `jradb_inspect_dom` | Chutar nomes de propriedade |
| Mensagem com `getfenv`, `Yielding is not allowed` | Ponte instalada mais velha que o servidor | `npm run install-bridges` + reiniciar o Lightroom | — |

## 3. Depois de um timeout

1. `jradb_get_status` → em `queues`, veja `inFlight`, `suspectBusySince`, `lastError`.
2. Verifique o **efeito** da ação, não a resposta: o arquivo existe? A camada foi criada? Um
   comando que estourou o tempo muitas vezes terminou dentro do app (aconteceu no Photoshop).
3. Se terminou: siga em frente. Se não: espere, peça para a pessoa olhar o app, tente de novo
   **uma vez** com o trabalho dividido em partes menores.

## 4. App reiniciou ou fechou

1. `jradb_get_status` até a ponte reconectar (o painel reconecta sozinho em ~3 s).
2. Confira o que sobrou (`*_get_document_info`, `ae_get_project_info`, `pr_get_project_info`).
3. Reabra o último checkpoint ou recrie a partir dos arquivos salvos. Diga à pessoa o que
   foi perdido e o que foi refeito.

## 5. Sinais de que é hora de parar e perguntar

- Três falhas seguidas no mesmo passo.
- Qualquer coisa que pareça diálogo do app (licença, fonte ausente, vínculo perdido, salvar como).
- Pedido para apagar, sobrescrever original ou fechar sem salvar.
