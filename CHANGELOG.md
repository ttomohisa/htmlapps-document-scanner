# Changelog

## 1.0.1 - 2026-08-31
- Fixed page reordering so dragged cards no longer fight the browser's native image drag or lose their drop target; drag motion now follows the pointer without the card transition delay, and the mobile drag handle supports reliable cross-row reordering.
- Fixed camera capture so the document corners currently shown in the live recognition guide are carried into the captured page instead of being detected again independently at full resolution.
- Prevented the editor action button from covering readability controls on short desktop viewports; the side panel scrolls naturally instead.
- Fixed four-corner editor panning so zoomed images stay centered in the viewport and every edge, including the far-right area, can be reached for precise adjustment on desktop and smartphone.
- Added zoom, mouse-wheel/pinch zoom, and panning while adjusting the four page corners.
- Reworked Auto readability correction to be more conservative, interpolate illumination smoothly, preserve color, and avoid tiled overexposure artifacts.
- Moved Detect again / Full image into a separate correction-area panel shown only in four-corner adjustment mode.
- Changed the privacy badge wording to Fully local processing / 完全ローカル処理.
- Reworked document-edge detection to score edge strength, paper/background contrast, line consistency, coverage, and quadrilateral geometry before accepting the four corners.
- Added a true corrected-result preview and a switchable four-corner adjustment view after capture/import.
- Added a No enhancement / 無変換 readability mode and made the Color mode apply a light readability-oriented color correction instead of duplicating the raw result.
- Added a Preview action to every page card; saved pages can now reopen the editor to change the readability mode or adjust corners again.
- Stored a compressed source image for each working page so post-add correction remains possible without keeping a second full-resolution canvas in memory.
- Changed smartphone Scan / Pages / PDF navigation from scroll-to-section behavior to page-like tab switching.
- Added a camera power control for both smartphone and desktop layouts; turning the camera off releases the active MediaStream and collapses live-camera controls into a clean off state.
- Redesigned the desktop camera into a larger app-like preview with a glass control dock, compact top status/power controls, and inline zoom.
- Made zoom available on every camera: native track zoom is used when supported, with a centered digital-zoom fallback up to 4×; preview detection and captured output follow the same zoomed field of view.
- Added pinch and vertical-swipe zoom gestures on touch camera surfaces while keeping the compact slider for precise adjustment.
- Fixed desktop Chrome direct-file camera startup by removing the `file://` exclusion and attempting `getUserMedia` on boot, matching the QR Reader behavior.
- Reworked the smartphone camera surface around the QR Reader UX: near-full-screen preview, top overlay controls, camera status, translucent control dock, inline zoom, and clearer capture/import/switch actions.
- Added camera-specific failure states with retry and image-import recovery for permission denial, busy devices, missing cameras, and unavailable media APIs.
- Made the output PDF filename a prominent editable setting and automatically append `.pdf` when omitted.
- Redesigned smartphone layout with a full-width capture surface, app-style grouped settings, a camera-start action in the preview, and fixed Scan / Pages / PDF bottom navigation.
- Moved mobile status/toast UI above the bottom navigation and added page-count feedback to the mobile Pages tab.

## 1.0.0 - 2026-08-16
- Initial Submission PDF Scanner implementation.
- Camera/image import, local corner detection, four-corner editing, perspective correction, and document filters.
- Multi-page cards with smartphone-first reordering, rotation, deletion, and Undo.
- Submission presets for A4, monochrome, 1 MB, and 2 MB outputs.
- Dependency-free in-browser PDF generation, download/share, and submission checks.
- Bilingual Japanese/English UI and offline/self-contained release variants.
