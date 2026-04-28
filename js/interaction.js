import { FORMATS, HANDLE_R, SNAP_MOVE_PX, SNAP_ROT_DEG, LONG_PRESS_MS, LONG_PRESS_MOVE_TOL } from './constants.js'
import { S, flags, activeText, getActiveLayerData } from './state.js'
import { canvas, toLogical, getHandlesLogical, mouseInTextBox, dist, hapticTick } from './canvas.js'
import { setActiveText, syncTextSliders } from './text.js'
import { setActiveLottie, syncLottieSliders } from './lottie.js'
import { syncImageSliders } from './image.js'

// Drag state
let dragMode = null
let dragStart = {}
let draggingLottieIdx = -1
let touchGesture = null
let pressTimer = null
let pressStart = null

function updateActiveLayerProp(key, val) {
  const ld = getActiveLayerData(); if (!ld) return
  if (ld.type === 'text') {
    if (key==='xPct') ld.obj.textXPct = val
    else if (key==='yPct') ld.obj.textYPct = val
    else if (key==='scale') ld.obj.textScale = val
    else if (key==='rot') ld.obj.textRotation = val
    syncTextSliders()
  } else if (ld.type === 'lottie') {
    if (key==='xPct') ld.obj.xPct = val
    else if (key==='yPct') ld.obj.yPct = val
    else if (key==='scale') ld.obj.scale = val
    else if (key==='rot') ld.obj.rotation = val
    syncLottieSliders()
  } else if (ld.type === 'image') {
    if (key==='xPct') S.imgXPct = val
    else if (key==='yPct') S.imgYPct = val
    else if (key==='scale') S.imgScale = val
    else if (key==='rot') S.imgRotation = val
    syncImageSliders()
  }
}

function getCanvasPoint(e) {
  const rect = canvas.getBoundingClientRect()
  return {
    x: (e.clientX - rect.left) * canvas.width  / rect.width,
    y: (e.clientY - rect.top)  * canvas.height / rect.height,
  }
}

function resetCanvasInteraction() {
  dragMode = null
  draggingLottieIdx = -1
  flags.activeGuides.v = false
  flags.activeGuides.h = false
  flags.activeGuides.rot = false
}

function snapMove(cx, cy, w, h) {
  let sx = cx, sy = cy, snapped = false
  const centerX = w/2, centerY = h/2
  flags.activeGuides.v = Math.abs(cx - centerX) <= SNAP_MOVE_PX
  flags.activeGuides.h = Math.abs(cy - centerY) <= SNAP_MOVE_PX
  if (flags.activeGuides.v) { sx = centerX; snapped = true }
  if (flags.activeGuides.h) { sy = centerY; snapped = true }
  return { x: sx, y: sy, snapped }
}

function snapRotation(deg) {
  const baseAngles = [-180,-135,-90,-45,0,45,90,135,180]
  let snappedDeg = deg, snapped = false
  for (const target of baseAngles) {
    if (Math.abs(deg - target) <= SNAP_ROT_DEG) { snappedDeg = target; snapped = true; break }
  }
  flags.activeGuides.rot = snapped
  return { deg: snappedDeg, snapped }
}

function getTopTextAt(mx, my) {
  for (let i = S.texts.length-1; i >= 0; i--) {
    if (mouseInTextBox(mx, my, S.texts[i])) return S.texts[i]
  }
  return null
}

function getTextsAt(mx, my) {
  const hit = []
  for (let i = 0; i < S.texts.length; i++) {
    if (mouseInTextBox(mx, my, S.texts[i])) hit.push(S.texts[i])
  }
  return hit
}

function clearLongPressTimer() {
  if (pressTimer) { clearTimeout(pressTimer); pressTimer = null }
}

function scheduleLongPress(e, mx, my) {
  if (e.pointerType !== 'touch') return
  clearLongPressTimer()
  pressStart = { pointerId:e.pointerId, mx, my }
  pressTimer = setTimeout(() => {
    const hits = getTextsAt(pressStart.mx, pressStart.my)
    if (hits.length > 1) {
      const idx = hits.findIndex(t => t.id === S.activeTextId)
      const next = hits[(idx+1) % hits.length] || hits[0]
      setActiveText(next.id); hapticTick()
    } else if (hits.length === 1) {
      setActiveText(hits[0].id); hapticTick()
    }
    pressTimer = null
  }, LONG_PRESS_MS)
}

function maybeCancelLongPress(e, mx, my) {
  if (!pressTimer || !pressStart || pressStart.pointerId !== e.pointerId) return
  const moved = Math.hypot(mx - pressStart.mx, my - pressStart.my)
  if (moved > LONG_PRESS_MOVE_TOL || dragMode || draggingLottieIdx >= 0) clearLongPressTimer()
}

