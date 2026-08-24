# Repository QR Code Design

## Goal

Add a scannable repository QR code to the title and thank-you slides without disrupting the approved light co-branded visual system.

## Target

The QR code encodes this canonical HTTPS URL exactly:

`https://github.com/sixfeetup/2026_DjangoCon_BatteriesVsSpeed`

## Visual Treatment

- Place the QR treatment at the bottom-right of both `.deck-title` slides.
- Render it as a white card with a subtle border and shadow consistent with the brand lockup.
- Display the QR code at approximately 150–170 CSS pixels square at presentation dimensions.
- Add the short label “Slides + code” in Poppins beneath or adjacent to the code.
- Maintain sufficient quiet zone around the QR modules for reliable scanning.
- Keep the card clear of titles, speaker names, repository text, and slide edges.
- Use the same treatment on the opening and closing slides.

## Implementation

- Generate and commit the QR code as a local SVG under `slides/public/` so it works offline.
- Add a presentation-specific Vue component for the QR card to avoid duplicated markup.
- Place the component once on the title slide and once on the thank-you slide.
- Add scoped global-theme styles for stable bottom-right positioning and projector-visible contrast.
- Preserve all existing slide content, notes, transitions, and co-branding.

## Validation

- Verify the SVG encodes the exact repository URL by decoding it with an independent QR decoder.
- Run the Slidev test suite and production build.
- Render the title and thank-you slides and inspect them for overlap and clipping.
- Confirm both rendered codes decode successfully from exported slide images.
- Confirm the deck remains fully offline.

## Acceptance Criteria

1. Both title-family slides show the same bottom-right “Slides + code” QR card.
2. Both codes decode to the canonical repository URL from rendered output.
3. The card does not overlap existing content or branding.
4. The production build succeeds and existing slide tests remain green.
