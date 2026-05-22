import { spawn, type ChildProcess } from "node:child_process";
import path from "node:path";
import type { AgentRunner, AgentEvent } from "./agentRunner.js";
import { parseCliLine } from "./cliOutputParser.js";
import { settings } from "../db.js";
import { composePrompt, type PromptPart } from "../prompts/promptLoader.js";
import { isLlmSanitizeEnabled, sanitizeForLlm } from "../services/llmSanitize.js";
import { log } from "../logger.js";

/** Cap on prior turns and per-message length folded into the injected transcript. */
const MAX_HISTORY_TURNS = 20;
const MAX_HISTORY_CHARS_PER_MSG = 4000;

/**
 * AgentRunner backed by the `cline` CLI. Each turn spawns a fresh `cline --json`
 * process. The cline CLI is one-shot in `--json` mode (no native resume), so
 * multi-turn context is supplied by transcript injection — see cliInjectHistory.
 * Never imports @cline/sdk — the SDK boundary stays with ClineCoreAgentRunner.
 */
export class CliAgentRunner implements AgentRunner {
  /** taskId → live child process, for abort/stop. */
  private readonly children = new Map<string, ChildProcess>();
  /** Children we deliberately killed via abort/stop — distinguishes intent from a crash. */
  private readonly killedByUs = new WeakSet<ChildProcess>();

  async *analyze(input: Parameters<AgentRunner["analyze"]>[0]): AsyncIterable<AgentEvent> {
    const { cliCommand, cliInjectHistory } = settings.getAgentSettings();
    const workspacePath = path.resolve(input.workspacePath);
    // NOTE: cline 3.0.10 rejects `--id` resume in `--json` mode ("requires a
    // prompt argument or piped stdin"), so each turn is one-shot — no native
    // cross-turn memory. input.clineSessionId is intentionally not passed as
    // `--id`; it is still used by the dispatcher for engine-ownership routing.

    // Preserve lens's PII-scrubbing property across engines — the same as
    // ClineCoreAgentRunner does before the question reaches the model.
    let question = input.question;
    let sanitizeReplacements = 0;
    if (isLlmSanitizeEnabled()) {
      const r = sanitizeForLlm(input.question);
      question = r.text;
      sanitizeReplacements = r.replacementCount;
    }

    // Transcript injection — the cline CLI has no native cross-turn memory in
    // `--json` mode, so prior turns are folded into the prompt. Toggleable in
    // case the LLM provider already stitches conversation history server-side.
    const promptParts: PromptPart[] = [];
    let injectedTurns = 0;
    if (cliInjectHistory && input.priorMessages && input.priorMessages.length > 0) {
      const recent = input.priorMessages.slice(-MAX_HISTORY_TURNS);
      let transcript = recent
        .map((m) => {
          const who = m.role === "user" ? "User" : "Assistant";
          const body = m.content.slice(0, MAX_HISTORY_CHARS_PER_MSG);
          return `${who}: ${body}`;
        })
        .join("\n\n");
      if (isLlmSanitizeEnabled()) transcript = sanitizeForLlm(transcript).text;
      promptParts.push({ fragment: "user/cli-history", vars: { transcript } });
      injectedTurns = recent.length;
    }
    const filesList = input.files.length
      ? input.files.map((f) => `- ${f}`).join("\n")
      : "(none specifically selected)";
    promptParts.push({ fragment: "user/cli-task", vars: { question, files: filesList } });
    const prompt = await composePrompt(promptParts);

    const args = ["--json", "--auto-approve", "true", "-c", workspacePath];
    if (input.mode === "plan") args.push("-p");
    args.push(prompt);

    const queue: AgentEvent[] = [];
    const wakeup = { fn: null as (() => void) | null };
    let done = false;
    let errored = false;
    let taskId: string | undefined;
    const startedAt = Date.now();

    const push = (e: AgentEvent) => {
      queue.push(e);
      wakeup.fn?.();
    };

    push({
      type: "status",
      content: `runtime: cli | command: ${path.basename(cliCommand)} | files: ${input.files.length}`,
    });
    if (injectedTurns > 0) {
      push({ type: "status", content: `injected ${injectedTurns} prior turn(s) into prompt` });
    }
    if (sanitizeReplacements > 0) {
      push({ type: "status", content: `PII patterns redacted in prompt (${sanitizeReplacements} substitutions)` });
    }
    log.info("agent:start", { runtime: "cli", command: cliCommand, files: input.files.length, injectedTurns });

    const child = spawn(cliCommand, args, { shell: false, cwd: workspacePath, stdio: ["ignore", "pipe", "pipe"] });

    let stdoutBuf = "";
    let stderrTail = "";

    const handleLine = (line: string) => {
      for (const evt of parseCliLine(line)) {
        if (evt.type === "session_id") {
          taskId = evt.content;
          this.children.set(taskId, child);
          push({ type: "session_id", content: `cli:${taskId}` });
        } else {
          if (evt.type === "error") errored = true;
          push(evt);
        }
      }
    };

    child.stdout.setEncoding("utf8");
    child.stdout.on("data", (chunk: string) => {
      stdoutBuf += chunk;
      let nl: number;
      while ((nl = stdoutBuf.indexOf("\n")) !== -1) {
        const line = stdoutBuf.slice(0, nl);
        stdoutBuf = stdoutBuf.slice(nl + 1);
        handleLine(line);
      }
    });

    child.stderr.setEncoding("utf8");
    child.stderr.on("data", (chunk: string) => {
      stderrTail = (stderrTail + chunk).slice(-2000);
    });

    child.on("error", (err) => {
      log.error("agent:cli-spawn-error", { command: cliCommand, error: err.message });
      push({ type: "error", content: `failed to launch cline CLI (${cliCommand}): ${err.message}` });
      errored = true;
      done = true;
      wakeup.fn?.();
    });

    child.on("close", (code, signal) => {
      if (stdoutBuf.trim()) handleLine(stdoutBuf);
      if (taskId) this.children.delete(taskId);
      const stderrSuffix = stderrTail.trim() ? `: ${stderrTail.trim()}` : "";
      if (!errored) {
        if (this.killedByUs.has(child)) {
          push({ type: "status", content: "agent stopped" });
        } else if (signal) {
          // Killed by a signal we did not send — e.g. the CLI crashed.
          push({ type: "error", content: `cline CLI terminated by signal ${signal}${stderrSuffix}` });
          errored = true;
        } else if (code !== 0) {
          push({ type: "error", content: `cline CLI exited with code ${code}${stderrSuffix}` });
          errored = true;
        }
      }
      log.info("agent:done", { runtime: "cli", ms: Date.now() - startedAt, code, signal });
      done = true;
      wakeup.fn?.();
    });

    while (!done || queue.length > 0) {
      if (queue.length > 0) {
        yield queue.shift()!;
      } else {
        await new Promise<void>((r) => {
          wakeup.fn = r;
        });
        wakeup.fn = null;
      }
    }

    if (!errored) yield { type: "done", content: "" };
  }

  async abort(clineSessionId: string): Promise<void> {
    const child = this.children.get(clineSessionId);
    if (child) {
      this.killedByUs.add(child);
      child.kill("SIGTERM");
    }
  }

  async stop(clineSessionId: string): Promise<void> {
    const child = this.children.get(clineSessionId);
    if (!child) return;
    this.killedByUs.add(child);
    child.kill("SIGTERM");
    setTimeout(() => {
      if (child.exitCode === null && child.signalCode === null) child.kill("SIGKILL");
    }, 3000);
  }
}