function getTouchLogicalPoint(touch) {
  const rect = canvas.getBoundingClientRect()
  const rx = (touch.clientX - rect.left) * canvas.width  / rect.width
  const ry = (touch.clientY - rect.top)  * canvas.height / rect.height
  return toLogical(rx, ry)
}
function touchDistance(a, b) { return Math.hypot(a.x-b.x, a.y-b.y) }
function touchAngle(a, b)    { return Math.atan2(b.y-a.y, b.x-a.x) }

// ── Pointer events ────────────────────────────────────────────────────────────

canvas.addEventListener('pointerdown', e => {
  if (touchGesture) return
  const { x:rx, y:ry } = getCanvasPoint(e)
  const { x:mx, y:my } = toLogical(rx, ry)
  const H = getHandlesLogical()

  if (H) {
    if (dist(mx,my,H.rot.x,H.rot.y) <= HANDLE_R*1.8) {
      const ld = getActiveLayerData()
      const ang = Math.atan2(my-H.cy, mx-H.cx)
      dragMode = 'rotate'
      dragStart = { mx,my, rotation:ld.rot, startAngle:ang, cx:H.cx, cy:H.cy }
      canvas.setPointerCapture(e.pointerId); e.preventDefault(); return
    }
    for (const key of ['tl','tr','bl','br']) {
      const pt = H[key]
      if (dist(mx,my,pt.x,pt.y) <= HANDLE_R*1.8) {
        const ld = getActiveLayerData()
        dragMode = 'scale'
        dragStart = { mx,my, scale:ld.scale, cx:H.cx, cy:H.cy, startDist:dist(mx,my,H.cx,H.cy) }
        canvas.setPointerCapture(e.pointerId); e.preventDefault(); return
      }
    }
  }

  const { w, h } = FORMATS[S.format]
  for (let i = S.lotties.length-1; i >= 0; i--) {
    const l = S.lotties[i]
    const lx = l.xPct/100*w, ly = l.yPct/100*h
    if (Math.abs(mx-lx) < l.animW*l.scale*0.5 && Math.abs(my-ly) < l.animH*l.scale*0.5) {
      S.activeLayer = { type:'lottie', id:i }; setActiveLottie(i)
      draggingLottieIdx = i
      dragMode = 'move'
      dragStart = { mx, my, xPct:l.xPct, yPct:l.yPct }
      canvas.setPointerCapture(e.pointerId); e.preventDefault(); return
    }
  }

  for (let i = S.texts.length-1; i >= 0; i--) {
    if (mouseInTextBox(mx, my, S.texts[i])) {
      S.activeLayer = { type:'text', id:S.texts[i].id }; setActiveText(S.texts[i].id)
      dragMode = 'move'
      dragStart = { mx, my, xPct:activeText().textXPct, yPct:activeText().textYPct }
      canvas.setPointerCapture(e.pointerId); e.preventDefault(); return
    }
  }

  if (S.image) {
    const fit = Math.min(w*0.7/S.image.width, h*0.7/S.image.height)
    const iw = S.image.width*fit*S.imgScale, ih = S.image.height*fit*S.imgScale
    const ix = S.imgXPct/100*w, iy = S.imgYPct/100*h
    if (Math.abs(mx-ix) < iw/2 && Math.abs(my-iy) < ih/2) {
      S.activeLayer = { type:'image', id:'bgImage' }
      dragMode = 'move'
      dragStart = { mx, my, xPct:S.imgXPct, yPct:S.imgYPct }
      canvas.setPointerCapture(e.pointerId); e.preventDefault(); return
    }
  }

  scheduleLongPress(e, mx, my)
}, { passive:false })

