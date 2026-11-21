# Validating on a Mac

Everything needed to check the server on macOS: the test routine, a results sheet, a helper that calls the
tools without an AI client, and a script that packs what has to be sent back. What the first validation covered
is in [`../docs/MACOS.md`](../docs/MACOS.md).

| File | Purpose |
|---|---|
| [`TEST-ROUTINE.md`](TEST-ROUTINE.md) | The tests, in order, each with a code (M01, M02 …) |
| [`RESULTS.md`](RESULTS.md) | Empty results sheet to fill in |
| `mcp-call.mjs` | Calls server tools over stdio: `node mac-validation/mcp-call.mjs jradb_get_status '{}'` |
| `../PACK-RESULTS.command` | Builds the zip to send back |

## Steps

1. Install as described in [`../docs/MACOS.md`](../docs/MACOS.md#install-on-macos).
2. Work through `TEST-ROUTINE.md`, with an assistant connected to the server or with `mcp-call.mjs`. Use test
   documents only, close only what the tests created, and leave no dialog open in the apps.
3. Fill in `mac-validation/RESULTS.md` inside the project folder. A test that was not run is marked "not tested"
   with the reason.
4. If the code needed a fix, keep it inside the macOS branches (`process.platform === "darwin"`), run the tests
   (`npm test`) and note the file, the problem and the change in the "Code fixes" table of `RESULTS.md`.
5. At the end, whatever the outcome, run:

   ```bash
   chmod +x PACK-RESULTS.command && ./PACK-RESULTS.command
   ```

   It writes `jr-adb-mcp-mac-results-<date>-<time>.zip` to the Desktop with `RESULTS.md`, the `logs/` folder,
   `environment.txt` (macOS version, processor, Node.js, installed apps) and `project/`, the project as it is
   now without `node_modules`, `dist`, `release` and `temp`. Send that file back.

## Rules for an assistant doing the validation

- Anything marked as not tested in `docs/MACOS.md` may be wrong: confirm it on the Mac before relying on it.
- Do not change Windows behaviour.
- Work on copies and test documents. Do not close or save the person's own documents or projects.
- No dialog may be left open in an app. If a command opens one, report it as a failure.
- In Premiere Pro, lock the server to the test project (`pr_expect_project`) before any write.
