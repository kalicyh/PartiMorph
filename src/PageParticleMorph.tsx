import { useEffect, useRef, useState, type CSSProperties } from 'react'
import * as THREE from 'three'
import {
  captureTargetParticleSnapshots,
  elementRectToSceneRect,
  getSourceElement,
  type PageParticleCapture,
  type PageParticleSnapshot,
  type PageParticleTransitionConfig,
  type RectSpec,
} from './pageParticleSnapshot'

export type PageParticleMorphPhase = 'enter' | 'leave'

export type PageParticleMorphProps = {
  config: PageParticleTransitionConfig
  holdMs?: number
  phase: PageParticleMorphPhase
  snapshot?: PageParticleSnapshot | null
}

const PARTICLE_SIDE = 100
const PARTICLE_COUNT = PARTICLE_SIDE * PARTICLE_SIDE
const CAMERA_Z = 820
const PLANE_Z = 0
const BACKGROUND_DIFF_THRESHOLD = 0.018

const overlayStyle = {
  background: 'var(--app-bg, transparent)',
  inset: 0,
  overflow: 'hidden',
  pointerEvents: 'none',
  position: 'fixed',
  zIndex: 2147483000,
} satisfies CSSProperties

type ParticleLayout = {
  alphas: Float32Array
  colors: Float32Array
  positions: Float32Array
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value))
}

function smootherStep(value: number) {
  const x = clamp(value, 0, 1)
  return x * x * x * (x * (x * 6 - 15) + 10)
}

function hash01(index: number, salt: number) {
  const x = Math.sin(index * 12.9898 + salt * 78.233) * 43758.5453
  return x - Math.floor(x)
}

function rectSignedDistance(x: number, y: number, rect: {
  cx: number
  cy: number
  h: number
  radius: number
  w: number
}) {
  const qx = Math.abs(x - rect.cx) - rect.w / 2 + rect.radius
  const qy = Math.abs(y - rect.cy) - rect.h / 2 + rect.radius
  const ox = Math.max(qx, 0)
  const oy = Math.max(qy, 0)
  return Math.hypot(ox, oy) + Math.min(Math.max(qx, qy), 0) - rect.radius
}

function inRoundedRect(x: number, y: number, rect: {
  cx: number
  cy: number
  h: number
  radius: number
  w: number
}) {
  return rectSignedDistance(x, y, rect) <= 0
}

function mixColor(a: THREE.Color, b: THREE.Color, amount: number) {
  return a.clone().lerp(b, amount)
}

function pointInRect(u: number, v: number, rect: {
  cx: number
  cy: number
  h: number
  w: number
}) {
  return {
    x: rect.cx + (u - 0.5) * rect.w,
    y: rect.cy + (0.5 - v) * rect.h,
  }
}

function withColor<T extends { active: boolean; x: number; y: number; z: number }>(
  point: T,
  color: THREE.Color,
) {
  return {
    ...point,
    b: color.b,
    g: color.g,
    r: color.r,
  }
}

function cssColorToHex(cssColor: string, fallback: string) {
  const match = cssColor.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/)
  if (!match) {
    return fallback
  }
  const [, r, g, b] = match
  return `#${[r, g, b]
    .map((channel) => Number(channel).toString(16).padStart(2, '0'))
    .join('')}`
}

function isLeavePhase(phase: PageParticleMorphPhase) {
  return phase === 'leave'
}

function readSourceRect(
  width: number,
  height: number,
  config: PageParticleTransitionConfig,
): RectSpec {
  const fallback = {
    cx: 0,
    cy: 0,
    h: Math.min(370, height * 0.58),
    radius: 28,
    w: Math.min(390, width * 0.92),
  }
  const configuredFallback = typeof config.sourceFallbackRect === 'function'
    ? config.sourceFallbackRect({ height, width })
    : config.sourceFallbackRect
  const fallbackRect = configuredFallback ?? fallback

  const source = getSourceElement(config)
  if (!source) {
    return fallbackRect
  }

  const rect = source.getBoundingClientRect()
  if (rect.width <= 0 || rect.height <= 0) {
    return fallbackRect
  }

  const styles = window.getComputedStyle(source)
  const radius = Number.parseFloat(styles.borderTopLeftRadius) || fallbackRect.radius
  return elementRectToSceneRect(rect, width, height, radius)
}