canvas.addEventListener('pointermove', e => {
  if (touchGesture) return
  const { x:rx, y:ry } = getCanvasPoint(e)
  const { x:mx, y:my } = toLogical(rx, ry)
  const { w, h } = FORMATS[S.format]

  maybeCancelLongPress(e, mx, my)

  if (dragMode === 'move') {
    const rawX = (dragStart.xPct/100*w) + (mx - dragStart.mx)
    const rawY = (dragStart.yPct/100*h) + (my - dragStart.my)
    const snapped = snapMove(rawX, rawY, w, h)
    updateActiveLayerProp('xPct', snapped.x/w*100)
    updateActiveLayerProp('yPct', snapped.y/h*100)
    if (snapped.snapped) hapticTick(); return
  }
  if (dragMode === 'rotate') {
    const newAng = Math.atan2(my-dragStart.cy, mx-dragStart.cx)
    const delta  = (newAng - dragStart.startAngle) * 180/Math.PI
    const snapped = snapRotation(dragStart.rotation + delta)
    updateActiveLayerProp('rot', snapped.deg)
    if (snapped.snapped) hapticTick(); return
  }
  if (dragMode === 'scale') {
    const d = dist(mx, my, dragStart.cx, dragStart.cy)
    if (dragStart.startDist > 0) updateActiveLayerProp('scale', Math.max(0.05, Math.min(5.0, dragStart.scale*d/dragStart.startDist)))
    return
  }

  const H = getHandlesLogical()
  if (H) {
    if (dist(mx,my,H.rot.x,H.rot.y) <= HANDLE_R*1.8) {
      canvas.style.cursor = 'crosshair'
    } else if (['tl','tr','bl','br'].some(k => dist(mx,my,H[k].x,H[k].y) <= HANDLE_R*1.8)) {
      canvas.style.cursor = 'nwse-resize'
    } else if (S.lotties.some(l => { const lx=l.xPct/100*w, ly=l.yPct/100*h; return Math.abs(mx-lx)<l.animW*l.scale*0.5&&Math.abs(my-ly)<l.animH*l.scale*0.5 })) {
      canvas.style.cursor = 'move'
    } else if (mouseInTextBox(mx, my)) {
      canvas.style.cursor = 'move'
      flags.activeGuides.v = false; flags.activeGuides.h = false; flags.activeGuides.rot = false
    } else {
      canvas.style.cursor = 'default'
      flags.activeGuides.v = false; flags.activeGuides.h = false; flags.activeGuides.rot = false
    }
  }
}, { passive:false })

canvas.addEventListener('pointerup', e => {
  clearLongPressTimer(); pressStart = null
  resetCanvasInteraction()
  if (canvas.hasPointerCapture(e.pointerId)) canvas.releasePointerCapture(e.pointerId)
})
canvas.addEventListener('pointercancel', e => {
  clearLongPressTimer(); pressStart = null
  resetCanvasInteraction()
  if (canvas.hasPointerCapture(e.pointerId)) canvas.releasePointerCapture(e.pointerId)
})
canvas.addEventListener('mouseleave', () => {
  clearLongPressTimer(); pressStart = null
  resetCanvasInteraction()
})

// ── Touch (pinch/rotate) ──────────────────────────────────────────────────────

canvas.addEventListener('touchstart', e => {
  if (e.touches.length !== 2) return
  const p1 = getTouchLogicalPoint(e.touches[0])
  const p2 = getTouchLogicalPoint(e.touches[1])
  const mid = { x:(p1.x+p2.x)/2, y:(p1.y+p2.y)/2 }
  const t = activeText()
  touchGesture = {
    startDist:touchDistance(p1,p2), startAngle:touchAngle(p1,p2),
    startScale:t.textScale, startRotation:t.textRotation, startMid:mid,
    startXPct:t.textXPct, startYPct:t.textYPct,
  }
  resetCanvasInteraction(); e.preventDefault()
}, { passive:false })

canvas.addEventListener('touchmove', e => {
  if (!touchGesture || e.touches.length !== 2) return
  const { w, h } = FORMATS[S.format]
  const ld = getActiveLayerData(); if (!ld) return
  const p1 = getTouchLogicalPoint(e.touches[0])
  const p2 = getTouchLogicalPoint(e.touches[1])
  const mid = { x:(p1.x+p2.x)/2, y:(p1.y+p2.y)/2 }
  if (touchGesture.startDist > 0) {
    updateActiveLayerProp('scale', Math.max(0.05, Math.min(5.0, touchGesture.startScale*(touchDistance(p1,p2)/touchGesture.startDist))))
  }
  const rotSnap  = snapRotation(touchGesture.startRotation + ((touchAngle(p1,p2)-touchGesture.startAngle)*180/Math.PI))
  updateActiveLayerProp('rot', rotSnap.deg)
  const rawX = (touchGesture.startXPct/100*w) + (mid.x-touchGesture.startMid.x)
  const rawY = (touchGesture.startYPct/100*h) + (mid.y-touchGesture.startMid.y)
  const moveSnap = snapMove(rawX, rawY, w, h)
  updateActiveLayerProp('xPct', moveSnap.x/w*100)
  updateActiveLayerProp('yPct', moveSnap.y/h*100)
  if (rotSnap.snapped || moveSnap.snapped) hapticTick()
  e.preventDefault()
}, { passive:false })

canvas.addEventListener('touchend', e => {
  if (e.touches.length < 2) {
    touchGesture = null
    flags.activeGuides.v = false; flags.activeGuides.h = false; flags.activeGuides.rot = false
  }
}, { passive:false })

canvas.addEventListener('touchcancel', () => {
  touchGesture = null
  flags.activeGuides.v = false; flags.activeGuides.h = false; flags.activeGuides.rot = false
}, { passive:false })
