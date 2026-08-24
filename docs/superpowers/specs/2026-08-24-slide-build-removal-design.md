# Slide Build Removal Design

## Goal

Remove progressive reveal builds throughout the presentation so slide content appears immediately, with one deliberate exception for the slide 8 joke.

## Behavior

- Remove every `v-click`, `v-after`, and `v-clicks` build outside slide 8.
- Preserve slide 8’s “Wait… did it change?” `v-click` reveal.
- Keep the revealed content in its existing location and visual treatment; only remove progressive timing.
- Preserve the normal `slide-left` transition between slides.
- Preserve Mermaid configuration, content, notes, timing, code, and slide order.

## Validation

- Parse the 30-slide deck and assert exactly one `v-click` remains.
- Assert the remaining `v-click` belongs to slide 8 and wraps “Wait… did it change?”.
- Assert no `v-after` or `v-clicks` directives remain.
- Run the Slidev tests and production build.
