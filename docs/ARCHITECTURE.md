# Architecture

The app keeps editable source in `src/index.template.html` and generates two single-file release artifacts under `dist/`.

## Runtime structure

All runtime code is embedded in one HTML file. The main responsibilities are:

- camera controller with explicit start/stop, camera switching, torch, native zoom, and digital-zoom fallback
- throttled live document detection and optional stable auto-capture
- document-corner detector that scores edge strength, paper/background contrast, line consistency, coverage, and quadrilateral geometry
- page editor with corrected-result preview, manual four-corner correction, 1–4× zoom, wheel/pinch zoom, and pan
- WebGL perspective warper with a Canvas 2D fallback
- readability filters: No enhancement, Auto, Color, Grayscale, and B&W
- in-memory page store with compressed editable source, thumbnail preview, re-edit, rotate, reorder, delete, and Undo
- smartphone page-like navigation between Scan / Pages / PDF
- JPEG compressor and dependency-free PDF 1.4 writer

No third-party runtime package is required. Image processing uses browser-native Canvas 2D and WebGL APIs. PDF pages embed JPEG streams using `/DCTDecode`; a small PDF object/xref writer assembles the document entirely in memory.

## Page editing model

When a page is first captured or imported, the original working image is kept only long enough to create the corrected page and a compressed editable source. The page list stores:

- corrected page canvas used for preview/export
- selected readability mode and rotation
- thumbnail
- compressed editable source plus the current four corner coordinates

This allows the Preview action to reopen a page and change readability or corner correction without retaining a second full-resolution source canvas for every page.

## Output sizing

The 1 MB / 2 MB presets budget bytes per page and reduce JPEG quality first, then raster dimensions. The generated PDF is measured after creation; if necessary, a tighter pass is attempted. The final readiness panel reports actual output size and whether the selected target was met.

## Privacy boundary

Runtime network access is blocked by CSP with `connect-src 'none'`. Camera frames, imported images, editable page sources, corrected pages, and generated PDFs stay in the browser unless the user explicitly saves or shares the result.
