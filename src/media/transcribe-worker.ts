/**
 * Child process for transcription on the system Node (see needsSystemNode in transcribe.ts).
 * argv[2] = JSON {file, opts}; prints one JSON line {ok, result | error}.
 */
import { transcribeFile } from "./transcribe.js";

async function main(): Promise<void> {
  try {
    const { file, opts } = JSON.parse(process.argv[2] ?? "{}") as { file: string; opts: Record<string, unknown> };
    const result = await transcribeFile(file, opts);
    process.stdout.write(`\n${JSON.stringify({ ok: true, result })}\n`);
  } catch (e) {
    const err = e as { code?: string; message?: string };
    process.stdout.write(`\n${JSON.stringify({ ok: false, error: { code: err.code ?? "TRANSCRIBE_FAILED", message: err.message ?? String(e) } })}\n`);
    process.exitCode = 1;
  }
}
void main();
