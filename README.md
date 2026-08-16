# Submission PDF Scanner

[日本語](README.ja.md)

A smartphone-first, privacy-friendly document scanner that turns paper into a submission-ready PDF entirely in the browser.

## What it does

- Camera capture with rear-camera preference and a QR Reader-style camera UI, plus explicit camera on/off, torch, camera switch, and optional auto-capture. Native camera zoom is preferred; centered digital zoom up to 4× is available when the device exposes no zoom capability.
- Local document-corner detection with four-corner touch adjustment.
- Perspective correction and Auto / Color / Grayscale / B&W readability filters.
- Multi-page workflow with direct drag reordering and a three-column smartphone grid.
- App-like smartphone layout with a large capture surface, a discreet top power control, pinch/slider zoom, and fixed **Scan / Pages / PDF** bottom navigation.
- Submission presets for **1 MB**, **2 MB**, **A4**, and **B&W**.
- Editable output filename; `.pdf` is appended automatically when omitted.
- Dependency-free PDF generation, download, and OS share sheet support.
- No image upload, analytics, telemetry, CDN, external fonts, or runtime API calls.
- Japanese / English UI in the same standalone HTML.

## Why “submission-ready” instead of just “scan to PDF”

The app is designed for the frustrating last mile of online paperwork: a photo is skewed, several pages must become one file, the destination requires A4, or the portal rejects files larger than 1–2 MB. The PDF generator therefore treats paper size, color mode, and file-size limits as first-class settings and reports the actual final size before submission.

## Quick start

Open `dist/index.html` in a modern browser. Camera startup is attempted immediately. In desktop Chrome, the app also attempts camera access when opened directly via `file://`, matching the QR Reader behavior; if access is unavailable, use Retry or **Add images**.

After capture/import:

1. Turn the camera on only when needed, adjust zoom with the on-screen slider (or pinch on mobile), capture the page, then check the detected four corners and drag them when needed.
2. Choose Auto, Color, Grayscale, or B&W.
3. Add the page and repeat.
4. Drag page cards to reorder them.
5. Enter the output filename and choose a submission preset or custom paper/color/size settings.
6. Create the PDF, review the pre-submit checks, then save or share it.

## Build

The repository follows the `htmlapps-template` layout. Edit `src/index.template.html`, not generated files under `dist/`.

On Windows PowerShell:

```powershell
powershell.exe -NoLogo -NoProfile -ExecutionPolicy Bypass -File .\build-standalone.ps1
powershell.exe -NoLogo -NoProfile -ExecutionPolicy Bypass -File .\scripts\check-repository.ps1
```

The build creates:

- `dist/index.html` — readable standalone HTML.
- `dist/index.self-extract.html` — gzip self-extracting standalone HTML.
- `dist/build-manifest.json` — build metadata.
- `dist/.nojekyll` — GitHub Pages helper.

## Privacy model

Working images and generated PDFs stay in browser memory. The runtime Content Security Policy sets `connect-src 'none'`, and v1.0 bundles no third-party runtime dependency. Pages are intentionally not persisted to storage, so reloading or closing the tab clears the current scan session.

## Browser notes

Camera access depends on browser permission and context. The app does not exclude `file://`; desktop Chrome is an explicit direct-file target. Other browsers may handle local-file camera permission differently, so retry and image import remain available. Turning the camera off stops the active MediaStream tracks immediately. Torch and camera switching are capability-detected; zoom falls back to centered digital cropping when native track zoom is unavailable.

Automatic corner detection is intentionally recoverable rather than “magic”: difficult backgrounds, low contrast, glare, or shadows can produce an imperfect estimate, and the four corner handles are always available for correction.

## License

MIT
