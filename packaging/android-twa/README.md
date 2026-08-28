# Play Store packaging (Trusted Web Activity)

A TWA is Chrome rendering the deployed site full-screen, with no browser chrome and a Play Store listing. There is **no application code here**: the app that ships is whatever `packages/client` is currently deployed at your domain, so content changes reach users on deploy without a store review.

Because it runs in real Chrome rather than an embedded webview, Google sign-in needs no special handling — the `disallowed_useragent` restriction that breaks OAuth inside webview wrappers does not apply.

## What you need first

- The app deployed over **HTTPS at a domain you control** (a `*.workers.dev` subdomain works for testing, but a custom domain is better for a listing).
- A Play Console account (one-off $25 registration fee).
- Node and a JDK for [Bubblewrap](https://github.com/GoogleChromeLabs/bubblewrap).

## Steps

1. **Fill in your domain and package id.** Edit `twa-manifest.json` and replace every `planner.example.com` with your host, and `com.example.mindmeld` with your own reverse-DNS package id. The package id is permanent once published — it cannot be changed later.
2. **Generate and build.**

   ```bash
   npm install -g @bubblewrap/cli
   cd packaging/android-twa
   bubblewrap init --manifest https://YOUR-DOMAIN/manifest.webmanifest
   bubblewrap build
   ```

   The first build creates `android.keystore`. **Back it up somewhere safe and never commit it** — losing it means you can never update the listing.

3. **Publish the asset links.** Print the signing fingerprint:

   ```bash
   keytool -list -v -keystore android.keystore -alias android
   ```

   Set the `SHA256` fingerprint and your package id on the Worker, which serves `/.well-known/assetlinks.json` from them:

   ```bash
   cd ../../packages/worker
   npx wrangler deploy --var ANDROID_PACKAGE:com.example.mindmeld \
                       --var ANDROID_FINGERPRINTS:AA:BB:CC:...
   ```

   Or set both in `wrangler.toml` under `[vars]` and deploy normally. Verify:

   ```bash
   curl https://YOUR-DOMAIN/.well-known/assetlinks.json
   ```

   Without a matching asset-links file the app still runs, but Chrome shows a URL bar at the top — that file is what earns the chrome-less window.

4. **Upload** the `app-release-bundle.aab` from `bubblewrap build` to the Play Console, and complete the store listing and data-safety form.

## Updating

- **Content or UI changes**: deploy the Worker. Users get them on next launch; no store submission.
- **Icon, name, target SDK, or Android API changes**: rebuild with Bubblewrap and upload a new bundle, bumping `appVersionCode`.

## If you later want native features

Push notifications, biometrics, or a genuinely offline-first app that works before ever reaching the server need a real native shell — Capacitor is the usual next step, and it consumes the same `packages/client` build. Note that Google sign-in *would* then need the native plugin path, because a Capacitor webview is exactly the embedded-webview case Google blocks.
