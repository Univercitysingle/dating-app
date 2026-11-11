# Accessibility, browser compatibility and localization standard

**Status:** Acceptance standard. No accessibility certification or complete browser matrix is implied.
**Scope:** React web client, installable PWA behaviour where supported, notification permission flows, forms, discovery, chat, calls, profile, settings and administration.

## Accessibility

Target WCAG 2.2 AA as the engineering baseline, subject to formal review. Test:
- Full keyboard operation, visible focus and logical focus order.
- Semantic headings, landmarks, labels, buttons and link names.
- Screen-reader announcements for validation, loading, unread counts, match events and call state.
- Text and control contrast, zoom/reflow and reduced-motion preferences.
- Form errors associated with fields and announced without relying on colour alone.
- Dialog focus trapping, escape behaviour and focus restoration.
- Accessible alternatives for image-only controls and meaningful profile media.
- Avoiding flashing, forced motion and inaccessible drag-only interactions.

## Browser and device matrix

Maintain a versioned matrix for current supported Chrome, Edge, Firefox and Safari on desktop and mobile, plus iOS Safari and Android Chrome. Include:
- Authentication and session renewal.
- Profile/photo upload and CDN media display.
- Discover filters and pagination.
- Messaging, unread/read state and reconnect.
- Push permission, service-worker registration and updates.
- WebRTC microphone/camera permissions, TURN relay and network changes.
- Theme appearance, responsive layouts and settings persistence.
- Payment redirect/return and callback-driven status refresh.
- PWA installability and offline fallback, only where intentionally supported.

A browser feature being present in source is not evidence that it works on every browser/device.

## Localization and time

- Store timestamps in UTC and render in the user's selected or browser locale/timezone.
- Use locale-aware date, number and currency formatting.
- Never infer timezone from a profile location alone.
- Keep UI strings externalized from components before adding another language.
- Test long translated strings, plural forms, text expansion and mixed-script input.
- Plan RTL layout, reading order, icons, alignment, forms and navigation separately. Do not claim RTL support until end-to-end reviewed.
- Keep legal and transactional copy reviewed by qualified language/legal reviewers.

## Acceptance evidence

For every release, record browser/OS versions, device class, test account role, test date, test result, known exception and issue reference. Run automated accessibility checks, but supplement them with keyboard-only and screen-reader testing. Record unresolved critical accessibility defects as release blockers.
