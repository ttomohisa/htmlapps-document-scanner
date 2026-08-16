# Changelog

## Unreleased
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

## 1.0 - 2026-08-16
- Initial Submission PDF Scanner implementation.
- Camera/image import, local corner detection, four-corner editing, perspective correction, and document filters.
- Multi-page cards with smartphone-first reordering, rotation, deletion, and Undo.
- Submission presets for A4, monochrome, 1 MB, and 2 MB outputs.
- Dependency-free in-browser PDF generation, download/share, and submission checks.
- Bilingual Japanese/English UI and offline/self-contained release variants.
