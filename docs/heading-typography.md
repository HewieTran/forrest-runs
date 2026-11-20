# Manrope heading typography

Hieu approved the existing library product heading as the reference on
2026-11-20: actual Manrope Medium at weight 500, with the existing small UI text
retained. Generated font mockups are visual references, not font binaries.

## Scope and acceptance

- Reuse the existing self-hosted `Forrest Manrope` 500 face and preload. No new
  font download, package, external request, subscription, or infrastructure.
- Apply the shared heading family to page and section headings, including
  training-block titles, workout highlights, weekly mileage, journey, guide,
  schedule/month/date headings, setup, and workout-dialog titles.
- Use weight 500 for these headings. Retain the existing logo, body typography,
  form fields, labels, numerical stats, artwork, colors, navigation and actions.
- Preserve existing responsive sizes. Give the workout title 1.1 line height
  and slightly more letter spacing so the new family can wrap naturally.
- Desktop and phone review must cover long titles and the highlight's scheduled,
  completed, rest and unscheduled states, plus schedule and editor navigation.
- Font loading uses the existing local preload and `font-display: swap` fallback;
  empty, loading, error and save behavior receive no functional changes.
- Verify actual computed family and weight in the browser, font loading and
  overflow before final visual sign-off. Record unavailable checks honestly.

## Architecture and data

Architecture impact: none. This changes presentation CSS only. Ownership checks,
APIs, calculations, persistence, records, database migrations, authentication,
AWS resources and operating cost are unchanged. The existing font remains
portable between the Worker and AWS/Node runtimes.

## Delivery

Keep the GitHub feature branch based on current main. Port only the matching
typography patch onto the current ChatGPT Site source; preserve its separate
runtime history. Record the PR head, Site source/version, checks, independent
QA results and outstanding visual review in the PR. Merge remains Hieu's
decision; staging deployment does not update AWS beta.
