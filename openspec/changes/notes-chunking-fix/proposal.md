## Why

When a user uploads a large set of notes, the current pipeline hits the model's context window because it tries to send too much raw text at once — falling back to aggressive truncation (40 segments, 260 chars each) that silently drops content. A two-pass approach — first compress notes into concise slide-ready points, then generate slides from those points — makes large presentations work correctly without losing content.

## What Changes

- Add a **notes compression pass**: before slide generation, send the full notes to the model with a prompt that extracts concise, slide-ready bullet points. This pass is chunked across the full notes without the 40-segment / 260-char caps.
- Replace the current aggressive pre-truncation logic with a chunked extraction pipeline that processes all segments and reassembles them.
- The existing slide generation pass operates on the compressed points output (which is small and predictable), not on raw notes directly.
- Remove the hardcoded 40-segment max and 260-char-per-segment limit from the slide generation path (those constraints move to the extraction pass output, which controls its own output size).
- Surface extraction progress to the user (notes can be large; the two-pass adds latency).

## Capabilities

### New Capabilities

- `notes-extraction`: First-pass AI step that reads raw notes in chunks and outputs a clean, deduplicated list of slide-ready points — one per intended slide — within a controlled token budget.
- `chunked-processing`: Infrastructure for splitting arbitrarily large text input into chunks, processing each with the model, and merging results without duplication.

### Modified Capabilities

- (none — slide generation itself is unchanged; it just receives better-prepared input)

## Impact

- `src/lib/openai.ts`: Add extraction pass functions; modify `generateSlides` entry point to run extraction before slide generation; remove pre-truncation caps from the slide generation path.
- `src/app/api/generate/route.ts`: Stream or report two-phase progress to the client.
- `src/app/page.tsx`: Show extraction progress indicator during generation.
- No new dependencies required.
