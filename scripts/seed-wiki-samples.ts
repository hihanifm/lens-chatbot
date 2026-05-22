// One-off: seed sample wiki entries via wikiService so index.md / module
// indexes / log.md / SCHEMA.md are all generated through the real code path.
// Run: NODE_OPTIONS=--experimental-sqlite npx tsx scripts/seed-wiki-samples.ts
import { createWikiEntry, getWikiRoot } from "../src/services/wikiService.js";

const today = new Date().toISOString().slice(0, 10);

// Prepend the frontmatter block that the real flow (wiki-synthesis.md) emits —
// upsertRootIndex parses bug_id/tags from it to count entries and build coverage.
function withFrontmatter(s: { module: string; title: string; bugId: string; tags: string[]; body: string }): string {
  return (
    `---\n` +
    `bug_id: ${s.bugId}\n` +
    `module: ${s.module}\n` +
    `date: ${today}\n` +
    `title: ${s.title}\n` +
    `tags: ${s.tags.join(",")}\n` +
    `---\n\n` +
    s.body
  );
}

const samples = [
  {
    module: "ims",
    title: "VoLTE call drop on SRVCC handover",
    bugId: "BUG-4471",
    tags: ["volte", "srvcc", "handover", "call-drop"],
    oneLiner: "SRVCC handover to 3G drops active VoLTE calls when QCI 1 bearer is torn down early.",
    body: `# VoLTE call drop on SRVCC handover

## Problem
Active VoLTE calls drop ~2s into an LTE→3G SRVCC handover. Repro rate ~40%
in weak-LTE cell edges.

## Root Cause
The QCI 1 dedicated bearer is released by the modem before the CS handover
completes. ImsService treats the bearer loss as a media failure and tears
down the call instead of waiting for the SRVCC completion indication.

## Evidence
- \`ImsCallSession: mediaInactive\` logged ~1.8s before \`SRVCC: handover complete\`.
- \`RIL\` shows \`DEACTIVATE_DATA_CALL cid=2\` (QCI 1) preceding the CS leg setup.

## Resolution
Gate the media-failure teardown on a 5s SRVCC grace timer. Fixed in
ims-stack 12.4.1.

## Key Log Patterns
- \`ImsCallSession: mediaInactive\`
- \`SRVCC: handover complete\`
- \`DEACTIVATE_DATA_CALL cid=2\`
`,
  },
  {
    module: "anr",
    title: "Binder thread pool exhaustion in SystemUI",
    bugId: "BUG-5093",
    tags: ["anr", "binder", "systemui", "thread-pool"],
    oneLiner: "SystemUI ANRs when all 16 binder threads block on a slow ContentProvider query.",
    body: `# Binder thread pool exhaustion in SystemUI

## Problem
SystemUI ANRs ("Input dispatching timed out") under notification storms.

## Root Cause
A media ContentProvider query runs on the binder thread and blocks ~6s on
disk I/O. With 16 binder threads all serving the same provider, the pool
is exhausted and the main thread's binder call queues indefinitely.

## Evidence
- ANR trace: all 16 \`Binder:NNNN_*\` threads in \`android.database.Cursor\`.
- main thread \`Blocked\` waiting on a binder reply.

## Resolution
Move the provider query off the binder thread onto a bounded executor.
Fixed in SystemUI build 2025.41.

## Key Log Patterns
- \`Input dispatching timed out\`
- \`Binder:\` threads stacked in \`Cursor.<init>\`
- \`am_anr\` for \`com.android.systemui\`
`,
  },
  {
    module: "tombstone",
    title: "Native crash in libhwui from stale Bitmap pointer",
    bugId: "BUG-5210",
    tags: ["tombstone", "native-crash", "libhwui", "use-after-free"],
    oneLiner: "SIGSEGV in libhwui when a recycled Bitmap is drawn after its pixel buffer is freed.",
    body: `# Native crash in libhwui from stale Bitmap pointer

## Problem
Random SIGSEGV crashes during list scrolling in the gallery app.

## Root Cause
A Bitmap is recycled on a background thread while a RenderNode still holds
a reference. libhwui dereferences the freed pixel buffer on the next frame.

## Evidence
- Tombstone: \`signal 11 (SIGSEGV), fault addr\` inside \`libhwui.so\`.
- Backtrace through \`SkBitmap::readPixels\` → \`android::Bitmap\`.

## Resolution
Hold a strong ref to the Bitmap for the lifetime of the RenderNode; defer
recycle to the render thread. Fixed in framework patch 2025-12.

## Key Log Patterns
- \`signal 11 (SIGSEGV)\`
- \`libhwui.so\` in backtrace
- \`SkBitmap::readPixels\`
`,
  },
];

const root = getWikiRoot();
console.log(`Seeding ${samples.length} entries into: ${root}`);
for (const s of samples) {
  const entry = await createWikiEntry({ ...s, body: withFrontmatter(s) });
  console.log(`  ✓ ${entry.module}/${entry.filename}`);
}
console.log("Done.");
