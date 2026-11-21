# Creative regression suite

Ten fictional campaigns from different segments, run on each version of the server with `jradb_campaign_run`.
The result of each version is compared through the contact sheet (`06_entrega/folha-de-contato.png`) and the
report (`06_entrega/relatorio-campanha.md`). The briefs are written in Brazilian Portuguese.

| Folder | Segment |
|---|---|
| `01-clinica` | Dentistry (aligners) |
| `02-varejo` | Household goods retail |
| `03-restaurante` | Italian restaurant |
| `04-industria` | Industry (B2B), metalworks |
| `05-saas` | Scheduling software |
| `06-evento` | Music festival |
| `07-imobiliaria` | Real estate |
| `08-educacao` | Education (short courses) |
| `09-moda` | Independent fashion |
| `10-servico-local` | Local service (electrician) |

## Running a version

1. Copy the suite folder out of the repository (the apps write inside it) and put a photo in
   `01_fotos/produto.jpg` of each campaign. The same photo in all of them is fine, to compare versions.
2. For each campaign: `jradb_campaign_run { campaignFolder, operation: "plan" }`. It must come back with no
   problems, except the photo if it is missing.
3. `run`, `approve conceito`, `run`, `approve arte-chave`, `run`, `approve video`, `run`, `report`, through
   `jradb_code` with `background: true`. The whole suite takes 20 to 40 minutes.
4. Keep `06_entrega/` as `bench/regressao/_resultados/<version>/<campaign>/` and compare it side by side with
   the previous version. A visual difference with no reason behind it is a regression.

The automated test `tests/unit/regressao.test.ts` checks that every plan is still valid against the current
tools (names and arguments) without opening any app.
