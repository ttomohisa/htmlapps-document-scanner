# Submission PDF Scanner

[![GitHub Pages](https://github.com/ttomohisa/htmlapps-document-scanner/actions/workflows/deploy-pages.yml/badge.svg)](https://github.com/ttomohisa/htmlapps-document-scanner/actions/workflows/deploy-pages.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)
[![Single HTML](https://img.shields.io/badge/distribution-single%20HTML-0ea5e9)](https://ttomohisa.github.io/htmlapps-document-scanner/)

[日本語版 README](README.ja.md)

A privacy-focused, smartphone-first document scanner that turns paper into a **submission-ready PDF** entirely in the browser.

Capture a document, correct perspective, organize multiple pages, apply A4 / B&W / file-size requirements, and save or share the final PDF without uploading the document to a server.

## 🚀 Live demo

### [Open Submission PDF Scanner on GitHub Pages](https://ttomohisa.github.io/htmlapps-document-scanner/)

GitHub Pages delivers the initial HTML. After it loads, camera capture, image import, corner detection, perspective correction, filtering, page organization, PDF generation, and file-size adjustment are processed locally on your device.

The photos and documents you select are not uploaded by the app.

## Features

- Camera-first document capture with a native-app-style UI on smartphones
- Explicit camera **ON / OFF** control that releases the active `MediaStream` when disabled
- Rear-camera preference, camera switching, and torch control when supported by the device
- Native camera zoom when available, with centered **digital zoom up to 4×** as a fallback
- Pinch / swipe / slider zoom controls on smartphones
- Optional automatic capture when the document becomes stable
- Local four-corner document detection with manual corner adjustment
- Perspective correction for skewed photos
- Auto / Color / Grayscale / B&W readability filters
- Multi-page scanning workflow
- Drag-and-drop page reordering
- Three-column page grid on smartphones
- Editable output filename with automatic `.pdf` extension
- Submission presets for **1 MB**, **2 MB**, **A4**, and **B&W**
- Adaptive JPEG quality and resolution reduction for file-size limits
- Portrait and landscape A4 output
- Pre-submit checks showing the final PDF size and selected conditions
- Download and Web Share API support
- Japanese and English UI in the same HTML
- Responsive desktop and smartphone layouts
- No runtime CDN, external font, analytics, telemetry, or server-side processing

## Why “submission-ready” instead of just “scan to PDF”

The app is designed for the awkward last step of online paperwork.

Typical problems include:

- The photo is skewed or shot at an angle.
- Three pages need to become one PDF.
- The destination requires A4 pages.
- The portal accepts only files under 1 MB or 2 MB.
- The document must be B&W.
- The final file needs to be shared immediately from a phone.

Submission PDF Scanner treats those requirements as part of the scan workflow instead of making the user fix them afterward in another app.

## Quick start

### Use the web demo

Just [open the demo](https://ttomohisa.github.io/htmlapps-document-scanner/). No installation or account is required.

The app attempts to start the camera when the scan screen opens. You can turn the camera off at any time from the camera UI.

### Use the downloaded HTML directly

1. Download `dist/index.html` from this repository.
2. Open it in a current Chromium-based browser, Firefox, or Safari.
3. Allow camera access when prompted, or use **Add images** instead.

Desktop Chrome is also an explicit `file://` target. The app does not block camera startup simply because the HTML was opened directly from disk.

Browser camera permission behavior can still vary by browser and operating system.

### Use it fully offline

1. Download or clone this repository.
2. Double-click `build-standalone.bat` on Windows, or run the PowerShell builder.
3. Copy the generated `dist/index.html` wherever you need it.
4. Open that single file later without an internet connection.

No Python, Node.js, or local web server is required for normal use of the generated HTML.

## Usage

1. Open the app and turn the camera on when needed, or import one or more existing images.
2. Adjust zoom so the whole document is visible.
3. Capture the page.
4. Check the detected four corners and drag the handles if correction is needed.
5. Choose Auto, Color, Grayscale, or B&W and add the page.
6. Repeat for additional pages.
7. Drag page cards to reorder them.
8. Enter the output filename.
9. Choose a submission preset such as **1 MB**, **2 MB**, **A4**, or **B&W**, or use custom settings.
10. Generate the PDF, review the final size and pre-submit checks, then save or share it.

### Camera controls

- **Power** — starts or completely stops the camera stream.
- **Torch** — available only when the active camera and browser expose torch control.
- **Camera switch** — switches between available video-input devices.
- **Zoom** — uses native track zoom when available; otherwise the app uses centered digital cropping.
- **Auto capture** — optionally captures when the document remains stable.
- **Add images** — imports photos or scans already stored on the device.

When the camera is turned off, the active video tracks are stopped instead of leaving the camera running in the background.

## Submission presets

| Preset | Behavior |
| --- | --- |
| Standard | Keeps normal output settings without a strict size limit |
| 1 MB | Reduces JPEG quality and resolution as needed to target 1 MB or less |
| 2 MB | Reduces JPEG quality and resolution as needed to target 2 MB or less |
| A4 | Places pages on portrait or landscape A4 sheets |
| B&W | Generates monochrome document pages |

File-size presets are best-effort. Extremely image-heavy documents may require stronger quality reduction, so always verify small text in the generated PDF before submitting it.

## Publish with GitHub Pages

The repository includes a workflow that builds the standalone HTML and deploys it to GitHub Pages.

1. Push the repository to GitHub as `htmlapps-document-scanner`.
2. Open **Settings → Pages → Build and deployment → Source** and select **GitHub Actions**.
3. Push to `main`, or manually run the Pages deployment workflow from the Actions tab.
4. After a successful deployment, the demo is available at `https://ttomohisa.github.io/htmlapps-document-scanner/`.

Each push to `main` rebuilds and verifies the standalone files before deployment.

## Development and build layout

```text
.
├─ src/index.template.html       # Application source
├─ app.config.json               # Product metadata
├─ dependencies.json             # Embedded dependency definitions
├─ build-standalone.bat          # Windows build entry point
├─ build-standalone.ps1          # Standalone HTML builder
├─ scripts/
│  └─ check-repository.ps1       # Repository / standalone verification
├─ dist/
│  ├─ index.html                 # Readable standalone release
│  └─ index.self-extract.html    # Gzip self-extracting standalone release
└─ .github/workflows/
   ├─ build-standalone.yml       # Pull request build validation
   └─ deploy-pages.yml           # Automatic GitHub Pages deployment
```

Edit `src/index.template.html`, not the generated files under `dist/`.

### Build and verify

```powershell
powershell.exe -NoLogo -NoProfile -ExecutionPolicy Bypass -File .\build-standalone.ps1
powershell.exe -NoLogo -NoProfile -ExecutionPolicy Bypass -File .\scripts\check-repository.ps1
```

The build produces:

- `dist/index.html`
- `dist/index.self-extract.html`
- build and dependency manifests
- `dist/.nojekyll`

The verifier checks the generated standalone files for unresolved placeholders and unintended external runtime dependencies.

## Privacy and runtime network protection

The application is intentionally local-first.

- Camera frames and imported images stay in browser memory.
- Perspective correction and image filtering run locally.
- PDF generation runs locally.
- The generated PDF is exported only after a user action.
- The runtime Content Security Policy includes `connect-src 'none'`.
- The app has no analytics, telemetry, account system, cloud storage, or document upload API.

The GitHub Pages version naturally requires an initial request to load the HTML. After that, the document-processing workflow does not upload the scanned content to the app's server.

For a completely disconnected workflow, open the generated `dist/index.html` directly from disk.

## Browser notes

- Camera access depends on browser and OS permission settings.
- Desktop Chrome can attempt camera access when the generated HTML is opened directly with `file://`.
- Other browsers may apply different local-file camera policies.
- Torch, native zoom, and camera switching are capability-detected and may not be available on every device.
- Digital zoom remains available when native camera zoom is not exposed.
- Web Share is available only when supported by the browser and operating system.

If camera access is unavailable, the app can still create PDFs from imported images.

## Limitations

- Automatic corner detection can be inaccurate on low-contrast surfaces, white desks, reflections, deep shadows, or documents whose edges are outside the frame.
- Manual four-corner adjustment is provided for recovery.
- OCR and searchable-text PDF generation are not included in v1.0.
- File-size targets are best-effort rather than byte-perfect guarantees.
- Very high-resolution photos or large page counts can consume substantial device memory.
- Reloading or closing the tab clears the current scan session because page images are intentionally not persisted.
- Camera capability varies significantly between browsers, webcams, and smartphone camera implementations.

## Dependencies

The current v1.0 runtime does not require a third-party library for the main scanning and PDF-generation flow.

Perspective correction, image processing, page management, camera handling, and PDF creation are implemented with browser APIs and application code. See [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md) for the current dependency record.

## Security

See [SECURITY.md](SECURITY.md) for the trust boundary and file-handling model.

## License

Copyright © 2026 ttomohisa

Licensed under the [MIT License](LICENSE).
