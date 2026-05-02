import html2canvas from 'html2canvas'

export type PageParticleCaptureMode = 'difference' | 'solid'

export type PageParticleElementResolver =
  | HTMLElement
  | string
  | (() => HTMLElement | null)

export type PageParticleCaptureTarget = {
  element: PageParticleElementResolver
  mode?: PageParticleCaptureMode
}

export type PageParticleTransitionConfig = {
  overlayIgnoreClassName?: string
  pageRoot?: PageParticleElementResolver
  source: PageParticleCaptureTarget
  sourceFallbackRect?: RectSpec | ((viewport: { height: number; width: number }) => RectSpec)
  targets?: PageParticleCaptureTarget[]
}

export type RectSpec = {
  cx: number
  cy: number
  h: number
  radius: number
  w: number
}

export type PageParticleCapture = {
  backgroundRgb: [number, number, number]
  imageData: ImageData
  mode: PageParticleCaptureMode
  rect: RectSpec
}

export type PageParticleSnapshot = PageParticleCapture & {
  targetCaptures?: PageParticleCapture[]
}

const DEFAULT_OVERLAY_IGNORE_CLASS_NAME = 'parti-morph-overlay'

export function resolvePageParticleElement(
  resolver?: PageParticleElementResolver,
): HTMLElement | null {
  if (!resolver) {
    return null
  }

  if (typeof resolver === 'string') {
    return document.querySelector(resolver) as HTMLElement | null
  }

  if (typeof resolver === 'function') {
    return resolver()
  }

  return resolver
}

export function getSourceElement(config: PageParticleTransitionConfig) {
  return resolvePageParticleElement(config.source.element)
}

function parseCssRgb(color: string): [number, number, number] | null {
  const hex = color.trim().match(/^#([0-9a-f]{3}|[0-9a-f]{6})$/i)
  if (hex) {
    const raw = hex[1]
    const normalized = raw.length === 3
      ? raw.split('').map((character) => character + character).join('')
      : raw
    return [
      Number.parseInt(normalized.slice(0, 2), 16),
      Number.parseInt(normalized.slice(2, 4), 16),
      Number.parseInt(normalized.slice(4, 6), 16),
    ]
  }

  const match = color.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/)
  if (!match) {
    return null
  }
  return [Number(match[1]), Number(match[2]), Number(match[3])]
}

function isVisibleCssColor(color: string) {
  return color && color !== 'transparent' && color !== 'rgba(0, 0, 0, 0)'
}

function readPageBackground(config: PageParticleTransitionConfig) {
  const pageRoot = resolvePageParticleElement(config.pageRoot)
  const candidates = [
    window.getComputedStyle(document.documentElement).getPropertyValue('--app-bg').trim(),
    pageRoot ? window.getComputedStyle(pageRoot).backgroundColor : '',
    window.getComputedStyle(document.body).backgroundColor,
    window.getComputedStyle(document.documentElement).backgroundColor,
  ]
  return candidates.find(isVisibleCssColor) ?? '#ffffff'
}

function readCaptureBackground(element: HTMLElement, config: PageParticleTransitionConfig) {
  const styles = window.getComputedStyle(element)
  const candidates = [
    styles.backgroundColor,
    readPageBackground(config),
  ]
  return candidates.find(isVisibleCssColor) ?? '#ffffff'
}

function getElementRadius(element: HTMLElement) {
  const styles = window.getComputedStyle(element)
  return Number.parseFloat(styles.borderTopLeftRadius) || 0
}

export function elementRectToSceneRect(
  rect: DOMRect,
  width: number,
  height: number,
  radius: number,
): RectSpec {
  return {
    cx: rect.left + rect.width / 2 - width / 2,
    cy: height / 2 - (rect.top + rect.height / 2),
    h: rect.height,
    radius,
    w: rect.width,
  }
}

export async function capturePageParticleElement(
  element: HTMLElement,
  mode: PageParticleCapture['mode'],
  config: PageParticleTransitionConfig,
): Promise<PageParticleCapture | null> {
  const rect = element.getBoundingClientRect()
  if (rect.width <= 0 || rect.height <= 0) {
    return null
  }

  const background = readCaptureBackground(element, config)
  const backgroundRgb = parseCssRgb(background) ?? [255, 255, 255]
  const overlayIgnoreClassName = config.overlayIgnoreClassName ?? DEFAULT_OVERLAY_IGNORE_CLASS_NAME
  const canvas = await html2canvas(element, {
    backgroundColor: null,
    height: rect.height,
    ignoreElements: (target) => target.classList.contains(overlayIgnoreClassName),
    logging: false,
    scale: Math.min(window.devicePixelRatio, 2),
    useCORS: true,
    width: rect.width,
    windowHeight: window.innerHeight,
    windowWidth: window.innerWidth,
  })
  const context = canvas.getContext('2d', { willReadFrequently: true })
  if (!context) {
    return null
  }

  return {
    backgroundRgb,
    imageData: context.getImageData(0, 0, canvas.width, canvas.height),
    mode,
    rect: elementRectToSceneRect(rect, window.innerWidth, window.innerHeight, getElementRadius(element)),
  }
}

export async function capturePageParticleSnapshot(
  config: PageParticleTransitionConfig,
): Promise<PageParticleSnapshot | null> {
  const source = getSourceElement(config)
  if (!source) {
    return null
  }

  const capture = await capturePageParticleElement(source, config.source.mode ?? 'solid', config)
  if (!capture) {
    return null
  }

  return capture
}

export async function captureTargetParticleSnapshots(
  config: PageParticleTransitionConfig,
): Promise<PageParticleCapture[]> {
  const targets = config.targets ?? []
  const captures = await Promise.all(
    targets.map(async ({ element: resolver, mode = 'solid' }) => {
      const element = resolvePageParticleElement(resolver)
      return element ? capturePageParticleElement(element, mode, config) : null
    }),
  )

  return captures.filter((capture): capture is PageParticleCapture => capture !== null)
}
