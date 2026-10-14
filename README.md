# Honk Orchestra XR

Honk Orchestra (previously FaceOrchestra) is a browser-based WebXR instrument for building music in space. Place expressive horn faces (“Honks”), arrange them into chords, record performances with Loopers, drive the room from one Metronome, and play percussion with a handheld Stick.

This page covers setup. Use the topic guides below for controls, musical work and development.

For fixed-phone video compositing, follow [Capture, replay and export](docs/mixed-reality-capture.md).

## What you need

- A Quest-style headset and controllers for the full experience. The controller map is designed around Meta Quest button names and handedness.
- A WebXR browser with WebGL and Web Audio. Passthrough AR is preferred when available; immersive VR is the fallback.
- A development computer on the same network as the headset.
- Python 3 for the included web servers.
- Node.js 22 or newer for dependency setup, the capture receiver and automated checks.
- Internet access during dependency setup only. Three.js, its addons and the note-label font are served locally afterward.

Run `npm ci` once. The browser import map pins local Three.js `0.164.1`; postinstall prepares the vendor files.

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

The main menu contains **Play**, **Tutorials**, and **Record Songs**. Play restores the saved workspace. Tutorials starts with Basics, followed by Raag Jog, Kuch To Hua Hai, Rishte Naate, Tu Kisi Rail Si, and Nazariya Ki Maari. Record Songs uses the same compositions and musical definitions.

## Documentation

- [Controls and behavior](docs/controls.md).
- [Basics, tutorials and guided play](docs/tutorial.md).
- [Composition authoring and MIDI import](docs/midi-import.md).
- [Current compositions and provenance](docs/compositions.md).
- [Architecture and ownership](docs/architecture.md).
- [Capture, replay and export](docs/mixed-reality-capture.md).
- [Automated validation](docs/validation.md) and [headset checks](docs/manual-xr-regression.md).

Run `npm run verify` for source checks and unit tests. Run `npm run test:compositions:browser -- --full` for isolated browser checks with temporary recording storage. No dependency upgrades or performance optimization are part of this cleanup.

## Troubleshooting

- **No Enter AR/VR button:** use a WebXR-capable browser. Desktop browsers without `navigator.xr` can only show the fallback scene.
- **Headset refuses XR over the LAN:** use `https://`, confirm the headset trusts the certificate authority, and open port `8443` on the computer firewall.
- **Blank model or missing note labels:** check the console for failed local GLB, texture, vendor module, or font requests.
- **No sound:** interact once to allow the browser to start Web Audio, raise the relevant Honk/Looper/Metronome volume, and confirm the headset is not muted.
- **A opens no menu:** release Grip, finish or cancel any active placement, and remember the menu is bound to the right-hand primary button. Pull toward the headset while holding A to enter the item ring.
- **A preview will not place:** use Trigger; Grip cancels it. The right thumbstick changes preview scale.
- **Cannot transform an object:** aim at its body transform target and hold Grip. If no target is selected, Grip intentionally equips the Stick.
- **Looper starts later than expected:** a clocked Play waits for the next beat. A clocked Record waits for the first musical onset. Completed automatic takes retain all selected beats; manual Stop before the endpoint trims idle waiting.
- **Looper is disconnected:** it uses the stable internal 70 BPM grid. Reconnect its Metronome cable to follow the lesson’s 80 BPM clock.
- **Saved scene did not update:** allow the debounced checkpoint to finish and check the storage feedback. Inspect IndexedDB `honk-orchestra-workspaces`; quota, unsupported data, or partial recovery can pause writes. The legacy localStorage key is retained as a recovery source.
- **Metronome appearance changes after Right B:** that is a regression. Its map identity should remain authored through repeated lock/unlock; follow the Metronome section of the XR checklist.
