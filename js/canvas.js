import { FORMATS, FONT_FALLBACK, HANDLE_R } from './constants.js'
import { S, activeText, getActiveLayerData, flags } from './state.js'

export const canvas = document.getElementById('canvas')
export const ctx    = canvas.getContext('2d')

// Off-screen canvas for text measurement
export const mCv  = document.createElement('canvas')
mCv.width = 4000; mCv.height = 300
export const mCtx = mCv.getContext('2d')

export function fontStack(fontFamily) {
  return `'${fontFamily || S.currentFont}', ${FONT_FALLBACK}`
}
export function fontStr(size, fontFamily) {
  return `900 italic ${size}px ${fontStack(fontFamily)}`
}

export function measureAt(text, size, fontFamily) {
  mCtx.font = fontStr(size, fontFamily)
  if ('letterSpacing' in mCtx) mCtx.letterSpacing = S.kerning + 'px'
  const m = mCtx.measureText(text)
  const hasB = typeof m.actualBoundingBoxLeft === 'number'
  return { visualW: hasB ? m.actualBoundingBoxLeft + m.actualBoundingBoxRight : m.width }
}

export function recalcFont() {
  const { w } = FORMATS[S.format]
  const avail = w - S.compPadL - S.compPadR
  if (avail <= 0) return
  const lines = S.texts.flatMap(t => {
    const ls = (t.text||'').split('\n').map(l => l.trim()).filter(Boolean)
    return (ls.length ? ls : ['M']).map(line => ({ line, fontFamily: t.fontFamily }))
  })
  const BASE = 100, SAFE = 0.995
  const maxVis = Math.max(...lines.map(x => measureAt(x.line||'M', BASE, x.fontFamily).visualW))
  S.fontSize = maxVis > 0 ? BASE * avail / maxVis * SAFE : BASE
  ctx.font = fontStr(S.fontSize, activeText().fontFamily)
  if ('letterSpacing' in ctx) ctx.letterSpacing = S.kerning + 'px'
  const actualMax = Math.max(...lines.map(x => {
    ctx.font = fontStr(S.fontSize, x.fontFamily)
    const m = ctx.measureText(x.line||'M')
    const hasB = typeof m.actualBoundingBoxLeft === 'number'
    return hasB ? m.actualBoundingBoxLeft + m.actualBoundingBoxRight : m.width
  }))
  if (actualMax > avail) S.fontSize *= (avail / actualMax) * SAFE
}

export function getLines() {
  const ls = (activeText().text||'').split('\n').map(l => l.trim()).filter(l => l.length > 0)
  return ls.length > 0 ? ls : ['']
}
export function rowH() { return S.fontSize * S.lineHeight }

export function getHandlesLogical() {
  const ld = getActiveLayerData()
  if (!ld || ld.w === 0) return null
  const hw = ld.w * ld.scale / 2, hh = ld.h * ld.scale / 2
  const ang = ld.rot * Math.PI / 180
  const cos = Math.cos(ang), sin = Math.sin(ang)
  const cx = ld.x, cy = ld.y
  function r(lx, ly) { return { x: cx + lx*cos - ly*sin, y: cy + lx*sin + ly*cos } }
  return { tl:r(-hw,-hh), tr:r(hw,-hh), bl:r(-hw,hh), br:r(hw,hh), rot:r(0,-hh-70), rotBase:r(0,-hh), cx, cy, hw, hh, color: ld.color }
}

export function toLogical(rx, ry) {
  const { w, h } = FORMATS[S.format]
  const gs = S.globalScale
  return { x: w/2 + (rx - w/2)/gs, y: h/2 + (ry - h/2)/gs }
}

export function mouseInTextBox(lx, ly, t = activeText()) {
  const { w, h } = FORMATS[S.format]
  const cx = t.textXPct/100*w, cy = t.textYPct/100*h
  const ang = -t.textRotation * Math.PI / 180
  const dx = lx - cx, dy = ly - cy
  const cos = Math.cos(ang), sin = Math.sin(ang)
  const bx = dx*cos - dy*sin, by = dx*sin + dy*cos
  const hw = t._bboxW * t.textScale / 2, hh = t._bboxH * t.textScale / 2
  return Math.abs(bx) <= hw + HANDLE_R && Math.abs(by) <= hh + HANDLE_R
}

export function dist(ax, ay, bx, by) {
  return Math.sqrt((ax-bx)**2 + (ay-by)**2)
}

export function hapticTick() {
  if (!('vibrate' in navigator)) return
  const now = performance.now()
  if (now - flags._lastHapticAt < 80) return
  flags._lastHapticAt = now
  navigator.vibrate(10)
}
