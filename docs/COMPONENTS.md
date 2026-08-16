# Components

`components/confirm-dialog.html` documents the reusable destructive-confirmation structure used by this app. The runtime copy is embedded directly in `src/index.template.html` so the release remains one HTML file.

The confirmation UI supports Cancel, Escape, backdrop cancellation, focusable buttons, and a smartphone bottom-sheet layout. Page deletion additionally exposes Undo through the toast UI.
