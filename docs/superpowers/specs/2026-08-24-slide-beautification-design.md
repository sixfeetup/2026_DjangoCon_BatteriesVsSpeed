# Slide Beautification and Co-branding Design

## Goal

Redesign the Slidev presentation for strong conference-hall projection while giving Six Feet Up and REVSYS equal visual presence. The deck should share a visual family with Six Feet Up's earlier "IAM Drift Is Quietly Killing Your Cloud Security" presentation without reproducing that deck exactly.

The redesign will preserve the talk's argument, content, speaker notes, timing guidance, click animations, and code highlighting.

## Visual Direction

Use a light editorial theme derived from the selected Option C mockup.

- Use a light lavender-white canvas as the default slide background.
- Use dark charcoal for primary text and muted gray for supporting text.
- Use Six Feet Up purple and REVSYS blue as equal accent colors.
- Use Poppins for presentation text and Roboto Mono for code and numeric details.
- Favor generous whitespace, strong heading hierarchy, thin rules, and restrained geometric decoration.
- Avoid large dark backgrounds so the deck remains legible on lower-quality conference projectors.
- Keep dark backgrounds inside code panels to preserve syntax contrast.

## Co-branding

Both organizations are equal partners in the presentation.

- Show the Six Feet Up and REVSYS logos at equal visual weight on the title and closing slides.
- Use a compact co-brand lockup on recurring branded elements where space allows.
- Combine purple and blue in rules, edge treatments, section graphics, and comparison accents.
- Do not visually assign either company to Django or FastAPI. The brands identify the presenters, not opposing framework positions.
- Store both logo files locally in the slide project. The built deck must not depend on either company's website.

## Slide System

### Title and Closing Slides

Use the balanced co-brand lockup near the top. Present the title at large scale with a purple accent on "vs." and list Calvin Hendryx-Parker and Frank Wiles with equal prominence. Keep the composition open and bright.

### Section Dividers

Use a numbered section graphic in a pale purple-and-blue rail. Pair it with a short kicker, a strong section statement, and an optional one-sentence transition. Section dividers remain light rather than reverting to the reference deck's dark wave backgrounds.

### Content Slides

Use a clear heading followed by a purple-to-blue rule. Place cards, comparisons, diagrams, or key statements below it. Cards use white panels, subtle borders, and a single purple, indigo, or blue top accent. Avoid decorative containers where plain text has stronger hierarchy.

### Code Slides

Place code in dark charcoal panels on the light slide canvas. Use purple and blue panel accents to distinguish examples without permanently mapping a framework to a company. Preserve Slidev's line highlighting and click progression. Side-by-side code uses equal panel dimensions when the examples are directly comparable.

### Footer and Slide Numbers

Use a quiet footer with a thin purple-to-blue rule, short talk identifier, and monospaced slide number. It must not compete with slide content. Omit or simplify the footer on title and closing slides.

## Implementation Structure

- Add local Six Feet Up and REVSYS logo assets under the Slidev project's public or asset directory.
- Add a global Slidev stylesheet containing design tokens and shared treatments for typography, backgrounds, code, cards, tables, and layout classes.
- Add small Vue components for the co-brand lockup and recurring footer if components reduce repeated markup. Components must remain presentation-specific and have simple, explicit props.
- Apply semantic slide classes such as `title`, `section`, `content`, and `code-comparison` through Slidev frontmatter.
- Adjust slide markup only where required for visual hierarchy, projection readability, or use of the recurring slide types.
- Keep presentation content and speaker notes intact.

## Content Migration Rules

- Every existing slide receives the new typography, background, and shared branding.
- Existing card grids, two-column comparisons, tables, quotations, charts, and callouts are adapted to the new visual system rather than mechanically wrapped in one layout.
- Dense slides may receive spacing or font-size adjustments, but content will not be deleted or rewritten as part of visual implementation.
- Framework colors and company colors remain conceptually separate. Purple and blue are visual accents, not labels for Django, Django Ninja, or FastAPI.
- Emoji may remain where they improve scanning, but should not become the primary visual identity.

## Resilience and Fallbacks

- Logos are local SVG assets with valid SVG namespaces and accessible labels.
- Font stacks include system fallbacks in case web fonts are unavailable at presentation time.
- The deck remains usable without network access.
- Shared styles avoid selectors tied to generated Slidev internals where stable classes or explicit slide classes are available.
- Long headings, code, and speaker-provided content should wrap or scale within fixed slide bounds rather than overflow.

## Validation

- Run the existing production build with the repository's pinned Node and pnpm versions.
- Export the deck to images or PDF and inspect all slides for clipping, overflow, unreadable type, and inconsistent branding.
- Check title, section, content, comparison, table, quotation, chart, and code slide families at presentation dimensions.
- Confirm click animations and code line highlighting still function in the browser.
- Confirm the deck renders with the network disabled and all logos remain visible.
- Confirm the visual treatment does not imply that either company represents one framework.

## Out of Scope

- Rewriting the talk narrative or technical claims.
- Changing benchmark data or demo applications.
- Creating new corporate identity systems for either company.
- Rebuilding the deck in Reveal.js.
- Adding animation beyond adapting existing Slidev transitions and click behavior to the new layouts.

## Acceptance Criteria

The redesign is complete when:

1. The full deck uses the approved light editorial visual system.
2. Six Feet Up and REVSYS receive equal, accurate co-brand treatment.
3. All recurring slide types match the approved mockups in structure and visual intent.
4. Existing content, notes, timing, clicks, and code highlighting are preserved.
5. A production build succeeds.
6. Exported slides show no unintended clipping or overflow.
7. The complete presentation works offline.
