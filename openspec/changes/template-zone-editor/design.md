## Context

ShowBuilder generates ProPresenter slides from uploaded notes using an AI model. The pipeline currently asks the AI to produce both slide text content and text box layout coordinates (x, y, width, height as percentages) in a single JSON response. In practice the AI guesses layout poorly — coordinates are consistently off — so the UI includes a per-slide drag-and-resize editor as a manual correction step. This is slow and unreliable. The root cause is that layout is not something the AI can infer from text; it is a visual design decision tied to each template slide image.

## Goals / Non-Goals

**Goals:**
- Let users define text zones (title, body) directly on each template image before running generation.
- Remove layout coordinate output from the AI response entirely.
- Inject pre-defined zone coordinates into the export pipeline instead of AI-generated or hardcoded defaults.
- Eliminate (or greatly simplify) the per-slide manual correction step.

**Non-Goals:**
- Persistent server-side zone storage — zones are session-local state for now.
- Supporting more than two zone types (title, body) per template in this change.
- Changing the AI model, the note parsing logic, or the export format.

## Decisions

### 1. Zone definition lives on the client in session state

**Decision**: Zone metadata is stored as a JavaScript object keyed by template image index, in React component state. It is not persisted to a server or file.

**Rationale**: The existing prototype has no backend persistence for any user-uploaded assets. Adding a server layer for zone config would be a large scope increase. Session-local state is sufficient for the use case: define zones once per session, run generation, export. A future "save zones as JSON / reload" feature can be added without changing the core model.

**Alternative considered**: Store zones as a JSON file alongside the template images on disk. Rejected because the app is currently stateless on the server side and this prototype has no auth or user identity.

---

### 2. Zone editor is a canvas overlay on the template image

**Decision**: Render each template image in a fixed-size preview container. Users click-and-drag on the image to draw a rectangle, then label it "title" or "body". Existing box interaction code in `PreviewTextBox` (pointer events, delta calculations, percentage coordinates) is reused or adapted.

**Rationale**: The drag interaction pattern is already implemented for the per-slide editor. Re-using it for zone definition is low-effort and gives users a familiar UX. Percentage-based coordinates match what the export pipeline already expects.

**Alternative considered**: Let users input percentage values numerically (like `LayoutBoxEditor` number inputs). Rejected as the primary interaction — visual painting is more intuitive. Numeric inputs can be offered alongside the canvas as fine-tuning controls.

---

### 3. AI prompt schema drops layout fields

**Decision**: Remove `titleBox`, `bodyBox`, and coordinate sub-fields from the JSON schema passed to the AI. The model is asked only for `title`, `body` (text), `type`, and `notes`.

**Rationale**: The model does not have reliable spatial reasoning over arbitrary template images. Removing layout from the schema reduces prompt tokens, eliminates the main source of bad output, and makes the AI's job simpler and more focused.

**Alternative considered**: Keep layout in the prompt but constrain it to snap to template zones. Rejected — this still uses a non-deterministic path for something that should be deterministic.

---

### 4. Zone assignment at generation time, not export time

**Decision**: When building each slide during generation, look up the zone for the slide's template type (point/scripture/other) and store the zone coordinates directly on the slide object alongside the text fields. Export code is unchanged.

**Rationale**: The export pipeline (`propresenter.ts`, `propresenter-pro.ts`) already reads layout from the slide object. Inserting zones at generation time means nothing in the export layer needs to change.

---

### 5. Graceful fallback when zones are not defined

**Decision**: If a user runs generation without defining zones for a template type, fall back to the existing hardcoded defaults for that type (same behavior as today). Log a warning in the UI.

**Rationale**: This preserves backward compatibility and avoids blocking the user from generating slides if they skip zone setup.

## Risks / Trade-offs

- **Zone editor UX is new UI surface** → Mitigation: scope it to a simple draw-one-box-per-zone interaction; no multi-zone complexity in this change.
- **Users may not realize zones must be defined before generating** → Mitigation: surface a visible indicator (e.g., "Zones not set" badge on templates) and show the fallback warning in generation output.
- **Percentage coordinates from the zone editor may not align perfectly with template image aspect ratio at export size (1920×1080)** → Mitigation: zone editor preview uses the same 16:9 aspect ratio as the export canvas; percentages are consistent.
- **Removing the per-slide layout editor reduces flexibility for one-off slide adjustments** → Accepted trade-off; users can still adjust zone definitions and regenerate.

## Open Questions

- Should zones be exportable/importable as JSON so users can reuse them across sessions? (deferred — out of scope for this change)
- Should the approval step be removed entirely, or kept as a lighter "review content before export" step without layout editing? (leave lightweight approval; remove layout controls from it)
