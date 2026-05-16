import { config as dotenv } from "dotenv";
import { existsSync } from "fs";

dotenv({ path: existsSync(".env") ? ".env" : ".env.example" });

const OLLAMA_HOST = process.env.OLLAMA_HOST ?? "http://127.0.0.1:11434";
const model = process.env.LLM_MODEL ?? "llama3.1:8b";

export default async function globalSetup() {
  let res: Response;
  try {
    res = await fetch(`${OLLAMA_HOST}/api/tags`);
  } catch {
    throw new Error(
      `Ollama not running at ${OLLAMA_HOST} — start Ollama and run: ollama pull ${model}`
    );
  }

  if (!res.ok) {
    throw new Error(
      `Ollama returned HTTP ${res.status} at ${OLLAMA_HOST}/api/tags — start Ollama and pull ${model}`
    );
  }

  const body = (await res.json()) as { models?: { name: string }[] };
  const names = (body.models ?? []).map((m) => m.name.replace(/:latest$/, ""));
  const wanted = model.replace(/:latest$/, "");
  const hasModel = names.some((n) => n === wanted || n.startsWith(`${wanted}:`));
  if (!hasModel) {
    throw new Error(
      `Model "${model}" not found in Ollama (available: ${names.join(", ") || "none"}) — run: ollama pull ${model}`
    );
  }
}
