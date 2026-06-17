## 1. Chunking Utilities

- [ ] 1.1 Write a `chunkText(text: string, chunkSize: number, overlap: number): string[]` utility in `src/lib/openai.ts` that splits text into overlapping character windows
- [ ] 1.2 Write a `deduplicatePoints(points: string[]): string[]` utility that normalizes each string (lowercase, strip punctuation, collapse whitespace) and removes exact-match duplicates

## 2. Extraction Pass

- [ ] 2.1 Write an `extractSlidePoints(notesText: string, maxSlides: number): Promise<string[]>` function in `src/lib/openai.ts`
- [ ] 2.2 Inside `extractSlidePoints`, split the notes text into chunks using `chunkText` (4000 char size, 200 char overlap)
- [ ] 2.3 For each chunk, call the model with an extraction prompt that asks for a bulleted list of slide-ready points (no paraphrasing, at most `maxSlides` total across all chunks)
- [ ] 2.4 Parse each model response into a `string[]` of bullet points
- [ ] 2.5 Merge all chunk results into one list and run `deduplicatePoints` on the merged output
- [ ] 2.6 Return the deduplicated list, trimmed to `maxSlides`

## 3. Short-Input Bypass

- [ ] 3.1 In the `generateSlides` entry point, check if `notesText.length < 3000`
- [ ] 3.2 If below threshold, skip extraction and use the existing segment extraction path directly
- [ ] 3.3 If at or above threshold, run `extractSlidePoints` and use its output as the segment list for the generation pass

## 4. Wire Extraction into Generation Pipeline

- [ ] 4.1 Update `generateSlides` (or its caller) to accept the notes text as a raw string input alongside (or instead of) pre-segmented notes
- [ ] 4.2 Remove the 40-segment cap and 260-char-per-segment truncation from the generation pass input preparation (these constraints now live in the extraction pass output)
- [ ] 4.3 Confirm the generation pass batching logic still works correctly when fed extracted points (which are already short and well-formed)

## 5. Progress Reporting

- [ ] 5.1 In `src/app/api/generate/route.ts`, add a `phase` field to the JSON response — set to `"extracting"` while extraction runs, `"generating"` during slide generation
- [ ] 5.2 In `src/app/page.tsx`, update the generation loading state to display a two-step progress indicator (e.g., "Extracting key points…" then "Generating slides…") based on the phase field
