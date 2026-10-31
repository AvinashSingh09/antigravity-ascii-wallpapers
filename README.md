# ASCII Wallpapers for Antigravity

Live, animated backgrounds for the [Antigravity](https://antigravity.google) desktop app, drawn entirely in text characters. 23 themes, a one-click picker, and nothing leaves your machine.

**[Watch the demo and see the themes →](https://mix4o445.github.io/antigravity-ascii-wallpapers/)**

![Jellyfish theme with the picker open](assets/picker.jpg)

> Unofficial community mod. Not affiliated with or endorsed by Google. It patches your local copy of the app (with a verified backup), so use it at your own risk.

## Features

- **23 live themes**: 9 light and 14 dark. Cloud Drift, Aurora, Honu Lagoon, Koi Pond, Jellyfish, Paper Boats, Sakura, Fireflies, Moonlit, Ember Dunes, Night Rain, Snowfall, Sky Lanterns, Windy Meadow, Spiral Galaxy, Bamboo Grove, Digital Rain, Morning Tide, Autumn Leaves, Alpine Dawn, Retro Sunset, Lava Lamp and Starry Catnap.
- **Whole-app theming**: the sidebar, menus, composer, title bar and window controls are recolored to match each scene.
- **Three ways to open the picker**: click **Themes** in the top right, press **Ctrl+Alt+W** (or **Cmd+Option+W** on macOS), or type `/theme` in the composer.
- **Controls**: Pause freezes the animation, Adjust sets intensity, and Off restores the stock look instantly.
- **Stays out of the way**: the background sits behind your text and the composer stays fully interactive. Rendering pauses while the window is hidden, and reduced-motion settings are respected.
- **Private**: no network requests. Your pick is saved locally in `%APPDATA%\Antigravity\ascii-wallpapers-preferences.json` on Windows or `~/Library/Application Support/Antigravity/ascii-wallpapers-preferences.json` on macOS.

| | | |
|---|---|---|
| ![Aurora](assets/aurora.jpg) | ![Ember Dunes](assets/dunes.jpg) | ![Koi Pond](assets/koi.jpg) |
| ![Sakura](assets/sakura.jpg) | ![Night Rain](assets/rain.jpg) | ![Retro Sunset](assets/retro.jpg) |

## Requirements

- macOS or Windows, with the standalone Antigravity app **version 2.28.2** installed in the default location:
  - **macOS**: `/Applications/Antigravity.app` (or `~/Applications/Antigravity.app`)
  - **Windows**: `%LOCALAPPDATA%\Programs\antigravity`
- [Node.js](https://nodejs.org) 18 or newer.

The installer only patches the exact 2.28.2 build it was written against. It checks the app archive's SHA-256 and refuses to touch anything else.

## Install

1. Download this repository (**Code → Download ZIP**) and extract it.
2. Close Antigravity completely.
3. Open Terminal (macOS) or PowerShell (Windows) in the extracted folder and run:

   **macOS:**
   ```bash
   node manage-wallpapers.cjs install
   ```
   *(If your `/Applications` folder requires admin privileges, use `sudo node manage-wallpapers.cjs install`)*

   **Windows:**
   ```powershell
   node .\manage-wallpapers.cjs install
   ```

   *(Optional)* If Antigravity is installed in a non-standard location, pass the path directly:
   ```bash
   node manage-wallpapers.cjs install /path/to/Antigravity.app
   ```

4. Reopen Antigravity and click **Themes** in the top right.

To check that the archive rebuild works on your machine without changing anything, run `node manage-wallpapers.cjs verify` first.

## Uninstall

Close Antigravity, then run:

**macOS:**
```bash
node manage-wallpapers.cjs restore
```

**Windows:**
```powershell
node .\manage-wallpapers.cjs restore
```

The original archive is kept next to the app as `app.asar.ascii-wallpapers.backup`. Restore checks hashes first and refuses to overwrite a newer app version.

## How it works

The installer appends the wallpaper scripts to Antigravity's `dist/preload.js` and `dist/main.js` inside `app.asar`, rebuilds the archive, and updates every integrity hash. It then re-verifies every packed file before replacing the archive. It runs through the app's existing isolated preload: Node integration and context isolation stay as shipped.

App updates replace the archive, which removes the mod. A new app build needs its own inspection before this installer will support it.

| File | Purpose |
|---|---|
| `wallpaper-scenes.js` | The 23 scene renderers |
| `ascii-wallpapers.js` | Theme definitions, picker UI and app recoloring |
| `wallpapers-main.js` | Saves your preferences in the main process |
| `manage-wallpapers.cjs` | Install, verify and restore |

## License

MIT. See [LICENSE](LICENSE).
