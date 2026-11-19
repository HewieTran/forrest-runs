# Forrest Runs identity

Hieu selected the second, hand-drawn tree-and-走 app icon on 2026-11-19.
The product name remains **Forrest Runs**, including both r's in Forrest.

## Placement and acceptance

- Shared header: selected artwork beside the complete text name; the existing
  home/library destination and account controls remain available.
- Sign-in card: selected artwork above the existing visible product name.
- Browser: Forrest Runs title/application name and matching 32px favicon.
- Home-screen/bookmark metadata: full product name and matching 180px Apple,
  192px and 512px icons. The manifest uses browser display mode; it does not
  introduce offline behavior or a service worker.
- Desktop and phone: preserve the artwork's square proportions; avoid layout
  shift with explicit dimensions. At narrow phone widths the training-block
  link uses its existing named icon so the full brand name fits.
- The adjacent product name supplies the accessible label. The repeated icon
  is decorative and must not cause duplicate announcements.
- Check the signed-out screen, shared header across app pages, image loading,
  mobile layout and metadata on the tested revision. Existing loading/error/
  empty states use the same shared header without new branding-specific states.

## Assets

`public/branding/forrest-runs-512.png` is the largest production export of the
standalone rendition prepared from the approved middle concept using the built-in
image editor. The WebP header asset and other PNG sizes use the same artwork.
The legacy `/favicon.svg` URL embeds the new PNG for older links.

Keep the kanji artwork as an image so its lettering does not depend on installed
Japanese fonts. Use the existing application typeface for the full name. This
is the current provisional identity, not a new site palette or a hand-lettered
English wordmark. All assets are served locally from `public/` in both hosting
runtimes; no new dependency or external image request is required.

## Integration

This focused branch starts from GitHub main `bebd5202e7f8dc123406949822a635f0c9520a4f`.
The open workout-calendar PR #27 remains separate. Review overlapping header
and layout work when integrating; do not replace another branch's entire files.

At inspection, the existing ChatGPT Site was version 38, source
`d073c4c3d105c034375d2f138d808585650aec11`, which differs from GitHub main.
This branding PR must not overwrite that Site's runtime adapters or unpublished
calendar work. No live Site/AWS deployment or database change is included.
Merge remains Hieu's decision. Record tested SHA, environment and any blocked
checks in the PR before marking it ready.