function makeLayout(
  width: number,
  height: number,
  kind: 'target' | 'source' | 'scatter',
  sourceRect: RectSpec,
  config: PageParticleTransitionConfig,
  snapshot?: PageParticleSnapshot | null,
  targetCaptures: PageParticleCapture[] = [],
) {
  const positions = new Float32Array(PARTICLE_COUNT * 3)
  const colors = new Float32Array(PARTICLE_COUNT * 3)
  const alphas = new Float32Array(PARTICLE_COUNT)
  const color = new THREE.Color()
  const isLightTheme = document.documentElement.dataset.theme === 'light'
  const source = getSourceElement(config)
  const sourceBackground = source
    ? cssColorToHex(window.getComputedStyle(source).backgroundColor, isLightTheme ? '#f7fbff' : '#141c2b')
    : isLightTheme ? '#f7fbff' : '#141c2b'
  const panel = new THREE.Color(sourceBackground)
  const panelLight = new THREE.Color(isLightTheme ? '#eef5ff' : '#243246')
  const titleColor = new THREE.Color(isLightTheme ? '#213d63' : '#f1f5fb')
  const teal = new THREE.Color('#28c2ad')
  const cyan = new THREE.Color('#8bf7ff')
  const amber = new THREE.Color('#ffb14c')
  const blue = new THREE.Color('#5f7dff')

  const viewportScale = Math.min(width, height) / 860
  const targetCaptureWeights = targetCaptures.map((capture) =>
    Math.sqrt(Math.max(1, capture.rect.w * capture.rect.h)),
  )
  const targetCaptureWeightTotal = targetCaptureWeights.reduce((total, weight) => total + weight, 0)
  const sourceTitle = {
    cx: sourceRect.cx - sourceRect.w * 0.2,
    cy: sourceRect.cy + sourceRect.h * 0.29,
    h: sourceRect.h * 0.1,
    radius: 10,
    w: sourceRect.w * 0.36,
  }
  const sourceInputA = {
    cx: sourceRect.cx,
    cy: sourceRect.cy + sourceRect.h * 0.09,
    h: sourceRect.h * 0.13,
    radius: sourceRect.h * 0.055,
    w: sourceRect.w * 0.86,
  }
  const sourceInputB = {
    cx: sourceRect.cx,
    cy: sourceRect.cy - sourceRect.h * 0.16,
    h: sourceRect.h * 0.13,
    radius: sourceRect.h * 0.055,
    w: sourceRect.w * 0.86,
  }
  const sourceButton = {
    cx: sourceRect.cx,
    cy: sourceRect.cy - sourceRect.h * 0.38,
    h: sourceRect.h * 0.14,
    radius: sourceRect.h * 0.07,
    w: sourceRect.w * 0.86,
  }

  const topBar = { cx: 0, cy: height / 2 - 48, h: 54, radius: 16, w: width - 72 }
  const leftPanel = {
    cx: -width * 0.245,
    cy: 0,
    h: Math.min(560, height - 180),
    radius: 22,
    w: Math.min(520, width * 0.44),
  }
  const rightPanel = {
    cx: width * 0.285,
    cy: 0,
    h: Math.min(560, height - 180),
    radius: 22,
    w: Math.min(390, width * 0.34),
  }
  const targetButton = {
    cx: leftPanel.cx,
    cy: leftPanel.cy + leftPanel.h * 0.14,
    h: 110,
    radius: 22,
    w: leftPanel.w * 0.74,
  }
  const targetDrop = {
    cx: leftPanel.cx,
    cy: leftPanel.cy - leftPanel.h * 0.08,
    h: 130,
    radius: 24,
    w: leftPanel.w * 0.78,
  }
  const targetHistory = {
    cx: rightPanel.cx,
    cy: rightPanel.cy - rightPanel.h * 0.2,
    h: 190,
    radius: 20,
    w: rightPanel.w * 0.76,
  }

  function sourcePoint(u: number, v: number, index: number) {
    const point = pointInRect(u, v, sourceRect)
    const x = point.x
    const y = point.y
    const inCard = inRoundedRect(x, y, sourceRect)
    const inTitle = inRoundedRect(x, y, sourceTitle)
    const inInputA = inRoundedRect(x, y, sourceInputA)
    const inInputB = inRoundedRect(x, y, sourceInputB)
    const inButton = inRoundedRect(x, y, sourceButton)

    if (snapshot) {
      const sourceX = clamp(Math.floor(u * snapshot.imageData.width), 0, snapshot.imageData.width - 1)
      const sourceY = clamp(Math.floor(v * snapshot.imageData.height), 0, snapshot.imageData.height - 1)
      const sourceIndex = (sourceY * snapshot.imageData.width + sourceX) * 4
      const alpha = snapshot.imageData.data[sourceIndex + 3] / 255
      color.setRGB(
        snapshot.imageData.data[sourceIndex] / 255,
        snapshot.imageData.data[sourceIndex + 1] / 255,
        snapshot.imageData.data[sourceIndex + 2] / 255,
      )
      return withColor({
        active: alpha > 0.08 && inCard,
        x: x + (hash01(index, 1) - 0.5) * 2 * viewportScale,
        y: y + (hash01(index, 2) - 0.5) * 2 * viewportScale,
        z: PLANE_Z,
      }, color)
    }

    if (inButton) {
      color.copy(mixColor(teal, amber, clamp((x - sourceButton.cx) / sourceButton.w + 0.5, 0, 1)))
    } else if (inTitle) {
      color.copy(titleColor)
    } else if (inInputA || inInputB) {
      color.copy(panelLight)
    } else if (inCard) {
      color.copy(panel)
    } else {
      color.setRGB(0, 0, 0)
    }

    return withColor({
      active: inCard || inTitle || inInputA || inInputB || inButton,
      x: x + (hash01(index, 1) - 0.5) * 3 * viewportScale,
      y: y + (hash01(index, 2) - 0.5) * 3 * viewportScale,
      z: PLANE_Z,
    }, color)
  }

  function pickHomeCapture(seed: number) {
    if (targetCaptures.length === 0 || targetCaptureWeightTotal <= 0) {
      return null
    }

    let cursor = seed * targetCaptureWeightTotal
    for (let index = 0; index < targetCaptures.length; index += 1) {
      cursor -= targetCaptureWeights[index]
      if (cursor <= 0) {
        return targetCaptures[index]
      }
    }
    return targetCaptures[targetCaptures.length - 1]
  }

  function capturePoint(
    capture: PageParticleCapture,
    u: number,
    v: number,
    index: number,
    salt: number,
  ) {
    const point = pointInRect(u, v, capture.rect)
    const sourceX = clamp(Math.floor(u * capture.imageData.width), 0, capture.imageData.width - 1)
    const sourceY = clamp(Math.floor(v * capture.imageData.height), 0, capture.imageData.height - 1)
    const sourceIndex = (sourceY * capture.imageData.width + sourceX) * 4
    const red = capture.imageData.data[sourceIndex]
    const green = capture.imageData.data[sourceIndex + 1]
    const blueChannel = capture.imageData.data[sourceIndex + 2]
    const alpha = capture.imageData.data[sourceIndex + 3] / 255
    const backgroundDiff = (
      Math.abs(red - capture.backgroundRgb[0]) +
      Math.abs(green - capture.backgroundRgb[1]) +
      Math.abs(blueChannel - capture.backgroundRgb[2])
    ) / (255 * 3)
    const active = alpha > 0.08 &&
      inRoundedRect(point.x, point.y, capture.rect) &&
      (capture.mode === 'solid' || backgroundDiff > BACKGROUND_DIFF_THRESHOLD)

    color.setRGB(red / 255, green / 255, blueChannel / 255)
    return withColor({
      active,
      x: point.x + (hash01(index, salt) - 0.5) * 3 * viewportScale,
      y: point.y + (hash01(index, salt + 1) - 0.5) * 3 * viewportScale,
      z: PLANE_Z,
    }, color)
  }

  function targetPoint(u: number, v: number, index: number) {
    for (let attempt = 0; attempt < 6; attempt += 1) {
      const capture = pickHomeCapture(hash01(index, 18 + attempt))
      if (!capture) {
        break
      }

      const point = capturePoint(
        capture,
        (u + hash01(index, 24 + attempt) * 0.73) % 1,
        (v + hash01(index, 34 + attempt) * 0.73) % 1,
        index,
        44 + attempt,
      )
      if (point.active || attempt === 5) {
        return point
      }
    }

    const bucket = hash01(index, 8)
    const localU = (u + hash01(index, 9) * 0.19) % 1
    const localV = (v + hash01(index, 10) * 0.19) % 1
    let rect = topBar
    let tint = blue
    if (bucket < 0.2) {
      rect = topBar
      tint = blue
    } else if (bucket < 0.46) {
      rect = leftPanel
      tint = panelLight
    } else if (bucket < 0.62) {
      rect = targetButton
      tint = amber
    } else if (bucket < 0.78) {
      rect = targetDrop
      tint = cyan
    } else if (bucket < 0.91) {
      rect = rightPanel
      tint = teal
    } else {
      rect = targetHistory
      tint = amber
    }

    const point = pointInRect(localU, localV, rect)
    const accentAmount = rect === targetButton || rect === targetDrop
      ? clamp(localU, 0, 1)
      : hash01(index, 12) * 0.24
    color.copy(rect === targetButton || rect === targetDrop
      ? mixColor(cyan, amber, accentAmount)
      : mixColor(panel, tint, accentAmount))

    return withColor({
      active: true,
      x: point.x + (hash01(index, 13) - 0.5) * 4 * viewportScale,
      y: point.y + (hash01(index, 14) - 0.5) * 4 * viewportScale,
      z: PLANE_Z,
    }, color)
  }

  for (let row = 0; row < PARTICLE_SIDE; row += 1) {
    for (let col = 0; col < PARTICLE_SIDE; col += 1) {
      const index = row * PARTICLE_SIDE + col
      const u = (col + 0.5) / PARTICLE_SIDE
      const v = (row + 0.5) / PARTICLE_SIDE
      const source = sourcePoint(u, v, index)
      const target = targetPoint(u, v, index)
      let x = source.x
      let y = source.y
      let z = source.z
      let active = source.active
      let pointB = source.b
      let pointG = source.g
      let pointR = source.r

      if (kind === 'source') {
        x = source.x
        y = source.y
        z = source.z
        active = source.active
        pointB = source.b
        pointG = source.g
        pointR = source.r
      } else if (kind === 'target') {
        x = target.x
        y = target.y
        z = target.z
        active = target.active
        pointB = target.b
        pointG = target.g
        pointR = target.r
      } else {
        const angle = hash01(index, 3) * Math.PI * 2
        const radius = (0.08 + Math.sqrt(hash01(index, 4)) * 0.34) * Math.min(width, height)
        x = source.x + Math.cos(angle) * radius * 0.42
        y = source.y + Math.sin(angle) * radius * 0.3
        z = (hash01(index, 5) - 0.5) * 240
        const mixAmount = hash01(index, 6)
        pointR = source.r + (target.r - source.r) * mixAmount
        pointG = source.g + (target.g - source.g) * mixAmount
        pointB = source.b + (target.b - source.b) * mixAmount
        active = source.active || target.active
      }

      const alpha = active ? 1 : 0
      const offset = index * 3
      positions[offset] = x
      positions[offset + 1] = y
      positions[offset + 2] = z
      colors[offset] = pointR
      colors[offset + 1] = pointG
      colors[offset + 2] = pointB
      alphas[index] = alpha
    }
  }

  return { alphas, colors, positions }
}

