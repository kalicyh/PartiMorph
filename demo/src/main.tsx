import { StrictMode, useLayoutEffect, useMemo, useState } from 'react'
import { createRoot } from 'react-dom/client'
import {
  PageParticleMorph,
  capturePageParticleSnapshot,
  usePageParticleTransition,
  type PageParticleTransitionConfig,
} from 'parti-morph'
import './styles.css'

function DemoApp() {
  const [active, setActive] = useState(false)
  const transition = usePageParticleTransition({
    active,
    particlesEnabled: true,
    setActive,
  })
  const particleConfig = useMemo(() => ({
    pageRoot: '#root',
    source: {
      element: '[data-parti-source]',
      mode: 'solid',
    },
    sourceFallbackRect: ({ height, width }: { height: number; width: number }) => ({
      cx: 0,
      cy: 0,
      h: Math.min(420, height * 0.72),
      radius: 28,
      w: Math.min(440, width * 0.9),
    }),
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
  }) satisfies PageParticleTransitionConfig, [])

  useLayoutEffect(() => {
    document.documentElement.dataset.theme = 'dark'
  }, [])

  async function handleSignIn() {
    const snapshot = await capturePageParticleSnapshot(particleConfig)
    transition.handleEnter(snapshot)
  }

  return (
    <main className="app-shell">
      {active ? (
        <Dashboard onSignOut={transition.handleLeave} />
      ) : (
        <LoginCard
          busy={transition.pagePhase === 'entering'}
          onSignIn={handleSignIn}
        />
      )}

      {active && transition.pagePhase === 'entered' ? (
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
    </main>
  )
}

function LoginCard({
  busy,
  onSignIn,
}: {
  busy: boolean
  onSignIn: () => void
}) {
  return (
    <section className="login-page">
      <form
        data-parti-source
        className="login-card"
        onSubmit={(event) => {
          event.preventDefault()
          if (!busy) {
            onSignIn()
          }
        }}
      >
        <span className="eyebrow">Parti Morph Demo</span>
        <h1>Welcome back</h1>
        <label>
          <span>Email</span>
          <input type="email" defaultValue="demo@parti.dev" />
        </label>
        <label>
          <span>Password</span>
          <input type="password" defaultValue="partimorph" />
        </label>
        <button type="submit" disabled={busy}>
          {busy ? 'Morphing...' : 'Sign in'}
        </button>
      </form>
    </section>
  )
}

function Dashboard({ onSignOut }: { onSignOut: () => void }) {
  return (
    <section className="dashboard-page">
      <nav data-parti-nav className="top-nav">
        <strong>Parti Desk</strong>
        <button type="button" onClick={onSignOut}>Sign out</button>
      </nav>
      <div data-parti-dashboard className="dashboard-grid">
        <article className="metric-card primary">
          <span>Revenue</span>
          <strong>$128.4K</strong>
          <small>+18.6% this month</small>
        </article>
        <article className="metric-card">
          <span>Active users</span>
          <strong>24,891</strong>
          <small>1,284 online now</small>
        </article>
        <article className="metric-card">
          <span>Deploy health</span>
          <strong>99.98%</strong>
          <small>All regions healthy</small>
        </article>
        <article className="activity-card">
          <span>Pipeline</span>
          <div className="bar-row"><i style={{ width: '72%' }} />Design review</div>
          <div className="bar-row"><i style={{ width: '54%' }} />API polish</div>
          <div className="bar-row"><i style={{ width: '86%' }} />Release prep</div>
        </article>
      </div>
    </section>
  )
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <DemoApp />
  </StrictMode>,
)
