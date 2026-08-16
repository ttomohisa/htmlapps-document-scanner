# Security and privacy

This app is designed for local processing. Runtime CSP blocks network connections with `connect-src 'none'`. Camera frames, selected images, corrected pages, and generated PDFs are not transmitted by application code.

Camera permission is requested only for scanning. The active stream is stopped immediately when the user turns the camera off and when the page unloads. Working pages are held in memory and disappear on reload/close.

Users should still review browser extensions, OS sharing targets, and destination upload sites separately; they are outside this app's trust boundary.
