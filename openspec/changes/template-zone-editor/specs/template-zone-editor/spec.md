## ADDED Requirements

### Requirement: User can draw text zones on a template image
The system SHALL provide a zone editor for each uploaded template slide image. The editor SHALL allow the user to draw rectangular zones labeled "title" and "body" by clicking and dragging on the template image preview.

#### Scenario: Draw a title zone
- **WHEN** the user selects "title" zone type and drags on the template image preview
- **THEN** a labeled rectangle is drawn over the image representing the title zone in percentage coordinates

#### Scenario: Draw a body zone
- **WHEN** the user selects "body" zone type and drags on the template image preview
- **THEN** a labeled rectangle is drawn over the image representing the body zone in percentage coordinates

#### Scenario: Replace an existing zone
- **WHEN** the user draws a new zone of a type that already exists on that template
- **THEN** the previous zone of that type is replaced with the new one

### Requirement: Zone editor shows existing zones
The system SHALL display all currently defined zones as labeled overlays on the template image at all times (not only during drawing).

#### Scenario: Zones visible after drawing
- **WHEN** the user has defined a title and body zone on a template
- **THEN** both zones are shown as labeled, colored rectangles over the template image preview

### Requirement: User can remove a zone
The system SHALL allow the user to delete an individual zone (title or body) from a template.

#### Scenario: Delete a zone
- **WHEN** the user clicks the delete control on a zone overlay
- **THEN** that zone is removed from the template's zone definition and the overlay disappears

### Requirement: Zone coordinates are percentage-based
The system SHALL store all zone positions and dimensions as percentages of the template image dimensions (0–100), not pixels.

#### Scenario: Zone stored as percentages
- **WHEN** the user finishes drawing a zone
- **THEN** the zone is stored as `{ x, y, width, height }` each in the range 0–100

### Requirement: Zone editor is accessible per template
The system SHALL show a zone editor for each template image the user has uploaded, in the template setup section of the UI.

#### Scenario: Multiple templates each have their own zones
- **WHEN** the user has uploaded two template images
- **THEN** each template image has its own independent zone editor with its own zone definitions

### Requirement: Zones not defined indicator
The system SHALL display a visible indicator on a template when no zones have been defined for it.

#### Scenario: No zones defined badge
- **WHEN** the user has uploaded a template image but drawn no zones on it
- **THEN** the template preview shows a "Zones not set" indicator
