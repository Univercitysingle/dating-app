# Hart2Hart PWA platform support

**Delivery model:** One responsive web application, hosted on Cloudflare Pages and backed by the existing Cloudflare Worker APIs. No separate mobile codebase is required for the PWA.

## Platform targets

| Platform | Browser target | Install experience | Important limitations |
|---|---|---|---|
| Android phones/tablets | Current Chrome and Chromium browsers | Browser install prompt or browser menu | Background work and incoming calls remain OS-controlled |
| iPhone/iPad | Current iOS/iPadOS Safari; other browsers where supported by the OS | Share menu, then Add to Home Screen | No universal browser install prompt; background execution and call integration are restricted |
| Windows | Current Edge and Chrome | Browser install action | Push depends on browser and OS notification settings |
| macOS | Current Safari, Chrome and Edge | Browser-specific Add to Dock/install action | Feature availability differs by browser version |
| Linux | Current Chrome/Chromium and Firefox | Browser-specific install or shortcut experience | Firefox does not provide the same install and push behaviour as Chromium |
| Other browsers/embedded webviews | Progressive enhancement | Use the website normally | Installation, push, camera and microphone support are not guaranteed |

The application must remain fully usable as a website when PWA installation or service workers are unavailable.

## Implemented PWA behaviour

- Web app manifest with stable app identity, standalone display preference, theme and scalable icon.
- Production-only service-worker registration, update checks and a user-visible update action.
- Safe cache policy for versioned static assets and the offline fallback only.
- Navigation requests fall back to a static offline explanation when the network is unavailable.
- API responses, authenticated HTML, chat content, profile data, payment responses and other user-specific data are never cached by the service worker.
- Browser installation prompt when the browser exposes the beforeinstallprompt event, with a seven-day dismissal cooldown.
- Manifest shortcuts to Discover, Conversations and Likes where the operating system surfaces app shortcuts.
- iOS-family installation guidance for Add to Home Screen.
- Online/offline state feedback.
- Push notification display and same-origin notification navigation retained in the service worker.
- Safe-area metadata and responsive install/status surfaces.

## Browser capability boundaries

A PWA cannot guarantee identical functionality on every operating system or browser. The following are browser/OS controlled:

- Background execution and task scheduling.
- Push notification permission prompts, delivery timing and lock-screen presentation.
- Incoming audio/video call presentation while the application is closed or suspended.
- Native call UI, Bluetooth routing and call handoff.
- Camera/microphone permission persistence.
- App installation UI and icon treatment.
- File handling, contacts, Bluetooth and other native device integrations.

Live audio/video calls require a foreground, secure-context browser session with granted media permissions. TURN connectivity must be validated on real carrier and Wi-Fi networks. Push notifications are best-effort and must never be treated as a guaranteed incoming-call transport.

## Release acceptance matrix

Run on physical devices, not only browser emulators:

- Android: current Chrome on at least one Pixel-class device and one Samsung device.
- iOS/iPadOS: current Safari on one iPhone and one iPad.
- Windows: current Edge and Chrome.
- macOS: current Safari and Chrome.
- Linux: current Chrome/Chromium and Firefox.

For each supported browser/device combination verify:

1. Website loads, login and account session work, and protected routes remain protected.
2. Install or Add to Home Screen creates the correct name, icon and standalone launch.
3. Portrait/landscape layouts, keyboard, safe areas, navigation and dialogs remain usable.
4. Camera, microphone, image picker and media upload work after explicit permission.
5. Messaging, notifications, audio/video calls and reconnect work where the browser supports them.
6. Service-worker first install, update prompt, activation and rollback/recovery work.
7. Offline navigation shows the offline fallback; reconnect returns to the application.
8. No authenticated API, chat, profile, payment or other private response is served from the service-worker cache.
9. Logout, account switching and account deletion do not expose cached private data.
10. Screen reader, keyboard navigation, reduced motion and zoom are usable.

## Operational release gates

- Confirm the deployed manifest and service worker are served from the application origin.
- Confirm /sw.js is not cached by the CDN/browser and can update promptly.
- Confirm icon dimensions and Apple touch icon artwork are reviewed on physical devices.
- Verify push subscription storage, VAPID configuration, delivery retries and logout/account deletion cleanup independently. A service worker alone does not implement the server-side push lifecycle.
- Record device/browser/OS versions and test evidence before declaring universal support.
- Do not claim full support for every OS/browser. Publish a tested compatibility matrix and gracefully degrade unsupported capabilities.
