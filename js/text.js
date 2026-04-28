import { S, makeTextLayer, activeText } from './state.js'
import { recalcFont } from './canvas.js'

export function syncTextLayerSelect() {
  const sel = document.getElementById('text-layer-select')
  if (!sel) return
  sel.innerHTML = ''
  S.texts.forEach((t, i) => {
    const opt = document.createElement('option')
    opt.value = t.id
    const first = (t.text||'').split('\n')[0].trim() || `Testo ${i+1}`
    opt.textContent = `${i+1}. ${first.slice(0,28)}`
    sel.appendChild(opt)
  })
  sel.value = S.activeTextId
}

export function syncTextUI() {
  const t = activeText()
  const ti = document.getElementById('text-input')
  if (ti) ti.value = t.text
  document.querySelectorAll('.align-btn').forEach(b => b.classList.toggle('active', b.dataset.align === t.align))
  const fs = document.getElementById('font-select')
  if (fs && [...fs.options].some(o => o.value === t.fontFamily)) fs.value = t.fontFamily
  const isTransparent = t.textColor === 'rgba(0,0,0,0)'
  document.getElementById('text-dot').style.background = isTransparent
    ? 'repeating-conic-gradient(#c9c9c9 0% 25%, #ffffff 0% 50%) 50% / 10px 10px'
    : t.textColor
  document.getElementById('text-hex').textContent = isTransparent ? 'TRANSPARENT' : t.textColor.toUpperCase()
  syncTextLayerSelect()
  syncTextSliders()
}

export function syncTextSliders() {
  const t = activeText()
  document.getElementById('text-x').value = t.textXPct
  document.getElementById('text-x-v').textContent = t.textXPct.toFixed(1)
  document.getElementById('text-y').value = t.textYPct
  document.getElementById('text-y-v').textContent = t.textYPct.toFixed(1)
  document.getElementById('text-scale').value = t.textScale
  document.getElementById('text-scale-v').textContent = t.textScale.toFixed(2)
  let rot = ((t.textRotation % 360) + 360) % 360
  if (rot > 180) rot -= 360
  rot = Math.max(-180, Math.min(180, rot))
  document.getElementById('text-rotation').value = rot
  document.getElementById('text-rotation-v').textContent = rot.toFixed(0) + '°'
}

export function setActiveText(id) {
  if (!S.texts.some(t => t.id === id)) return
  S.activeTextId = id
  S.activeLayer = { type:'text', id }
  syncTextUI()
}

export function duplicateActiveText() {
  const t = activeText()
  const copy = { ...t, id: makeTextLayer('').id, textXPct: Math.min(100, t.textXPct+2), textYPct: Math.min(100, t.textYPct+2) }
  S.texts.push(copy)
  setActiveText(copy.id)
  recalcFont()
}

export function removeActiveText() {
  if (S.texts.length <= 1) return
  const idx = S.texts.findIndex(t => t.id === S.activeTextId)
  if (idx < 0) return
  S.texts.splice(idx, 1)
  setActiveText(S.texts[Math.max(0, idx-1)].id)
  recalcFont()
}

export function moveActiveTextLayer(dir) {
  const idx = S.texts.findIndex(t => t.id === S.activeTextId)
  const target = idx + dir
  if (idx < 0 || target < 0 || target >= S.texts.length) return
  const [item] = S.texts.splice(idx, 1)
  S.texts.splice(target, 0, item)
}

// ── Event listeners ───────────────────────────────────────────────────────────

document.getElementById('text-layer-select').addEventListener('change', e => setActiveText(e.target.value))

document.getElementById('text-add-btn').addEventListener('click', () => {
  const t = makeTextLayer(`TESTO ${S.texts.length+1}`)
  t.label = `Testo ${S.texts.length+1}`
  S.texts.push(t)
  setActiveText(t.id)
  recalcFont()
})

document.getElementById('text-remove-btn').addEventListener('click', () => removeActiveText())

document.getElementById('text-input').addEventListener('input', e => {
  activeText().text = e.target.value || 'A'
  recalcFont()
  syncTextLayerSelect()
})

document.querySelectorAll('.align-btn').forEach(b => {
  b.addEventListener('click', () => { activeText().align = b.dataset.align; syncTextUI() })
})

document.getElementById('text-x').addEventListener('input', function() {
  activeText().textXPct = parseFloat(this.value)
  document.getElementById('text-x-v').textContent = parseFloat(this.value).toFixed(1)
})
document.getElementById('text-y').addEventListener('input', function() {
  activeText().textYPct = parseFloat(this.value)
  document.getElementById('text-y-v').textContent = parseFloat(this.value).toFixed(1)
})
document.getElementById('text-scale').addEventListener('input', function() {
  activeText().textScale = parseFloat(this.value)
  document.getElementById('text-scale-v').textContent = parseFloat(this.value).toFixed(2)
})
document.getElementById('text-rotation').addEventListener('input', function() {
  activeText().textRotation = parseFloat(this.value)
  document.getElementById('text-rotation-v').textContent = parseFloat(this.value).toFixed(0) + '°'
})
document.getElementById('reset-transform-btn').addEventListener('click', () => {
  const t = activeText()
  t.textXPct = 50; t.textYPct = 50; t.textScale = 1.0; t.textRotation = 0
  syncTextSliders()
})
