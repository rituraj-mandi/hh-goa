# What changed, and why

Rebuilt against the actual shortlisting rubric (`HH_Goa_2026_Shortlisting_Task_Frame_ID_Generator.pdf`).
Scope: Format B (Builder ID Card) only, executed thoroughly — both 100-scoring
submissions picked one format and nailed it rather than splitting effort.

## Working share flow (the biggest gap in the original)
The old `shareToX()` opened a text-only tweet intent with no image and no
working link preview — a direct miss on "pre-filled caption + hashtag,
image attached or working OG preview."

New flow: `navigator.share({ files: [pngBlob], text })` hands the *actual
generated card* straight to the OS share sheet on mobile (where most
builders will use this), so X gets the real image attached directly — no
OG image gamble needed. Desktop browsers without file-sharing support get
a graceful fallback: auto-download the PNG + open a pre-filled compose tab.
Also added real `og:image` / `twitter:image` tags pointing at a static
branded preview (`assets/og-preview.png`) for the case a raw link does get
pasted somewhere.

## Real photo handling
- `createImageBitmap(file, { imageOrientation: 'from-image' })` auto-corrects
  EXIF rotation — the classic "sideways iPhone photo" bug.
- HEIC/HEIF now actually decodes (via `heic2any`, loaded only when needed)
  instead of silently failing on non-Safari browsers.
- Huge phone photos are downscaled before touching the canvas (speed +
  avoids mobile memory crashes).
- Added drag-to-reposition + a zoom slider so off-center subjects and odd
  aspect ratios can actually be composed well, instead of assuming a naive
  center-crop is always right. Crop math is clamped and unit-tested
  (portrait, landscape, off-center, zoom bounds all verified).

## On-brand, not a generic badge
- Card now uses your actual logo lockup (`wordmark.svg` — the real
  "HACKER HOUSE गोवा" mark) and the Devanagari stamp as a corner seal,
  instead of retyped sans-serif text.
- Name is set in Bodoni Moda (matches the high-contrast serif in your own
  brand lockup) instead of a generic geometric sans — this was the single
  biggest "generic template" tell in the original.
- Added ticket-stub perforation notches (true transparent die-cuts, not
  background-colored circles) and a diagonal holographic sheen — reads as
  a laminated event badge rather than a flat PNG with a logo on it.
- Background swapped from generic glow-orb glassmorphism to a real (and
  compressed — 2MB → 44KB) crop of your beach illustration.

## Output quality
- Canvas renders at 2x internal resolution for a crisp downloaded PNG.
- Webfonts are explicitly loaded (`document.fonts.ready`) before first
  paint, so you never get a fallback-font flash baked into the export.
- Name/role auto-shrink to fit instead of silently overflowing.
- ID code is now generated once per upload and stays stable — previously
  it re-randomized on every keystroke, which is a small but visible polish bug.

## Mobile + accessibility
- Pointer events (not mouse-only) for the drag/reposition interaction.
- 48px+ touch targets, `touch-action: none` on the canvas to stop scroll
  fighting the drag gesture, safe-area padding for notched phones.
- Visible focus states, proper label associations, `aria-live` status
  region for upload/share feedback.

## Before shipping
Search this project for `SITE_URL` / `SITE_URL` placeholders in
`index.html` and `app.js` and replace with your real deployed URL — link
previews need an absolute image URL to resolve correctly.
