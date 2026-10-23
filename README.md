# Smoothieficator

A free and open lyrics and chords teleprompter web application. Load songs from chord/lyric sources or enter them manually, then display them in a teleprompter-style view for live performances—on one device or synced across several.

## Requirements

- Any modern web browser (Chrome, Firefox, Edge, Safari, etc.)
- **Static-only use**: any simple web host (or open `index.html` locally)
- **Hosted sync**: PHP-capable hosting (e.g. cPanel) for shared songs and multi-device transport

## Features

- **Streamlined Interface**: Clean, compact design with a unified top bar for all controls
- **Multiple Song Import Methods**:
  - Copy-paste from any chord/lyric site or document
  - Manual song entry
- **Song Management**:
  - Saves songs to browser cache and (when configured) a shared server library
  - Easy browsing through your saved song library
  - Delete unwanted songs with a single click
- **Import/Export**:
  - Export all your saved songs as a JSON file for backup or transfer
  - Import a previously exported JSON file to restore your songs
- **Auto-scrolling Teleprompter**:
  - Adjustable speeds with per-song speed memory
  - Precise chord positioning and formatting
  - Section highlighting (verse, chorus, bridge, etc.)
- **Advanced Display Controls**:
  - Zoom functionality (50%-200%) with per-song zoom memory
  - Fullscreen mode for distraction-free viewing during performances
  - Mid-width font scaling for laptop / tablet landscape viewports
- **Tools menu** (hamburger): Add Song, Import/Export, **Show Chords**, **Release control**
- **Show Chords**: Optional guitar fingering diagrams next to chord names (desktop); on narrow screens (≤768px) diagrams are forced off for density
- **SONG END**: Visible end marker; scroll stops with it in view; click advances to the next song (no auto-advance)
- **In-Song Editing**: Edit song content directly in the teleprompter view
- **Fullscreen Song Browser**: Navigate your entire song library in a dedicated fullscreen view
- **Responsive Design**: Works on multiple devices/screen sizes with touch-optimized mobile interface
- **Shared library (hosted)**: Songs stored via `api/songs.php` and JSON on the server
- **Multi-device sync (hosted)**: Play/pause, speed, scroll position, and selected song synced via `api/transport.php` (polling, cPanel-friendly)
- **Conductor / follower**: Any device can take control; others follow with smooth timeline interpolation; short conductor id shown on the Control row
- **Offline fallback**: If the server is unreachable, the app uses the browser's local cache

## How to Use

1. Open the **Tools** menu (☰) for Add Song, Import/Export, Show Chords, and Release control.
2. Extract songs using one of the following methods:
   - **Copy-Paste**: Use a print-friendly view or plain text from any chord/lyric source for best results
   - **Manual Entry**: Enter song title, artist, and paste or type lyrics with chords
3. Adjust scroll speed and zoom level using the controls in the top bar (settings are remembered per song)
4. Use playback controls to start/stop scrolling or reset to the top
5. Navigate between saved songs using the navigation buttons, keyboard arrows, or click **SONG END →**
6. Use edit mode (E key) to modify songs directly in the teleprompter view
7. Access your full song library with the fullscreen song browser (S key)

For multi-device rehearsal, see [Rehearsal / multi-device sync](#rehearsal--multi-device-sync) below.

## Keyboard Shortcuts

- **Space**: Start/Stop scrolling
- **↑/↓**: Manually scroll up/down (synced when transport is enabled)
- **Home**: Reset scroll to top
- **F**: Toggle fullscreen mode
- **E**: Toggle in-song edit mode
- **Ctrl+Enter**: Save changes (when in edit mode)
- **Esc**: Exit fullscreen, close dropdowns, or cancel edits (when in edit mode)
- **←/→**: Navigate to previous/next saved song
- **+/-**: Increase/decrease scroll speed by one step
- **Q/W**: Decrease/increase zoom level
- **A**: Open add song dropdown
- **S**: Open fullscreen saved songs browser
- **I**: Open import/export dropdown
- **K**: Show keyboard shortcuts

## Installation

### Static-only (no backend)

1. Clone this repository
2. Host the files on any static web server, or open locally
3. Songs are stored only in the browser (`localStorage`)
4. Public demo: https://anttiak.github.io/smoothieficator/

### Hosted sync (PHP + JSON)

1. Deploy the repo to your web root (static files + `api/` + `data/`)
2. Ensure `data/` is writable by PHP (typical permissions: directory `755` or `775`, files `644` or `664` depending on host)
3. `api/songs.php` and `api/transport.php` create/use `data/songs.json` and `data/transport.json`
4. Set API URLs in `index.html` before scripts load:

```html
<script>
  window.SMOOTHIEFICATOR_STORAGE_ENDPOINT = "https://your-domain.example/api/songs.php";
  window.SMOOTHIEFICATOR_TRANSPORT_ENDPOINT = "https://your-domain.example/api/transport.php";
</script>
```

5. `data/songs.json` is not tracked in git; the live library lives on the server. Protect `api/` with your host's access controls (e.g. HTTP auth, IP allowlist).

## Rehearsal / multi-device sync

1. Open the **same hosted URL** on every device (phone, tablet, laptop).
2. Use one shared song library: add songs on one device or import JSON once so all clients load from the server.
3. Each song has a stable `syncId` so the same song is selected on every client when the conductor changes songs.
4. **Control**: Play, pause, speed, seek (keyboard, wheel, or touch), or selecting a song attempts to take control; other clients follow.
5. **Status rows** (top bar):
   - **Songs** — library sync (`Synced` / offline cache / errors)
   - **Scroll** — transport connection health (`Live`, reconnecting, degraded)
   - **Control** — role with short id, e.g. `Conducting · abc12345` or `Following · abc12345`
6. **Release control** (Tools menu): enabled only while you are conductor; frees the lease so another device can take over cleanly (also released on tab close).
7. Sync uses **HTTP polling** (not WebSockets), suitable for shared cPanel hosting.

## OBS now-playing overlay

Use [overlay.html](overlay.html) as an OBS **Browser Source** to show the current synced song as a horizontal scrolling `Title — Artist` ticker.

1. Deploy the site (same host as the teleprompter APIs).
2. In OBS: **Sources → Browser** → URL `https://your-domain.example/overlay.html` (or `https://smoothieficator.nachosavage.com/overlay.html`).
3. Suggested size: width **1920**, height **80–120**.
4. Leave **Shutdown source when not visible** unchecked so polling keeps running when the scene is inactive.
5. The page uses a transparent background; it reads `songId` from transport and resolves title/artist from the shared song library.

Endpoints default to the same `SMOOTHIEFICATOR_*` URLs as the main app (override in `overlay.html` if needed).

## Development smoke check

Chord normalize/lookup (including minor vs major shapes such as `Bm`):

```bash
node scripts/chord-lookup-smoke.js
```

## Privacy Note

Songs are always cached in your browser for faster loading. When remote endpoints are configured, song data and transport state are also stored on **your** server. Access to those APIs should be restricted on the server; this repository does not embed credentials.

## License

This project is licensed under the MIT License. See the LICENSE file for details.

## About

Created for and by musicians who need a simple, effective teleprompter for performances.
