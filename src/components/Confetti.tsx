import { useEffect, useRef, useMemo } from 'react'
import { motion, AnimatePresence } from 'framer-motion'

interface ConfettiParticle {
  id: number; x: number; y: number; vx: number; vy: number; color: string; size: number; rotation: number; round: boolean; dur: number
}

const COLORS = ['#f0195a', '#5fbeff', '#af8ff4', '#ffcd83', '#7ef1b3', '#1a8047', '#122d45']

function makeParticles(count: number): ConfettiParticle[] {
  return Array.from({ length: count }, (_, i) => ({
    id: i,
    x: 50 + (Math.random() - 0.5) * 20,
    y: 30,
    vx: (Math.random() - 0.5) * 8,
    vy: -(Math.random() * 6 + 4),
    color: COLORS[Math.floor(Math.random() * COLORS.length)],
    size: Math.random() * 8 + 4,
    rotation: Math.random() * 360,
    round: Math.random() > 0.5,
    dur: 2 + Math.random() * 0.8,
  }))
}

interface ConfettiProps { active: boolean; onDone: () => void }

export function Confetti({ active, onDone }: ConfettiProps) {
  // Generate particles once when activation changes to true
  const particles = useMemo(() => active ? makeParticles(60) : [], [active])
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    if (active) {
      if (timer.current) clearTimeout(timer.current)
      timer.current = setTimeout(onDone, 2800)
    }
    return () => { if (timer.current) clearTimeout(timer.current) }
  }, [active, onDone])

  return (
    <AnimatePresence>
      {active && (
        <motion.div
          className="fixed inset-0 pointer-events-none z-50 overflow-hidden"
          initial={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.5 }}
        >
          {particles.map((p) => (
            <motion.div
              key={p.id}
              style={{
                position: 'absolute',
                width: p.size,
                height: p.size,
                borderRadius: p.round ? '50%' : 2,
                background: p.color,
                left: `${p.x}%`,
                top: `${p.y}%`,
              }}
              animate={{
                x: p.vx * 80,
                y: p.vy * 80,
                rotate: p.rotation + 360,
                opacity: [1, 1, 0],
              }}
              transition={{ duration: p.dur, ease: 'easeOut' }}
            />
          ))}
        </motion.div>
      )}
    </AnimatePresence>
  )
}
