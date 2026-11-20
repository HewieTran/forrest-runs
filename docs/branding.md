# Forrest Runs identity

Hieu approved the bright-green evergreen canopy with handwritten **走 inside**,
inspired by Natsuki's sketch, and selected **Manrope Medium** for the English
name on 2026-11-19. This supersedes the earlier tree-beside-kanji concept.
The product name remains **Forrest Runs**, including both r's in Forrest.

## Placement and acceptance

- Shared header: selected canopy artwork beside the complete name in real
  Manrope Medium, retaining the existing home/library destination and account
  controls. Keep the full name readable at desktop and phone widths.
- Sign-in card: a larger canopy mark above the visible title-case product name
  in Manrope Medium. Preserve the sign-in action and existing body text.
- Library: use Manrope for the product-name heading. Other interface typography,
  page layouts, workout status colors and app-wide palette remain unchanged.
- Browser/home-screen metadata: Forrest Runs title/application name with matching
  32px favicon, 180px Apple icon, and 192px/512px manifest icons. Browser display
  mode introduces no offline behavior or service worker.
- Palette: brighter natural green, white kanji/background and a small ochre trunk;
  remove the previous dark tile and yellow ambient wash. The image retains all
  essential kanji strokes and the hand-drawn irregular canopy silhouette.
- Preserve square proportions and explicit dimensions to avoid layout shift.
  At narrow phone widths the training-block link uses its existing accessible
  named icon so the full brand name fits.
- The adjacent product name supplies the accessible label; hide the repeated
  decorative image from assistive technology to avoid duplicate announcements.
- Check signed-out and synthetic app previews, image/font loading, navigation,
  mobile layout and metadata. Existing loading/error/empty states use the shared
  header without new branding-specific state or behavior.

## Assets and font

`public/branding/forrest-runs-512.png` is the largest production export of the
standalone canopy rendition prepared from the approved Manrope study using the
built-in image editor. The WebP header asset and other PNG sizes use the same
artwork. `/favicon.svg` embeds the matching PNG for older links.

The kanji remains an image to preserve Natsuki's lettering direction without
relying on installed Japanese fonts. The English name is real text, rendered
with a self-hosted, Latin-subset static 500 instance of Manrope. The generated
font study was a visual approximation; app type uses the actual font file.

Font source: https://github.com/google/fonts/tree/main/ofl/manrope
License: SIL Open Font License 1.1, copied unchanged to
`public/branding/Manrope-OFL.txt`. `manrope-medium-latin.ttf` includes U+0020–00FF;
non-Latin interface/user content keeps its existing fonts. The brand-only face
uses `font-display: swap` with a system fallback and local preload. No Google
Fonts runtime request, new package or paid service is required. All assets are
portable between the Worker and AWS/Node runtimes.

## Integration

This updates existing branding PR #28, rather than creating a second branding
PR. Current GitHub main `ce0b6f2` (calendar PR #27 and deployment PR #30 included)
was merged into the branding branch before the revision. Preserve concurrent
changes when integrating; do not replace another branch's entire files.

No live Site/AWS deployment or database change is included. The previously
inspected ChatGPT Site source differed from GitHub main; this PR must not replace
its runtime adapters or other Site-only changes. Merge remains Hieu's decision.
Record tested head SHA, environment and blocked checks in the PR before marking
it ready; approvals for an earlier revision do not cover this new artwork/font.