function blendLayouts(
  outputPositions: Float32Array,
  outputColors: Float32Array,
  outputAlphas: Float32Array,
  from: ParticleLayout,
  middle: ParticleLayout,
  to: ParticleLayout,
  progress: number,
  revealProgress = 1,
) {
  const first = smootherStep(clamp(progress / 0.3, 0, 1))
  const second = smootherStep(clamp((progress - 0.24) / 0.76, 0, 1))
  const reveal = clamp(revealProgress, 0, 1)

  for (let particleIndex = 0; particleIndex < PARTICLE_COUNT; particleIndex += 1) {
    const revealSeed = hash01(particleIndex, 11)
    const revealAmount = smootherStep(clamp((reveal - revealSeed * 0.82) / 0.18, 0, 1))

    for (let axis = 0; axis < 3; axis += 1) {
      const index = particleIndex * 3 + axis
      const scatterValue = from.positions[index] + (middle.positions[index] - from.positions[index]) * first
      outputPositions[index] = scatterValue + (to.positions[index] - scatterValue) * second

      const scatterColor = from.colors[index] + (middle.colors[index] - from.colors[index]) * first
      outputColors[index] = scatterColor + (to.colors[index] - scatterColor) * second
    }

    const scatterAlpha = from.alphas[particleIndex]
      + (middle.alphas[particleIndex] - from.alphas[particleIndex]) * first
    outputAlphas[particleIndex] =
      (scatterAlpha + (to.alphas[particleIndex] - scatterAlpha) * second) * revealAmount
  }
}

