## ADDED Requirements

### Requirement: AI generates text content only, not layout coordinates
The system SHALL NOT request layout coordinates (x, y, width, height) from the AI model. The AI response schema SHALL include only text content fields (title, body, type, notes).

#### Scenario: AI prompt contains no layout fields
- **WHEN** the generation API constructs the AI request payload
- **THEN** the JSON schema sent to the model does not include titleBox, bodyBox, or any coordinate fields

#### Scenario: AI response contains no coordinate fields
- **WHEN** the AI model returns a slide response
- **THEN** the response is valid with only title, body, type, and notes fields; no layout coordinates are present or expected

### Requirement: Generated slides use pre-defined template zones for layout
The system SHALL assign zone coordinates from the matching template's zone definition to each generated slide at generation time.

#### Scenario: Slide receives zone coordinates from its template
- **WHEN** a slide is generated with type "point" and a zone definition exists for the point template
- **THEN** the slide's layout fields (titleBox, bodyBox) are populated from the point template's zone definition

#### Scenario: Scripture slide uses scripture template zones
- **WHEN** a slide is generated with type "scripture" and a zone definition exists for the scripture template
- **THEN** the slide's layout fields are populated from the scripture template's zone definition

### Requirement: Fallback to default layout when zones are not defined
The system SHALL use the existing hardcoded default layout coordinates when no zone definition exists for the matched template type.

#### Scenario: Missing zones trigger fallback
- **WHEN** a slide is generated and no zone definition exists for its template type
- **THEN** the slide uses the hardcoded default layout for that type (existing behavior)

#### Scenario: Fallback warning shown in UI
- **WHEN** one or more slides fall back to default layout due to missing zones
- **THEN** the UI displays a warning message indicating which template types had no zones defined

### Requirement: Zone coordinates passed into the generation pipeline
The system SHALL accept zone definitions as an input parameter to the slide generation function, alongside notes, style guide, and template images.

#### Scenario: Zone definitions flow from frontend to generation API
- **WHEN** the user submits a generation request
- **THEN** the current zone definitions for all templates are included in the request payload sent to the generation API

#### Scenario: Generation function receives zone map
- **WHEN** the generation API calls the slide generation library function
- **THEN** the zone definitions are passed as a parameter available for layout assignment
