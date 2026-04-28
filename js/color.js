import { PALETTE_COLORS } from './constants.js'
import { S, activeText } from './state.js'

export function updateColor(target, hex) {
  const toCanvasColor = hex === 'transparent' ? 'rgba(0,0,0,0)' : hex
  if (target === 'bg') {
    S.bgColor = toCanvasColor
    const dot = document.getElementById('bg-dot')
    if (hex === 'transparent' || toCanvasColor === 'rgba(0,0,0,0)') {
      dot.style.background = 'repeating-conic-gradient(#c9c9c9 0% 25%, #ffffff 0% 50%) 50% / 10px 10px'
      document.getElementById('bg-hex').textContent = 'TRANSPARENT'
    } else {
      dot.style.background = hex
      document.getElementById('bg-hex').textContent = hex.toUpperCase()
    }
  } else {
    activeText().textColor = toCanvasColor
    const dot = document.getElementById('text-dot')
    if (hex === 'transparent' || toCanvasColor === 'rgba(0,0,0,0)') {
      dot.style.background = 'repeating-conic-gradient(#c9c9c9 0% 25%, #ffffff 0% 50%) 50% / 10px 10px'
      document.getElementById('text-hex').textContent = 'TRANSPARENT'
    } else {
      dot.style.background = hex
      document.getElementById('text-hex').textContent = hex.toUpperCase()
    }
  }
}

export function shuffleColors() {
  const bg = PALETTE_COLORS[Math.floor(Math.random() * PALETTE_COLORS.length)]
  let text = PALETTE_COLORS[Math.floor(Math.random() * PALETTE_COLORS.length)]
  let attempts = 0
  while (text === bg && bg !== 'transparent' && attempts < 10) {
    text = PALETTE_COLORS[Math.floor(Math.random() * PALETTE_COLORS.length)]
    attempts++
  }
  updateColor('bg', bg)
  updateColor('text', text)
  if ('vibrate' in navigator) navigator.vibrate(15)
}

// ── Event listeners ───────────────────────────────────────────────────────────

document.querySelectorAll('.color-target').forEach(el => {
  el.addEventListener('click', () => {
    S.paletteTarget = el.dataset.target
    document.querySelectorAll('.color-target').forEach(t => t.classList.remove('selected'))
    el.classList.add('selected')
  })
})

PALETTE_COLORS.forEach(c => {
  const el = document.createElement('div')
  el.className = 'flex-1 h-8 rounded-md cursor-pointer border-2 border-transparent transition-all hover:scale-105 hover:border-white/60'
  if (c === 'transparent') {
    el.style.background = 'repeating-conic-gradient(#c9c9c9 0% 25%, #ffffff 0% 50%) 50% / 10px 10px'
    el.title = 'transparent'
  } else {
    el.style.background = c
    el.title = c
  }
  el.addEventListener('click', () => updateColor(S.paletteTarget, c))
  document.getElementById('palette').appendChild(el)
})