function mixLayouts(
  outputPositions: Float32Array,
  outputColors: Float32Array,
  outputAlphas: Float32Array,
  from: ParticleLayout,
  to: ParticleLayout,
  progress: number,
) {
  const amount = smootherStep(progress)

  for (let particleIndex = 0; particleIndex < PARTICLE_COUNT; particleIndex += 1) {
    for (let axis = 0; axis < 3; axis += 1) {
      const index = particleIndex * 3 + axis
      outputPositions[index] = from.positions[index] + (to.positions[index] - from.positions[index]) * amount
      outputColors[index] = from.colors[index] + (to.colors[index] - from.colors[index]) * amount
    }
    outputAlphas[particleIndex] =
      from.alphas[particleIndex] + (to.alphas[particleIndex] - from.alphas[particleIndex]) * amount
  }
}

export function PageParticleMorph({
  config,
  holdMs = 0,
  phase,
  snapshot,
}: PageParticleMorphProps) {
  const containerRef = useRef<HTMLDivElement | null>(null)
  const [visible, setVisible] = useState(true)

  useEffect(() => {
    const container = containerRef.current
    if (!container) {
      return undefined
    }
    const mountNode = container

    let cancelled = false
    let cleanupRenderer: (() => void) | null = null

    async function setup() {
      const targetCaptures = snapshot?.targetCaptures?.length
        ? snapshot.targetCaptures
        : await captureTargetParticleSnapshots(config)

      if (cancelled) {
        return
      }

      let width = window.innerWidth
      let height = window.innerHeight
      const scene = new THREE.Scene()
      const camera = new THREE.OrthographicCamera(
        -width / 2,
        width / 2,
        height / 2,
        -height / 2,
        1,
        2600,
      )
      camera.position.z = CAMERA_Z

      const renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true })
      renderer.setClearColor(0x000000, 0)
      renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
      renderer.setSize(width, height)
      mountNode.appendChild(renderer.domElement)

      let sourceRect = snapshot?.rect ?? readSourceRect(width, height, config)
      let sourceLayout = makeLayout(width, height, 'source', sourceRect, config, snapshot, targetCaptures)
      let scatterLayout = makeLayout(width, height, 'scatter', sourceRect, config, snapshot, targetCaptures)
      let targetLayout = makeLayout(width, height, 'target', sourceRect, config, snapshot, targetCaptures)
      const leaveStartLayout: ParticleLayout = {
        alphas: new Float32Array(PARTICLE_COUNT),
        colors: new Float32Array(PARTICLE_COUNT * 3),
        positions: new Float32Array(PARTICLE_COUNT * 3),
      }
      blendLayouts(
        leaveStartLayout.positions,
        leaveStartLayout.colors,
        leaveStartLayout.alphas,
        targetLayout,
        scatterLayout,
        sourceLayout,
        0,
      )
      const positions = new Float32Array(PARTICLE_COUNT * 3)
      const colors = new Float32Array(PARTICLE_COUNT * 3)
      const alphas = new Float32Array(PARTICLE_COUNT)
      const geometry = new THREE.BufferGeometry()
      geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3))
      geometry.setAttribute('particleColor', new THREE.BufferAttribute(colors, 3))
      geometry.setAttribute('alpha', new THREE.BufferAttribute(alphas, 1))
      let basePointSize = Math.max(2.2, Math.min(width, height) / 260) * renderer.getPixelRatio()
      const material = new THREE.ShaderMaterial({
        blending: THREE.NormalBlending,
        depthWrite: false,
        transparent: true,
        uniforms: {
          pointSize: { value: basePointSize },
        },
        vertexShader: `
          uniform float pointSize;
          attribute float alpha;
          attribute vec3 particleColor;
          varying vec3 vColor;
          varying float vAlpha;

          void main() {
            vColor = particleColor;
            vAlpha = alpha;
            gl_PointSize = pointSize;
            gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
          }
        `,
        fragmentShader: `
          varying vec3 vColor;
          varying float vAlpha;

          void main() {
            if (vAlpha <= 0.01) {
              discard;
            }
            gl_FragColor = vec4(vColor, vAlpha);
          }
        `,
      })
      const points = new THREE.Points(geometry, material)
      scene.add(points)

      const morphDuration = isLeavePhase(phase) ? 780 : 1800
      const duration = morphDuration + holdMs
      let frame = 0
      let doneTimer = 0

      function syncSourceTargetFromMountedElement() {
        if (!isLeavePhase(phase) || !getSourceElement(config)) {
          return
        }

        const nextSourceRect = readSourceRect(width, height, config)
        if (
          nextSourceRect.cx === sourceRect.cx &&
          nextSourceRect.cy === sourceRect.cy &&
          nextSourceRect.w === sourceRect.w &&
          nextSourceRect.h === sourceRect.h
        ) {
          return
        }

        sourceRect = nextSourceRect
        sourceLayout = makeLayout(width, height, 'source', sourceRect, config, snapshot, targetCaptures)
      }

      function renderProgress(progress: number, elapsed = 0) {
        if (isLeavePhase(phase)) {
          syncSourceTargetFromMountedElement()
          mixLayouts(positions, colors, alphas, leaveStartLayout, sourceLayout, progress)
          material.uniforms.pointSize.value = basePointSize * (1.3 + (1 - smootherStep(progress)) * 0.45)
          const fadeStart = morphDuration * 0.66
          const fadeDuration = Math.max(1, duration - fadeStart)
          const fadeProgress = smootherStep(clamp((elapsed - fadeStart) / fadeDuration, 0, 1))
          mountNode.style.opacity = String(1 - fadeProgress)
        } else {
          blendLayouts(positions, colors, alphas, sourceLayout, scatterLayout, targetLayout, progress, 1)
          material.uniforms.pointSize.value = basePointSize * (1.95 - smootherStep(progress) * 0.9)
          mountNode.style.opacity = String(1 - smootherStep(clamp((progress - 0.92) / 0.08, 0, 1)))
        }

        points.rotation.z = (isLeavePhase(phase) ? -1 : 1) * progress * 0.018
        geometry.attributes.position.needsUpdate = true
        geometry.attributes.particleColor.needsUpdate = true
        geometry.attributes.alpha.needsUpdate = true
        renderer.render(scene, camera)
      }

      cleanupRenderer = () => {
        window.cancelAnimationFrame(frame)
        window.clearTimeout(doneTimer)
        window.removeEventListener('resize', handleResize)
        scene.remove(points)
        geometry.dispose()
        material.dispose()
        renderer.dispose()
        renderer.domElement.remove()
        mountNode.style.opacity = ''
      }

      if (phase === 'enter') {
        renderProgress(0)
      }

      const startedAt = performance.now()

      function draw(now: number) {
        const elapsed = now - startedAt
        const progress = isLeavePhase(phase)
          ? clamp(elapsed / morphDuration, 0, 1)
          : clamp(elapsed / morphDuration, 0, 1)
        renderProgress(progress, elapsed)

        if (elapsed < duration) {
          frame = window.requestAnimationFrame(draw)
        }
      }

      function handleResize() {
        width = window.innerWidth
        height = window.innerHeight
        camera.left = -width / 2
        camera.right = width / 2
        camera.top = height / 2
        camera.bottom = -height / 2
        camera.updateProjectionMatrix()
        renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
        renderer.setSize(width, height)
        basePointSize = Math.max(2.2, Math.min(width, height) / 260) * renderer.getPixelRatio()
        sourceRect = snapshot?.rect ?? readSourceRect(width, height, config)
        sourceLayout = makeLayout(width, height, 'source', sourceRect, config, snapshot, targetCaptures)
        scatterLayout = makeLayout(width, height, 'scatter', sourceRect, config, snapshot, targetCaptures)
        targetLayout = makeLayout(width, height, 'target', sourceRect, config, snapshot, targetCaptures)
        blendLayouts(
          leaveStartLayout.positions,
          leaveStartLayout.colors,
          leaveStartLayout.alphas,
          targetLayout,
          scatterLayout,
          sourceLayout,
          0,
        )
      }

      window.addEventListener('resize', handleResize)
      frame = window.requestAnimationFrame(draw)
      doneTimer = window.setTimeout(() => setVisible(false), duration + 80)
    }

    void setup()

    return () => {
      cancelled = true
      cleanupRenderer?.()
    }
  }, [config, holdMs, phase, snapshot])

  return visible ? (
    <div
      ref={containerRef}
      className="parti-morph-overlay"
      style={overlayStyle}
      aria-hidden="true"
    />
  ) : null
}
