# Tauri bundle icons

Tauri requires these files for `tauri build`. Until brand assets land in Phase 5 (TASK-5.1), generate placeholders:

```sh
# From the repo root, with magick / imagemagick installed:
magick -size 1024x1024 xc:'#0E0D0C' \
  -fill '#F2C75C' -font 'JetBrains-Mono-Bold' -pointsize 480 \
  -gravity center -annotate +0+0 'Na' \
  packages/desktop/src-tauri/icons/icon.png

# Then convert to all the formats Tauri wants:
bun x @tauri-apps/cli icon packages/desktop/src-tauri/icons/icon.png \
  -o packages/desktop/src-tauri/icons
```

Final brand-aligned set (Sodium tile in Basalt gold on basalt-black, periodic-table styling per PRD §2.5) lands in TASK-5.1 alongside the marketing-site visual lock-in.
