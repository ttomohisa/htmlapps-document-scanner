# APP_SPEC.md

## 1. Product identity
- **Name:** Submission PDF Scanner / 提出PDFスキャナー
- **Purpose:** Turn paper documents into submission-ready PDFs from a phone browser without uploading source images.
- **Primary users:** People submitting forms to government, school, insurance, workplaces, and other web portals.
- **Release:** `dist/index.html` and `dist/index.self-extract.html`
- **Version:** `1.0.1`

## 2. Core outcome
A user can photograph or import several paper pages, automatically detect the document, fine-tune four corners, correct perspective, enhance readability, reorder pages, and generate/share one PDF that satisfies common submission constraints.

## 3. Core flow
1. Open the app and grant camera permission, or import existing images.
2. Capture a page. The app estimates document corners locally.
3. Review the actual corrected result; switch to the four-corner adjustment view and drag corners when needed.
4. Choose No enhancement / Auto / Color / Grayscale / B&W and add the page.
5. Repeat. Pages appear as draggable cards (3 columns on narrow phones); Preview reopens a saved page for filter or corner changes.
6. Enter or edit the output filename, then choose a submission preset: Standard, 1 MB, 2 MB, A4, or B&W.
7. Generate the PDF. The app checks page count, output size, paper mode, and target-size compliance.
8. Download or share the PDF with the OS share sheet when supported.

## 4. Functional requirements
- Camera capture with environment-facing camera preference.
- Camera can be turned on/off explicitly from the preview without leaving the workflow; the off state must release all active media tracks.
- Camera switch when multiple cameras are available where the browser exposes it.
- Torch when supported by the active camera track.
- Zoom is always available while the camera is active: use native camera-track zoom when exposed, otherwise use centered digital zoom up to 4×. Detection and captured output must match the zoomed field of view.
- Optional auto-capture: detect a stable document for consecutive scans and trigger capture.
- Image import through `<input type=file accept=image/* multiple>`.
- Local document-corner estimation that combines directional edge strength, inside/outside paper contrast, robust line fitting, edge coverage, and quadrilateral geometry, with graceful fallback to an inset rectangle.
- Editor can switch between an actual corrected-result preview and a four-corner touch adjustment view with accessible reset and full-image actions.
- Perspective correction using WebGL, with a Canvas 2D fallback.
- Filters: No enhancement, Auto (conservative smooth illumination/levels correction with color preservation), Color (light contrast correction), Grayscale, B&W.
- Page cards include Preview so a saved working page can be reopened to change filter/corners before PDF generation.
- Rotation and delete from page cards; delete offers Undo.
- Pointer/touch reorder with target highlighting and auto-scroll near viewport edges; touch devices provide a dedicated grip for reliable vertical and cross-row moves.
- Three page columns on narrow smartphones.
- Smartphone camera UX follows the Browser Kitty QR Reader pattern: near-full-screen live preview, safe-area-aware top controls, a discreet camera power control, status overlay, translucent bottom camera dock, inline zoom, pinch/swipe zoom gestures, and fixed page-like bottom navigation (Scan / Pages / PDF) that switches views instead of scrolling between sections.
- Desktop camera UX uses a large live-preview surface with glass-style overlay controls, a centered shutter dock, inline zoom, and a compact camera power control rather than form-like camera buttons.
- PDF output generated without a server or third-party runtime library.
- A4 and original-ratio paper modes.
- Output size presets including 1 MB and 2 MB, using JPEG quality and resolution reduction.
- Output filename editing with a sane default; invalid filesystem characters are replaced and `.pdf` is appended when omitted.
- Download and Web Share API file sharing when available.
- Japanese/English switch without reload.
- In-app help with privacy, camera constraints, and data-loss notes.

## 5. Data and privacy
- No source image, camera frame, page image, or PDF is uploaded by the app.
- No analytics or telemetry.
- Working pages are kept in memory only and are lost on reload/close.
- The browser/OS may independently record permission state or downloads.

## 6. Non-goals for v1
- OCR/searchable text layer.
- Cloud backup or sync.
- Signatures/form filling.
- Guaranteed document detection for every background/lighting condition.
- Password-protected PDFs.

## 7. Performance
- Detection runs on a downsampled preview (about 360 px live / 520 px after capture or import) to keep mobile CPU use reasonable.
- Corrected pages are capped to a practical long edge; export may reduce resolution to meet size presets.
- Auto-capture detection is throttled.

## 8. Browser target
Current stable Chromium, Safari, and Firefox. The app must attempt `getUserMedia` on startup without excluding `file://`; direct-file camera access is specifically supported for desktop Chrome when the browser grants permission. Other browsers may apply different local-file permission policies. File import and PDF generation must continue to work without camera access.

## 9. Acceptance criteria
- Camera startup is attempted automatically on initial load, including direct `file://` opening, with retry and image-import actions when access fails.
- Turning the camera off releases the stream immediately, hides live-camera controls, and leaves a clear in-preview action to start it again.
- Native zoom is used when available; otherwise digital zoom remains usable and capture/detection uses the same cropped field of view shown in the preview.
- App remains useful when camera is unavailable by offering image import immediately.
- Auto-detected corners can always be manually corrected, and the user can switch between the corrected result and corner-adjustment views. Corner adjustment supports 1–4× zoom, wheel/pinch zoom, and panning far enough to reach every image edge on desktop and smartphone.
- A 3-page workflow can be previewed/re-edited, reordered, and exported as one PDF.
- 1 MB / 2 MB targets reduce JPEG quality/resolution and report whether the final file actually meets the selected limit.
- PDF output opens in common viewers and has one page object per scanned page.
- No external runtime resources or unresolved build placeholders in `dist/index.html`.
- `connect-src 'none'` remains in CSP.
- Japanese and English controls fit at 360 px.
- Smartphone bottom navigation remains clear of safe areas and keeps toast/status messages above it.
- Output filename can be edited before PDF generation and the generated/downloaded/shared filename matches the normalized input.
