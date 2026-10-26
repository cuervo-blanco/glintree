# Share with an Opera GX user

Send the ZIP produced by `pnpm run package` from the project folder. It contains
the built extension and this guide as `INSTALL-OPERA-GX.md`; the recipient does
not need Node.js or pnpm.

1. Extract the ZIP into a permanent folder, such as `TextReadsFast` in Documents.
2. In desktop Opera GX, open `opera://extensions`.
3. Enable **Developer mode**.
4. Click **Load unpacked** (or **Load unpacked extension**).
5. Select the extracted folder containing `manifest.json`, `content.js`,
   `reader.css`, and `options.html` directly inside it.
6. Open or refresh a YouTube video, enable its captions if needed, and turn on
   the **TRF** switch in the player.

To read an article, right-click a webpage and choose **Read this page with
TextReadsFast**. Selected text has its own reading action. **Read or paste text**
is also available from the extension's settings page.

These are Opera's documented steps for loading an unpacked extension:
[Testing and debugging extensions](https://help.opera.com/en/extensions/testing/).

Keep the extracted folder in place. To update, replace its contents with a newer
build, click **Reload** for the extension, and refresh YouTube. This installation
uses manual updates.

For a first trial, check a captioned video, navigation to another video without a
page refresh, Focus/Reading mode, the appearance sidebar, and any Hindi/Bengali
romanization you use. This build has passed isolated Chromium checks; it has not
yet been tested in Opera GX itself.
