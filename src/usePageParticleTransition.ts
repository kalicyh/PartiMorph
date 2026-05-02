import { useCallback, useEffect, useRef, useState } from 'react'
import type { PageParticleSnapshot } from './pageParticleSnapshot'

export type PageTransitionPhase = 'idle' | 'entering' | 'leaving' | 'entered'

type UsePageParticleTransitionOptions = {
  active: boolean
  activeStorageValue?: string
  particlesEnabled: boolean
  persistActiveStateKey?: string
  setActive: (active: boolean) => void
}

const LEAVE_PARTICLE_MORPH_MS = 780
const LEAVE_STATE_SWAP_MS = 520
const LEAVE_MORPH_HOLD_MS = 340

export function usePageParticleTransition({
  active,
  activeStorageValue = '1',
  particlesEnabled,
  persistActiveStateKey,
  setActive,
}: UsePageParticleTransitionOptions) {
  const [pageParticleSnapshot, setPageParticleSnapshot] =
    useState<PageParticleSnapshot | null>(null)
  const [pagePhase, setPagePhase] = useState<PageTransitionPhase>(() =>
    active ? 'entered' : 'idle',
  )
  const [leaveMorphVisible, setLeaveMorphVisible] = useState(false)
  const enteredTimerRef = useRef<number | null>(null)
  const phaseTimerRef = useRef<number | null>(null)

  const clearEnteredTimer = useCallback(() => {
    if (enteredTimerRef.current !== null) {
      window.clearTimeout(enteredTimerRef.current)
      enteredTimerRef.current = null
    }
  }, [])

  const clearPhaseTimer = useCallback(() => {
    if (phaseTimerRef.current !== null) {
      window.clearTimeout(phaseTimerRef.current)
      phaseTimerRef.current = null
    }
  }, [])

  const clearTimers = useCallback(() => {
    clearEnteredTimer()
    clearPhaseTimer()
  }, [clearEnteredTimer, clearPhaseTimer])

  useEffect(() => {
    if (pagePhase !== 'entered') {
      return undefined
    }

    clearEnteredTimer()
    enteredTimerRef.current = window.setTimeout(() => {
      setPagePhase('idle')
      enteredTimerRef.current = null
    }, particlesEnabled ? 2480 : 820)

    return clearEnteredTimer
  }, [clearEnteredTimer, pagePhase, particlesEnabled])

  useEffect(() => clearTimers, [clearTimers])

  const handleEnter = useCallback((snapshot?: PageParticleSnapshot | null) => {
    if (active || pagePhase === 'entering') {
      return
    }

    clearTimers()
    setLeaveMorphVisible(false)
    if (snapshot !== undefined) {
      setPageParticleSnapshot(snapshot)
    }
    setPagePhase('entering')
    phaseTimerRef.current = window.setTimeout(() => {
      if (persistActiveStateKey) {
        window.localStorage.setItem(persistActiveStateKey, activeStorageValue)
      }
      setActive(true)
      setPagePhase('entered')
      phaseTimerRef.current = null
    }, particlesEnabled ? 80 : 880)
  }, [
    active,
    activeStorageValue,
    clearTimers,
    pagePhase,
    persistActiveStateKey,
    particlesEnabled,
    setActive,
  ])

  const handleLeave = useCallback(() => {
    if (!active || pagePhase === 'leaving') {
      return
    }

    clearTimers()
    setPagePhase('leaving')
    if (particlesEnabled) {
      setLeaveMorphVisible(true)
    }
    phaseTimerRef.current = window.setTimeout(() => {
      if (persistActiveStateKey) {
        window.localStorage.removeItem(persistActiveStateKey)
      }
      setActive(false)
      setPagePhase('idle')
      if (!particlesEnabled) {
        phaseTimerRef.current = null
        return
      }
      phaseTimerRef.current = window.setTimeout(() => {
        setLeaveMorphVisible(false)
        phaseTimerRef.current = null
      }, LEAVE_PARTICLE_MORPH_MS + LEAVE_MORPH_HOLD_MS - LEAVE_STATE_SWAP_MS + 80)
    }, particlesEnabled ? LEAVE_STATE_SWAP_MS : 760)
  }, [
    active,
    clearTimers,
    pagePhase,
    persistActiveStateKey,
    particlesEnabled,
    setActive,
  ])

  return {
    handleEnter,
    handleLeave,
    leaveMorphHoldMs: LEAVE_MORPH_HOLD_MS,
    leaveMorphVisible,
    pageParticleSnapshot,
    pagePhase,
  }
}
