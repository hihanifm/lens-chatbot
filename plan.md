# Plan: serialize uploads + downloads, shared status bar

## Goal
All uploads and downloads run one at a time across the whole app (fully
serial) to avoid stressing server infra. A second transfer enqueues instead
of rejecting. A single status bar shows the active transfer plus an
"N queued" indicator, replacing the separate upload/download banners.

## Design
- Global FIFO queue. Keep `upload.ts` and `download.ts` as separate stores
  (singleton `active` each). Both route their work through a shared queue.
- `start()` still returns a promise that settles on completion; callers
  already `await` completion, so no behavior change for them.
- The losing/second call no longer rejects synchronously — it waits.

## Files
- ADD  `frontend/src/state/transferQueue.ts` — zustand store: `enqueue(task)`,
  `queued` count, `running` flag. Internal promise chain serializes tasks.
- EDIT `frontend/src/state/upload.ts` — drop the "already in progress" reject;
  wrap the real upload in `transferQueue.enqueue(...)`; set `active` only
  once the task actually starts (so a queued upload isn't shown as active).
- EDIT `frontend/src/state/download.ts` — same: drop reject, wrap in
  `enqueue`, set `active` inside the task.
- ADD  `frontend/src/components/Transfer/Banner.tsx` — single status bar:
  shows whichever store has an `active`, appends "· N queued" from
  transferQueue. Reuses existing banner styling.
- EDIT `frontend/src/App.tsx` — replace `<UploadBanner/>` + `<DownloadBanner/>`
  with `<TransferBanner/>`.
- DELETE `frontend/src/components/Upload/Banner.tsx`,
  `frontend/src/components/Download/Banner.tsx`.

## Steps
1. Write `transferQueue.ts`.
2. Rewire `upload.ts` and `download.ts` through the queue.
3. Build `Transfer/Banner.tsx`.
4. Swap banners in `App.tsx`; delete old banner files.
5. `npx tsc --noEmit` in frontend; build; smoke-check in preview.
