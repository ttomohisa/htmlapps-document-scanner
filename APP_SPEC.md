# APP_SPEC.md

## 1. Product identity
- **Name:** Submission PDF Scanner / 提出PDFスキャナー
- **Purpose:** Turn paper documents into submission-ready PDFs from a phone browser without uploading source images.
- **Primary users:** People submitting forms to government, school, insurance, workplaces, and other web portals.
- **Release:** `dist/index.html` and `dist/index.self-extract.html`

## 2. Core outcome
A user can photograph or import several paper pages, automatically detect the document, fine-tune four corners, correct perspective, enhance readability, reorder pages, and generate/share one PDF that satisfies common submission constraints.

## 3. Core flow
1. Open the app and grant camera permission, or import existing images.
2. Capture a page. The app estimates document corners locally.
3. Review auto-correction; drag corners when needed.
4. Choose Auto / Color / Grayscale / B&W and add the page.
5. Repeat. Pages appear as draggable cards (3 columns on narrow phones).
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
- Local document-corner estimation with graceful fallback to an inset rectangle.
- Four-corner touch editor with accessible reset and full-image actions.
- Perspective correction using WebGL, with a Canvas 2D fallback.
- Filters: Auto (paper normalization), Color, Grayscale, B&W.
- Rotation and delete from page cards; delete offers Undo.
- Pointer/touch reorder with visible insertion movement and auto-scroll near viewport edges.
- Three page columns on narrow smartphones.
- Smartphone camera UX follows the Browser Kitty QR Reader pattern: near-full-screen live preview, safe-area-aware top controls, a discreet camera power control, status overlay, translucent bottom camera dock, inline zoom, pinch/swipe zoom gestures, and fixed bottom navigation (Scan / Pages / PDF).
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
- Detection runs on a downsampled preview (max ~420 px) to keep mobile CPU use reasonable.
- Corrected pages are capped to a practical long edge; export may reduce resolution to meet size presets.
- Auto-capture detection is throttled.

## 8. Browser target
Current stable Chromium, Safari, and Firefox. The app must attempt `getUserMedia` on startup without excluding `file://`; direct-file camera access is specifically supported for desktop Chrome when the browser grants permission. Other browsers may apply different local-file permission policies. File import and PDF generation must continue to work without camera access.

## 9. Acceptance criteria
- Camera startup is attempted automatically on initial load, including direct `file://` opening, with retry and image-import actions when access fails.
- Turning the camera off releases the stream immediately, hides live-camera controls, and leaves a clear in-preview action to start it again.
- Native zoom is used when available; otherwise digital zoom remains usable and capture/detection uses the same cropped field of view shown in the preview.
- App remains useful when camera is unavailable by offering image import immediately.
- Auto-detected corners can always be manually corrected.
- A 3-page workflow can be reordered and exported as one PDF.
- 1 MB / 2 MB targets reduce JPEG quality/resolution and report whether the final file actually meets the selected limit.
- PDF output opens in common viewers and has one page object per scanned page.
- No external runtime resources or unresolved build placeholders in `dist/index.html`.
- `connect-src 'none'` remains in CSP.
- Japanese and English controls fit at 360 px.
- Smartphone bottom navigation remains clear of safe areas and keeps toast/status messages above it.
- Output filename can be edited before PDF generation and the generated/downloaded/shared filename matches the normalized input.
