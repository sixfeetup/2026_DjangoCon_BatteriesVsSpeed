# Benchmark Slide Order Design

## Goal

Present each benchmark result immediately after the slide that introduces its corresponding demo, so the audience does not need to retain one scenario while a second scenario is introduced.

## Approved Order

1. `Scenario A: ZIP typeahead`
2. `Results: Redis workload`
3. `Scenario B: Zellit`
4. `Results: PostgreSQL workload`

## Constraints

- Move complete Slidev slide blocks, including frontmatter, visible content, components, speaker notes, timing notes, and click behavior.
- Do not rewrite benchmark claims, placeholders, scenario details, or timing guidance.
- Preserve the total 30-slide count.
- Keep all surrounding slides in their current relative order.
- Let Slidev footer page numbers update automatically from the new order.

## Validation

- Parse the deck and assert the four headings occur in the approved sequence.
- Confirm the deck still contains exactly 30 slides.
- Run tests and the production build.
- Verify the running presentation shows ZIP followed by Redis results and Zellit followed by PostgreSQL results.
