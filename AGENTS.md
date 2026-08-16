# AGENTS.md — Single HTML App Contract

Read `APP_SPEC.md` and `docs/ARCHITECTURE.md` before editing.

## Non-negotiable constraints
- Release two one-file variants: `dist/index.html` and `dist/index.self-extract.html`.
- No runtime CDN, external font, analytics, telemetry, API request, or hidden network dependency.
- Selected images and generated PDFs stay in the browser unless the user explicitly exports/shares them.
- Keep `connect-src 'none'` in CSP.
- Desktop and smartphone are both first-class; smartphone camera UX is the priority.
- Japanese and English live in the same HTML.
- Use inline SVG rather than generic emoji for primary UI icons.
- Edit `src/index.template.html`; regenerate `dist/` instead of hand-editing generated files.
- Keep a compact language switcher and help button in the upper-right header.
- Destructive actions use the app confirmation dialog and delete supports Undo when practical.

## Verification
Run `scripts/check-repository.ps1` on Windows PowerShell before release. Test camera capture on HTTPS, file import on `file://`, page reorder, corner editing, PDF export, target-size presets, Japanese/English, and narrow smartphone layouts.
