## ADDED Requirements

### Requirement: Extraction pass produces slide-ready bullet points from raw notes
The system SHALL run a first-pass AI call on the user's notes before slide generation. This pass SHALL output a flat list of concise bullet points, one per intended slide, without paraphrasing or adding content not present in the notes.

#### Scenario: Extraction outputs one point per intended slide
- **WHEN** the extraction pass completes on a set of notes
- **THEN** the output is a list of strings, each representing one slide-worthy point drawn from the notes

#### Scenario: Extraction does not paraphrase
- **WHEN** the extraction pass processes a segment of notes
- **THEN** each extracted bullet uses the wording from the notes, not a rewritten summary

### Requirement: Extraction pass is bounded by a configurable max slide count
The extraction prompt SHALL instruct the model to output no more than N bullet points, where N is passed as a parameter by the caller.

#### Scenario: Output respects max slide count
- **WHEN** the extraction pass is called with maxSlides = 30
- **THEN** the output contains at most 30 bullet points

### Requirement: Extraction pass skipped for short inputs
The system SHALL skip the extraction pass and proceed directly to slide generation when the raw notes text is below a character length threshold (3000 characters).

#### Scenario: Short notes bypass extraction
- **WHEN** the notes text is fewer than 3000 characters
- **THEN** the generation pipeline proceeds without running the extraction pass

#### Scenario: Long notes run extraction
- **WHEN** the notes text is 3000 characters or more
- **THEN** the extraction pass runs before slide generation

### Requirement: Extracted points are deduplicated before generation
The system SHALL remove duplicate bullet points from the merged extraction output before passing them to the generation pass. Deduplication SHALL use normalized text comparison (lowercase, punctuation stripped, whitespace collapsed).

#### Scenario: Duplicate points removed
- **WHEN** two extracted bullets normalize to the same string
- **THEN** only one is retained in the list passed to generation

### Requirement: Generation pass receives extracted points, not raw notes
After extraction, the slide generation pass SHALL use the extracted bullet list as its input instead of the raw notes segments.

#### Scenario: Generation input is extracted points
- **WHEN** the extraction pass has run
- **THEN** the generation pass receives the extracted bullet list and does not re-process the raw notes text
