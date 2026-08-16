# Architecture

The app keeps editable source in `src/index.template.html` and generates two single-file release artifacts under `dist/`.

Runtime modules are kept inside one HTML: camera controller, document detector, corner editor, WebGL/Canvas perspective warper, filter pipeline, page store/reorder controller, JPEG compressor, and a small dependency-free PDF writer.

No third-party runtime package is required. Image processing uses Canvas 2D and WebGL when available. PDF pages embed JPEG streams using `/DCTDecode`; a minimal PDF 1.4 object/xref writer assembles the document entirely in memory.

The 1 MB / 2 MB presets budget bytes per page and reduce JPEG quality first, then raster dimensions. A final readiness panel reports actual output size and whether the selected target was met.
