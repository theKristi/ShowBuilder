## ADDED Requirements

### Requirement: Notes text is split into overlapping character windows for extraction
The system SHALL split the raw notes text into chunks of a fixed character size with a small overlap before passing to the extraction model. Each chunk SHALL be processed independently.

#### Scenario: Text split into chunks
- **WHEN** notes text exceeds the chunk size (4000 characters)
- **THEN** the text is divided into multiple chunks, each up to 4000 characters

#### Scenario: Chunks overlap at boundaries
- **WHEN** chunks are created from a large text
- **THEN** each chunk (except the first) begins 200 characters before the end of the previous chunk, preventing content loss at boundaries

#### Scenario: Single chunk for short text
- **WHEN** notes text is shorter than the chunk size
- **THEN** the text is processed as a single chunk with no splitting

### Requirement: Extraction results from all chunks are merged into a single list
The system SHALL concatenate the bullet point lists returned from each chunk's extraction call into one flat list before deduplication.

#### Scenario: Multi-chunk results merged
- **WHEN** three chunks each return a list of extracted points
- **THEN** all three lists are concatenated into a single list for deduplication

### Requirement: Each chunk is processed with an independent model call
The system SHALL make one model call per chunk during extraction. Chunks SHALL be processed sequentially.

#### Scenario: One call per chunk
- **WHEN** notes text is split into four chunks
- **THEN** four separate model calls are made during the extraction pass

### Requirement: Generation progress is reported in two phases
The system SHALL communicate extraction and generation as separate named phases to the client so the UI can show meaningful progress.

#### Scenario: Extraction phase reported
- **WHEN** the extraction pass begins
- **THEN** the API response (or progress signal) indicates phase = "extracting"

#### Scenario: Generation phase reported
- **WHEN** the generation pass begins
- **THEN** the API response (or progress signal) indicates phase = "generating"
