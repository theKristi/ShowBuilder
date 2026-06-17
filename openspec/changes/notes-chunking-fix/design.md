## Context

The slide generation pipeline in `src/lib/openai.ts` processes user notes in a single pass: it extracts segments, hard-caps at 40 segments of 260 chars each, batches them into ≤5500-char payloads, and sends each batch to the model to generate slides. For small presentations this works. For large sermon notes or multi-topic documents it silently drops content — the caps are hit before the full document is processed, and the user has no visibility into what was discarded.

The underlying problem is that a single model call is being asked to do two cognitively distinct things: (1) understand which parts of the notes are slide-worthy and distill them, and (2) format them as structured slide JSON. Combining these into one pass under tight token constraints forces the truncation.

## Goals / Non-Goals

**Goals:**
- Process notes of arbitrary length without silently dropping content.
- Produce a complete, deduplicated list of slide points before the slide generation pass begins.
- Make the token budget for each model call predictable and safe regardless of input size.
- Show the user that extraction is in progress (two-pass adds latency).

**Non-Goals:**
- Streaming slide output to the UI as each batch completes (future work).
- Summarizing or paraphrasing notes content — extraction should preserve the author's wording.
- Changing the slide generation prompt or output format.
- Changing the document parsing layer (`document-parser.ts`).

## Decisions

### 1. Two-pass architecture: extraction then generation

**Decision**: Split the pipeline into two sequential model calls per document:
1. **Extraction pass** — takes raw notes text in chunks, outputs a flat list of concise slide-ready bullet points.
2. **Generation pass** — takes the extracted bullet list (small, predictable size) and generates structured slide JSON as today.

**Rationale**: The extraction pass can be chunked over the full document without the 260-char / 40-segment caps because its output is compact (one short bullet per intended slide). The generation pass then operates on a well-sized, pre-filtered input — token budget is controlled by the extractor's output size, not the raw document size.

**Alternative considered**: Increase batch sizes and remove caps in the existing single-pass approach. Rejected — this still risks hitting context limits on very large documents, and the model's slide formatting quality degrades when it also has to decide relevance over a large corpus.

---

### 2. Extraction chunks are fixed-size character windows with overlap

**Decision**: Split the raw notes text into overlapping character windows (chunk size ~4000 chars, overlap ~200 chars) for the extraction pass. Each chunk is processed independently; results are concatenated and deduplicated.

**Rationale**: Fixed character windows are simple, predictable, and avoid the complexity of semantic chunking. Overlap prevents bullet points that straddle a chunk boundary from being lost. Deduplication after merge handles any points extracted twice due to overlap.

**Alternative considered**: Chunk by paragraph or sentence boundary. Rejected for now — paragraph detection is fragile on PDF-extracted text which often has inconsistent whitespace. Can be added later as a refinement.

---

### 3. Deduplication by normalized text similarity

**Decision**: After merging extraction results across chunks, deduplicate by normalizing each bullet (lowercase, strip punctuation, collapse whitespace) and dropping near-duplicates using exact-match on the normalized form.

**Rationale**: Simple and no new dependencies. The overlap window means genuine duplicates will have identical or near-identical normalized text. Fuzzy/semantic deduplication is out of scope.

**Alternative considered**: Embedding-based semantic deduplication. Rejected — adds latency, cost, and a new API dependency for marginal gain at this scale.

---

### 4. Extraction output is capped to a max slide count, not the input

**Decision**: The extraction prompt instructs the model to output at most N bullet points (default: 40), where N is a configurable parameter passed by the caller (e.g., user-specified target slide count or the default max). The generation pass receives exactly these N points.

**Rationale**: The cap should be on the intended output (slides), not the input (notes segments). This makes the cap semantically meaningful rather than an artifact of text chunking.

---

### 5. Progress reported to client via response metadata

**Decision**: The generate API route returns a `phase` field in its response indicating which step completed (`extraction`, `generation`). The client shows a two-step progress indicator.

**Rationale**: The extraction pass adds noticeable latency on large documents. Without feedback the user assumes the app is frozen. A simple phase label is sufficient; full streaming is deferred.

**Alternative considered**: Server-Sent Events for real-time streaming. Deferred — requires more infrastructure change than this fix warrants right now.

## Risks / Trade-offs

- **Two API calls doubles minimum latency on small documents** → Mitigation: if the raw notes text is below a threshold (e.g., 3000 chars), skip the extraction pass and use the existing direct path.
- **Extraction model may miss content if a key point is buried in a large chunk** → Mitigation: overlap window reduces boundary loss; user can always adjust notes formatting.
- **Deduplication may drop legitimately repeated points (e.g., a refrain or repeated scripture)** → Mitigation: normalization is coarse enough that slight wording variations survive; exact duplicate removal is correct for the common case.
- **Extraction adds cost (one extra model call per chunk)** → Accepted; the model used is gpt-4.1-mini which is low cost per token.

## Open Questions

- Should the extraction pass be skippable via a UI toggle for users who prefer the current single-pass behavior? (deferred — add only if users request it)
- What is the right chunk size / overlap? 4000/200 chars is a starting guess; may need tuning based on real sermon notes length.
