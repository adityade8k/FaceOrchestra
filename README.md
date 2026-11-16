# Honk Orchestra XR

Honk Orchestra (previously FaceOrchestra) is a browser-based WebXR instrument for building music in space. Place expressive horn faces (“Honks”), arrange them into chords, record performances with Loopers, drive the room from one Metronome, and play percussion with a handheld Stick.

This page covers setup. Use the topic guides below for controls, musical work and development.

## What you need

- A Quest-style headset and controllers for the full experience. The controller map is designed around Meta Quest button names and handedness.
- A WebXR browser with WebGL and Web Audio. Passthrough AR is preferred when available; immersive VR is the fallback.
- A development computer on the same network as the headset.
- Python 3 for the included web servers.
- Node.js 22.13+ in the 22.x line, or Node.js 24+ for dependency setup, the capture receiver and automated checks.
- Internet access during dependency setup only. Three.js, its addons and the note-label font are served locally afterward.

Run `npm ci` once. The project pins local Three.js `0.187.0`; postinstall prepares matching core and addon files. The note-label font and its license live in `model/fonts/`.

## Start the app

For a desktop boot and asset check:

```sh
npm ci
npm run dev
```

Open <http://localhost:5173>. The desktop view can confirm that the scene, assets, lighting, saved scene, and resize handling load. Performing and placing instruments require XR controllers.

### Start HTTPS for a headset

WebXR on a headset requires a secure context. The HTTPS server reads two local, Git-ignored files:

```text
certs/localhost.pem
certs/localhost-key.pem
```

Create a certificate trusted by both the computer and headset. For example, with `mkcert`:

```sh
mkdir -p certs
mkcert -install
mkcert -cert-file certs/localhost.pem -key-file certs/localhost-key.pem localhost 127.0.0.1 ::1 YOUR_LAN_IP
npm run dev:https
```

Open `https://YOUR_LAN_IP:8443` in the headset browser. The headset and computer must share a network, the firewall must allow port `8443`, and the headset must trust the certificate authority. Never commit the certificate or private key.

The main menu contains **Play**, **Tutorials**, and **Record Songs**. Play restores your workspace and offers three scales and eight chords in the radial menu. Raag Jog lessons retain their own setup menu. The default Honk release tail is 270 ms.

## Documentation and checks

- [Controls and musical behavior](docs/controls.md): controller mapping, current menu, voicings, tutorials, recording, and saving.
- [Architecture, performance, and testing](docs/architecture.md): component ownership, implemented optimizations, measured scene costs, profiling, and remaining device checks.
- [Manual XR regression](docs/manual-xr-regression.md): headset acceptance checks. Automated checks do not replace these.

```sh
npm run test:music                # focused audio/spawning checks
npm run verify                    # imports, lint, formatting, all unit tests
npm run test:browser               # isolated musical-menu smoke check
npm run test:browser -- --list     # available browser suites
npm run test:browser -- --batch ports radial # shared follow-ups run once
npm run test:browser -- articulation
npm run profile:scene             # isolated 8/32/64/128-Honk desktop benchmark
```

Run `npm run test:compositions:browser -- --full` for the full song/recording checks when those systems change. Browser checks use temporary storage and a temporary Chrome profile. Set `CHROME_BIN` if Chrome is installed at a nonstandard location. Test tiers and remaining coverage gaps are documented in the audit.

Rendering settings are centralized in `src/config/rendering.js`: desktop retains shadows; XR uses full framebuffer scale, requests foveation, and disables shadows. Use the [live profiler](docs/architecture.md#profile-a-real-scene-without-clearing-it) to inspect your current scene without clearing it. The desktop density comparison shows 66.6% fewer main-pass draw calls at 128 Honks; headset frame-rate improvements still need device measurement.

## Troubleshooting

- **No Enter AR/VR button:** use a WebXR-capable browser. Desktop browsers without `navigator.xr` can only show the fallback scene.
- **Headset refuses XR over the LAN:** use `https://`, confirm the headset trusts the certificate authority, and open port `8443` on the computer firewall.
- **Blank model or missing note labels:** check the console for failed local GLB, texture, vendor module, or font requests.
- **No sound:** interact once to allow the browser to start Web Audio, raise the relevant Honk/Looper/Metronome volume, and confirm the headset is not muted.
- **A opens no menu:** release Grip, finish or cancel any active placement, and hold Right A or Left Y on the owning controller. Pull toward the headset while holding that button to enter the item ring.
- **A preview will not place:** use Trigger; Grip cancels it. The owning thumbstick changes preview scale horizontally and distance vertically.
- **Cannot transform an object:** aim at its body transform target and hold Grip. If no target is selected, Grip intentionally equips the Stick.
- **Looper starts later than expected:** a clocked Play waits for the next beat. A clocked Record waits for the first musical onset. Manual length records until Stop and preserves the chosen duration, including rests. The 2/4/8/16-beat settings still stop automatically; stopping those settings early trims idle waiting.
- **Looper is disconnected:** it uses the stable internal 70 BPM grid. Reconnect its Metronome cable to follow the lesson’s 80 BPM clock.
- **Saved scene did not update:** allow the debounced checkpoint to finish and check the storage feedback. Inspect IndexedDB `honk-orchestra-workspaces`; quota, unsupported data, or partial recovery can pause writes. The legacy localStorage key is retained as a recovery source.
- **Metronome appearance changes after Right B:** that is a regression. Its map identity should remain authored through repeated lock/unlock; follow the Metronome section of the XR checklist.
