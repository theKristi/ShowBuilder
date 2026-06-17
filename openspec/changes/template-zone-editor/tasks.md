## 1. Data Model

- [x] 1.1 Define a `ZoneBox` TypeScript type `{ x: number; y: number; width: number; height: number }` (percentages, 0–100)
- [x] 1.2 Define a `TemplateZones` type `{ title?: ZoneBox; body?: ZoneBox }` and a `ZoneMap` type keyed by template index
- [x] 1.3 Add `zoneMap` state to the main React component, initialized as an empty object

## 2. Template Zone Editor Component

- [x] 2.1 Create a `TemplateZoneEditor` React component that accepts a template image URL and a `TemplateZones` value plus an `onChange` callback
- [x] 2.2 Render the template image in a fixed 16:9 aspect-ratio container
- [x] 2.3 Implement click-and-drag on the image container to draw a rectangle (track pointer start/end in percentage coordinates)
- [x] 2.4 Add a zone type selector (title / body) that determines which zone the next draw operation sets
- [x] 2.5 Render existing zones as labeled color-coded overlays on top of the image (title in one color, body in another)
- [x] 2.6 Add a delete button on each zone overlay that calls `onChange` with that zone removed
- [x] 2.7 Show a "Zones not set" badge when no zones are defined for a template

## 3. Wire Zone Editor into Template Upload UI

- [x] 3.1 In `page.tsx`, render a `TemplateZoneEditor` for each uploaded template image below or alongside its thumbnail
- [x] 3.2 On zone change, update the corresponding entry in `zoneMap` state by template index

## 4. Update Generation Pipeline — Remove Layout from AI

- [x] 4.1 In `src/lib/openai.ts`, remove `titleBox` and `bodyBox` (and their sub-fields) from the JSON schema passed to the model
- [x] 4.2 Update the system prompt to remove any instructions about generating layout coordinates
- [x] 4.3 Update the `Slide` response type / normalization logic to no longer expect or process coordinate fields from the AI

## 5. Update Generation Pipeline — Inject Zone Coordinates

- [x] 5.1 Add a `zoneMap` parameter to the `generateSlides` function signature in `src/lib/openai.ts`
- [x] 5.2 After each slide is generated, look up the zone for its template type and assign `titleBox` / `bodyBox` from the zone definition
- [x] 5.3 If no zone is defined for a slide's template type, fall back to the existing hardcoded defaults for that type
- [x] 5.4 Collect which template types fell back to defaults and return them alongside the slides

## 6. Thread Zone Map Through API

- [x] 6.1 In `src/app/api/generate/route.ts`, accept `zoneMap` from the request body and pass it to `generateSlides`
- [x] 6.2 In `page.tsx`, include the current `zoneMap` in the payload sent to `/api/generate`
- [x] 6.3 If the API response indicates fallback was used, display a warning in the UI naming the affected template types

## 7. Simplify Review Step

- [x] 7.1 Remove the drag-to-move and resize interaction handles from `LayoutEditorPreview` and `PreviewTextBox` in `page.tsx`
- [x] 7.2 Remove the `LayoutBoxEditor` numeric input controls from the per-slide review panel
- [x] 7.3 Keep the slide content preview (text visible on background) and the per-slide approval checkbox
- [x] 7.4 Keep font size and text color controls (these are still useful per-slide style adjustments)
