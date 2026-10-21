# App icon

`app-icon.png` is the existing transparent Dhamantaha receipt/shield logo symbol. The original artwork is preserved here without modification.

The Android launcher resources in `android/app/src/main/res/` use the symbol on white:

- `mipmap-{mdpi,hdpi,xhdpi,xxhdpi,xxxhdpi}/ic_launcher.png` and `ic_launcher_round.png` cover older launchers.
- `ic_launcher_foreground.png` centers the trimmed symbol inside a 60 dp square on a transparent 108 dp layer, leaving padding for adaptive launcher masks.
- `ic_launcher_monochrome.png` preserves the symbol's alpha silhouette for themed icons on Android 13+.
- `mipmap-anydpi-v26/` uses the foreground and white background. `mipmap-anydpi-v33/` additionally supplies the monochrome layer.

The launcher icon is bundled in the APK and does not depend on a network request or the web frontend's assets.
