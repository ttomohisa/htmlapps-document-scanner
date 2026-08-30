# Offline verification

1. Build the repository on Windows with `build-standalone.ps1`.
2. Disconnect the network.
3. Open `dist/index.html` directly.
4. Import existing JPG/PNG images and verify that each page opens in the correction dialog.
5. Check both **Result / 仕上がり** and **Adjust corners / 四隅補正** views.
6. In four-corner mode, zoom from 1× to 4×, pan to every image edge, and confirm all four handles remain reachable. Repeat on desktop and smartphone.
7. Switch among No enhancement / Auto / Color / Grayscale / B&W and confirm the actual corrected preview changes.
8. Add multiple pages, then use Preview to reopen a saved page and change its filter/corners.
9. Reorder, rotate, delete, and Undo a page.
10. On smartphone, confirm Scan / Pages / PDF switch as separate views without horizontal scrolling or overlap with the bottom navigation.
11. Enter a custom output filename and confirm `.pdf` is appended when omitted.
12. Generate a PDF with Standard, A4, B&W, 1 MB, and 2 MB settings as applicable; verify the reported file size and open the saved PDF in a common viewer.
13. Repeat the import/edit/export flow with `dist/index.self-extract.html`.
14. In desktop Chrome, open `dist/index.html` via `file://` and verify that the permission prompt/live preview appears without a server; test Retry after denying once.
15. Turn the camera off and confirm the browser camera indicator disappears, then turn it on again from both the preview power control and the in-preview start action.
16. Verify zoom on a camera with native zoom when available, and on a camera without native zoom confirm the digital fallback reaches 4× and the captured image matches the preview crop.
17. On HTTPS (for example GitHub Pages), verify camera capture again.
18. Repeat the camera check on target mobile browsers because local-file permission behavior is browser-dependent.
19. Confirm Japanese and English UI, `assets/screenshot.png`, `assets/screenshot-en.png`, and `assets/favicon.svg` match the release UI.
20. Inspect the built HTML and confirm `connect-src 'none'`, no unresolved build placeholders, and no external runtime script/style/font references.
