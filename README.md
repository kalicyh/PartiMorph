# Parti Morph

`parti-morph` is a React package for DOM-captured particle page transitions. It captures a source element with `html2canvas`, maps the captured pixels into a Three.js particle field, and morphs those particles toward one or more target elements on the next page.

## Install

```bash
npm install parti-morph
```

Peer dependencies:

```bash
npm install react react-dom
```

## Basic Usage

Define the DOM elements that Parti Morph should capture. Selectors are owned by your app, not the package.

```tsx
import {
  PageParticleMorph,
  capturePageParticleSnapshot,
  usePageParticleTransition,
  type PageParticleTransitionConfig,
} from 'parti-morph'

const particleConfig = {
  pageRoot: '#root',
  source: {
    element: '[data-parti-source]',
    mode: 'solid',
  },
  targets: [
    {
      element: '[data-parti-dashboard]',
      mode: 'solid',
    },
    {
      element: '[data-parti-nav]',
      mode: 'difference',
    },
  ],
} satisfies PageParticleTransitionConfig
```

Capture the source before switching pages:

```tsx
const [isDashboard, setIsDashboard] = useState(false)
const transition = usePageParticleTransition({
  active: isDashboard,
  particlesEnabled: true,
  setActive: setIsDashboard,
})

async function enterDashboard() {
  const snapshot = await capturePageParticleSnapshot(particleConfig)
  transition.handleEnter(snapshot)
}
```

Render the overlay while the transition is active:

```tsx
{isDashboard && transition.pagePhase === 'entered' ? (
  <PageParticleMorph
    config={particleConfig}
    phase="enter"
    snapshot={transition.pageParticleSnapshot}
  />
) : null}

{transition.leaveMorphVisible ? (
  <PageParticleMorph
    config={particleConfig}
    holdMs={transition.leaveMorphHoldMs}
    phase="leave"
    snapshot={transition.pageParticleSnapshot}
  />
) : null}
```

## API

### `PageParticleTransitionConfig`

```ts
type PageParticleTransitionConfig = {
  overlayIgnoreClassName?: string
  pageRoot?: HTMLElement | string | (() => HTMLElement | null)
  source: {
    element: HTMLElement | string | (() => HTMLElement | null)
    mode?: 'solid' | 'difference'
  }
  sourceFallbackRect?: RectSpec | ((viewport: { height: number; width: number }) => RectSpec)
  targets?: Array<{
    element: HTMLElement | string | (() => HTMLElement | null)
    mode?: 'solid' | 'difference'
  }>
}
```

- `source` is the element captured before the route/page changes.
- `targets` are captured after the destination page is mounted.
- `mode: 'solid'` keeps visible pixels from the captured element.
- `mode: 'difference'` ignores pixels close to the element/page background, useful for headers or transparent panels.
- `pageRoot` helps Parti Morph infer the page background color.
- `sourceFallbackRect` is used if the source element is unavailable during a leave transition.
- `overlayIgnoreClassName` defaults to `parti-morph-overlay`.

### `capturePageParticleSnapshot(config)`

Captures `config.source` and returns a `PageParticleSnapshot | null`.

### `captureTargetParticleSnapshots(config)`

Captures `config.targets` and returns `PageParticleCapture[]`.

### `PageParticleMorph`

```tsx
<PageParticleMorph
  config={particleConfig}
  phase="enter" // or "leave"
  snapshot={snapshot}
  holdMs={340}
/>
```

### `usePageParticleTransition`

A small state helper for active/inactive page transitions:

```ts
const transition = usePageParticleTransition({
  active,
  particlesEnabled: true,
  setActive,
  persistActiveStateKey: 'optional.localStorage.key',
})
```

It returns:

- `pagePhase`: `'idle' | 'entering' | 'leaving' | 'entered'`
- `pageParticleSnapshot`
- `handleEnter(snapshot?)`
- `handleLeave()`
- `leaveMorphVisible`
- `leaveMorphHoldMs`

## Demo

A minimal login-to-dashboard demo lives in `demo/`.

```bash
npm run demo
```

Or run it manually:

```bash
cd demo
npm install
npm run dev
```

Open the printed local URL, sign in, then sign out to see both enter and leave particle morphs.

## Package Structure

- `src/` contains the TypeScript source.
- `dist/` contains the published JavaScript and declaration output.
- `demo/` contains a standalone Vite demo app.
- `npm run build` generates `dist/`.
- `npm publish` runs the build automatically through `prepublishOnly`.
