## Why

The current slide generation pipeline asks the AI to produce both slide content and text box positions simultaneously, but position output is consistently wrong — requiring manual drag-and-resize correction on every slide. Separating layout from content (pre-defining zones on templates once) eliminates per-slide correction and makes generation output reliable.

## What Changes

- Add a **Template Zone Editor** UI where users paint named text zones (title, body) directly onto template slide images before running generation.
- Store zone definitions alongside template images as structured metadata (JSON).
- Remove layout coordinate generation from the AI prompt — the AI outputs text only.
- During generation, assign content to the pre-defined zones of the matching template instead of using AI-generated or default coordinates.
- Remove the per-slide drag-to-fix human review step (zones are set once at template setup time).

## Capabilities

### New Capabilities

- `template-zone-editor`: UI for drawing and labeling text box zones on template slide images, persisting zone metadata per template.
- `zone-aware-generation`: Generation pipeline reads template zone metadata and maps AI-generated text content into those zones instead of generating coordinates.

### Modified Capabilities

- (none)

## Impact

- `src/app/page.tsx`: Add template zone editor component and zone metadata state; remove per-slide layout drag editor.
- `src/lib/openai.ts`: Remove layout coordinate fields from AI prompt schema and response handling; accept zone definitions as input.
- `src/app/api/generate/route.ts`: Pass zone metadata through to generation logic.
- No new dependencies required (zone metadata is plain JSON; canvas drawing already used for PNG export).
