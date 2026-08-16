# Offline verification

1. Build the repository on Windows with `build-standalone.ps1`.
2. Disconnect the network.
3. Open `dist/index.html` directly.
4. Import existing JPG/PNG images, adjust corners, reorder pages, and generate a PDF.
5. Repeat with `dist/index.self-extract.html`.
6. In desktop Chrome, open `dist/index.html` via `file://` and verify that the permission prompt/live preview appears without a server; test Retry after denying once.
7. Turn the camera off and confirm the browser camera indicator disappears, then turn it on again from both the preview power control and the in-preview start action.
8. Verify zoom on a camera with native zoom when available, and on a camera without native zoom confirm the digital fallback reaches 4× and the captured image matches the preview crop.
9. On HTTPS (for example GitHub Pages), verify camera capture again.
10. Repeat the camera check on target mobile browsers because local-file permission behavior is browser-dependent.
