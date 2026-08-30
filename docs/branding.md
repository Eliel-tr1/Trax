# Brand reference (pulled from trax-club.com, 2026-08-30)

Observed via computed styles on the live site — not an official brand
guideline doc (none exists), so treat as a strong starting point for the
design-polish pass, not gospel. Confirm with Goldi/Zarkosh if it matters.

- **Accent color:** `rgb(214, 90, 31)` — burnt orange/rust. Dominant color
  across headings, links, buttons.
- **Background:** near-black `rgb(10, 10, 10)` — the site is dark-themed.
- **Fonts:** `Rubik` (body/UI) and `"Varela Round"` (some headings) — both
  Google Fonts, both support Hebrew.
- **Secondary near-white text:** ~`oklab(0.999994 ... / 0.7-0.8)` — i.e.
  white text at reduced opacity for secondary copy, not a separate gray.

## For this app's theme-bridge

Map these onto the same CSS-variable approach bina-crm uses (semantic tokens
that flip cleanly between light/dark), with `rgb(214, 90, 31)` as
`--primary` and the dark palette as the default (matching the site's own
dark-first identity) rather than treating dark mode as secondary.
