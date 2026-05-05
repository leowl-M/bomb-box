import { FORMATS } from './constants.js'
import { S, flags, activeText, getActiveLayerData } from './state.js'
import { ctx, fontStr, rowH, getHandlesLogical } from './canvas.js'
import { applyEasing } from './easing.js'
import { rainEngine, rainSpeed, rainTextCollision, syncRainTextBodies } from './rain.js'

export function drawHandlesOnCtx() {
  const h = getHandlesLogical()
  if (!h) return
  ctx.save()
  ctx.strokeStyle = h.color; ctx.lineWidth = 2.5; ctx.setLineDash([10,7])
  ctx.beginPath()
  ctx.moveTo(h.tl.x,h.tl.y); ctx.lineTo(h.tr.x,h.tr.y); ctx.lineTo(h.br.x,h.br.y); ctx.lineTo(h.bl.x,h.bl.y)
  ctx.closePath(); ctx.stroke()
  ctx.setLineDash([5,5]); ctx.beginPath()
  ctx.moveTo(h.rotBase.x,h.rotBase.y); ctx.lineTo(h.rot.x,h.rot.y)
  ctx.stroke(); ctx.setLineDash([])
  ;[h.tl,h.tr,h.bl,h.br].forEach(pt => {
    ctx.beginPath(); ctx.arc(pt.x,pt.y,24,0,Math.PI*2)
    ctx.fillStyle='#ffffff'; ctx.fill()
    ctx.strokeStyle='rgba(0,0,0,0.45)'; ctx.lineWidth=1.5; ctx.stroke()
  })
  ctx.beginPath(); ctx.arc(h.rot.x,h.rot.y,24,0,Math.PI*2)
  ctx.fillStyle=h.color; ctx.fill()
  ctx.strokeStyle='rgba(0,0,0,0.45)'; ctx.lineWidth=1.5; ctx.stroke()
  ctx.restore()
}

export function drawSnapGuides() {
  const { w, h } = FORMATS[S.format]
  const { activeGuides } = flags
  if (!activeGuides.v && !activeGuides.h && !activeGuides.rot) return
  ctx.save()
  ctx.strokeStyle = 'rgba(206,255,0,0.9)'; ctx.lineWidth = 2; ctx.setLineDash([12,8])
  if (activeGuides.v) { ctx.beginPath(); ctx.moveTo(w/2,0); ctx.lineTo(w/2,h); ctx.stroke() }
  if (activeGuides.h) { ctx.beginPath(); ctx.moveTo(0,h/2); ctx.lineTo(w,h/2); ctx.stroke() }
  if (activeGuides.rot) {
    const ld = getActiveLayerData()
    if (!ld) { ctx.restore(); return }
    const len = Math.max(ld.w,ld.h,180) * 0.7
    const ang = ld.rot * Math.PI / 180
    ctx.beginPath()
    ctx.moveTo(ld.x - Math.cos(ang)*len, ld.y - Math.sin(ang)*len)
    ctx.lineTo(ld.x + Math.cos(ang)*len, ld.y + Math.sin(ang)*len)
    ctx.stroke()
  }
  ctx.restore()
}

// anchorX/anchorY = the "text centre" in the current coordinate space.
// In normal mode the ctx is already translated to text centre, so defaults (0,0) are correct.
// In scroll mode the ctx is NOT translated, so the caller must supply the line's own centre.
export function drawLineWithEffect(text, startX, startY, li, now, effectIntensity, maxW, cW, cH, anchorX = 0, anchorY = 0) {
  const needPerChar = S.autoEffect !== 'none' || S.tremolio
  if (!needPerChar) { ctx.fillText(text, startX, startY); return }

  const halfRH = rowH() / 2

  for (let i = 0; i < text.length; i++) {
    const ch = text[i]; if (ch === ' ') continue
    const prefix = text.substring(0, i)
    const charStartX = startX + (i > 0 ? ctx.measureText(prefix).width : 0)
    const cw = ctx.measureText(ch).width
    const charCenterX = charStartX + cw / 2
    const charCenterY = startY + halfRH
    // Position relative to the text anchor — used by direction-based effects
    const relX = charCenterX - anchorX
    const relY = charCenterY - anchorY
    const seed = li * 101 + i + 1
    const r1 = Math.abs(Math.sin(seed * 127.1 + 1.3))
    const r2 = Math.abs(Math.sin(seed * 311.7 + 2.7))
    const r1n = r1 - 0.5, r2n = r2 - 0.5
    const force = S.autoForce * 10 * effectIntensity
    let dx = 0, dy = 0, rot = 0, sx = 1, sy = 1, alpha = 1, customDraw = false

    switch (S.autoEffect) {
      case 'explode': {
        const d = Math.sqrt(relX ** 2 + relY ** 2) || 1
        dx = (relX / d) * force * (0.5 + r1)
        dy = (relY / d) * force * (0.5 + r2)
        rot = r1n * effectIntensity * (S.autoForce / 5); break
      }
      case 'glitch':  { dx = r1n * force; dy = r2n * force * 0.3; break }
      case 'wave':    { dy = Math.sin(relX * 0.015 + now * 0.003) * force; break }
      case 'vortex':  {
        dx = -relY * 0.05 * force
        dy =  relX * 0.05 * force
        rot = effectIntensity * (S.autoForce / 10); break
      }
      case 'bounce':  { const st = ((relX + maxW / 2) / maxW) * 0.4; dy = -Math.abs(Math.sin((now * 0.01 + st) * Math.PI)) * force * 2; break }
      case 'scatter': { dx = r1n * S.fontSize * effectIntensity * (S.autoForce / 3); dy = r2n * S.fontSize * effectIntensity * (S.autoForce / 3); alpha = 1 - effectIntensity * 0.6; break }
      case 'shake':   { dx = Math.sin(now * 0.08 + i * 37.1) * S.autoForce * 5 * effectIntensity; dy = Math.sin(now * 0.11 + i * 13.7) * S.autoForce * 3 * effectIntensity; break }
      case 'spin':    { rot = effectIntensity * Math.PI * 2 * (S.autoForce / 5) * (r1 > 0.5 ? 1 : -1); break }
      case 'float':   { dy = -(r1 * 0.5 + 0.5) * force * 2; alpha = Math.max(0, 1 - effectIntensity * 1.5); break }
      case 'rain':    { dy = -(1 - effectIntensity) * cH * 0.4 * (r1 * 0.5 + 0.5); alpha = effectIntensity; break }
      case 'zoom':    { const zf = 1 + effectIntensity * (S.autoForce / 4); sx = zf; sy = zf; break }
      case 'chromatic': {
        customDraw = true
        const off = effectIntensity * S.autoForce * 4
        const sa = ctx.globalAlpha, sf = ctx.fillStyle
        ctx.globalAlpha = sa * 0.65
        ctx.fillStyle = '#ff3333'; ctx.save(); ctx.translate(charCenterX - off, charCenterY); ctx.fillText(ch, -cw / 2, -halfRH); ctx.restore()
        ctx.fillStyle = '#33ffff'; ctx.save(); ctx.translate(charCenterX + off, charCenterY); ctx.fillText(ch, -cw / 2, -halfRH); ctx.restore()
        ctx.globalAlpha = sa; ctx.fillStyle = sf
        ctx.save(); ctx.translate(charCenterX, charCenterY); ctx.fillText(ch, -cw / 2, -halfRH); ctx.restore()
        break
      }
      case 'cascade': { const st = ((relX + maxW / 2) / maxW) * 0.5; const le = Math.max(0, effectIntensity - st); dy = -Math.sin(le * Math.PI) * force * 2; break }
      case 'flicker': { alpha = Math.random() > effectIntensity * 0.85 ? 1 : 0; break }
    }

    if (S.tremolio) {
      const t = now * S.tremolioSpeed * 0.008
      dx += Math.sin(t + seed * 2.399) * S.tremolioForce
      dy += Math.cos(t + seed * 1.618) * S.tremolioForce
    }

    if (!customDraw) {
      ctx.save()
      if (alpha !== 1) ctx.globalAlpha = Math.max(0, alpha)
      ctx.translate(charCenterX + dx, charCenterY + dy)
      ctx.rotate(rot)
      if (sx !== 1 || sy !== 1) ctx.scale(sx, sy)
      ctx.fillText(ch, -cw / 2, -halfRH)
      ctx.restore()
    }
  }
}

function drawScrollTicker(now, effectIntensity, w, h) {
  const t = activeText()
  const lines = (t.text||'').split('\n').map(l => l.trim()).filter(Boolean)
  const safeLines = lines.length ? lines : ['']
  const rh = rowH()
  const bh = safeLines.length * rh + S.scrollGapV
  if (bh <= 0) return

  ctx.font = fontStr(S.fontSize, t.fontFamily)
  if ('letterSpacing' in ctx) ctx.letterSpacing = S.kerning + 'px'
  ctx.fillStyle = t.textColor
  ctx.textBaseline = 'top'
  ctx.textAlign = 'left'

  const lineWidths = safeLines.map(l => {
    const m = ctx.measureText(l||' ')
    const hasB = typeof m.actualBoundingBoxLeft === 'number'
    return hasB ? m.actualBoundingBoxLeft + m.actualBoundingBoxRight : m.width
  })
  const maxW = Math.max(...lineWidths, 1)
  const availW = w - S.compPadL - S.compPadR

  const scrollOffset = S.scrollDirection === 'up' ? S.scrollY : -S.scrollY
  const phase = ((scrollOffset % bh) + bh) % bh
  const numBlocks = Math.ceil(h / bh) + 2

  for (let bi = 0; bi < numBlocks; bi++) {
    const blockY = -phase + bi * bh
    for (let li = 0; li < safeLines.length; li++) {
      const line = safeLines[li]
      const y = blockY + li * rh
      ctx.font = fontStr(S.fontSize, t.fontFamily)
      if ('letterSpacing' in ctx) ctx.letterSpacing = S.kerning + 'px'
      ctx.fillStyle = t.textColor

      const halfRH = rowH() / 2
      if (S.scrollTileMode === 'grid') {
        const N = Math.max(1, S.scrollReps)
        const advW = ctx.measureText(line).width
        const unit = advW + S.scrollWordGap
        for (let xi = 0; xi < N; xi++) {
          const gx = S.compPadL + xi * unit
          // Anchor = centre of this grid cell
          drawLineWithEffect(line, gx, y, li, now, effectIntensity, maxW, w, h, gx + advW / 2, y + halfRH)
        }
      } else {
        const lw = lineWidths[li]
        const align = t.align
        let x
        if (align === 'left')       x = S.compPadL
        else if (align === 'right') x = S.compPadL + availW - lw
        else                        x = S.compPadL + availW / 2 - lw / 2
        // Anchor = horizontal centre of this line
        drawLineWithEffect(line, x, y, li, now, effectIntensity, maxW, w, h, x + lw / 2, y + halfRH)
      }
    }
  }
}

export function drawFrame(simNow) {
  const { w, h } = FORMATS[S.format]
  ctx.clearRect(0, 0, w, h)

  ctx.save()
  ctx.translate(w/2,h/2); ctx.scale(S.globalScale,S.globalScale); ctx.translate(-w/2,-h/2)
  ctx.beginPath(); ctx.rect(0,0,w,h); ctx.clip()

  const iw = w - S.compPadL - S.compPadR, ih = h - S.compPadT - S.compPadB
  ctx.save()
  ctx.fillStyle = S.bgColor
  if (S.bgCornerRadius > 0) {
    ctx.beginPath(); ctx.roundRect(S.compPadL,S.compPadT,iw,ih,S.bgCornerRadius); ctx.fill(); ctx.clip()
  } else {
    ctx.fillRect(S.compPadL,S.compPadT,iw,ih)
    ctx.beginPath(); ctx.rect(S.compPadL,S.compPadT,iw,ih); ctx.clip()
  }

  const now = simNow !== undefined ? simNow : performance.now()
  S.frameCount++

  if (S.autoEffect !== 'none' && (now - flags.lastAutoTriggerTime > S.autoDelay)) {
    flags.lastAutoTriggerTime += S.autoDelay
    if (now - flags.lastAutoTriggerTime > S.autoDelay) flags.lastAutoTriggerTime = now
  }
  const tsk = now - flags.lastAutoTriggerTime
  let effectIntensity = 0
  if (S.autoEffect !== 'none' && tsk < S.effectDuration) {
    const p = tsk / S.effectDuration
    const env = p < 0.5 ? applyEasing(p*2, S.easingIn) : 1 - applyEasing((p-0.5)*2, S.easingOut)
    effectIntensity = Math.max(0, env)
  }

  if (rainEngine) {
    const rainDt = simNow !== undefined ? 1000/S.fps : 1000/60
    Matter.Engine.update(rainEngine, rainDt * rainSpeed)
  }

  if (S.scrollMode) {
    drawScrollTicker(now, effectIntensity, w, h)
    S.scrollY += S.scrollSpeed
  } else {
    ctx.font = fontStr(S.fontSize, activeText().fontFamily)
    if ('letterSpacing' in ctx) ctx.letterSpacing = S.kerning + 'px'
    for (const t of S.texts) {
      const lines = (t.text||'').split('\n').map(l => l.trim()).filter(Boolean)
      const safeLines = lines.length ? lines : ['']
      const rh = rowH()
      const totalH = rh * safeLines.length
      ctx.font = fontStr(S.fontSize, t.fontFamily)
      if ('letterSpacing' in ctx) ctx.letterSpacing = S.kerning + 'px'
      const lineWidths = safeLines.map(l => {
        const m = ctx.measureText(l||' ')
        const hasB = typeof m.actualBoundingBoxLeft === 'number'
        return hasB ? m.actualBoundingBoxLeft + m.actualBoundingBoxRight : m.width
      })
      const maxW = Math.max(...lineWidths, 1)
      t._bboxW = maxW; t._bboxH = totalH

      const cx = t.textXPct/100*w, cy = t.textYPct/100*h
      ctx.save()
      ctx.translate(cx, cy); ctx.rotate(t.textRotation * Math.PI/180); ctx.scale(t.textScale, t.textScale)
      ctx.fillStyle = t.textColor
      ctx.font = fontStr(S.fontSize, t.fontFamily)
      if ('letterSpacing' in ctx) ctx.letterSpacing = S.kerning + 'px'
      ctx.textBaseline = 'top'; ctx.textAlign = 'left'
      safeLines.forEach((line, li) => {
        const y = -totalH/2 + li*rh
        const lw = lineWidths[li]
        let x
        if (t.align === 'center')     x = -lw/2
        else if (t.align === 'right') x = maxW/2 - lw
        else                          x = -maxW/2
        drawLineWithEffect(line, x, y, li, now, effectIntensity, maxW, w, h)
      })
      ctx.restore()
    }
  }

  if (S.image) {
    const img = S.image
    const fit = Math.min(w*0.7/img.width, h*0.7/img.height) * S.imgScale
    const iw2 = img.width*fit, ih2 = img.height*fit
    const ix = S.imgXPct/100*w, iy = S.imgYPct/100*h
    ctx.save()
    ctx.globalAlpha = S.imgOpacity
    ctx.translate(ix, iy); ctx.rotate(S.imgRotation * Math.PI/180)
    if (S.imgCornerRadius > 0) {
      ctx.beginPath(); ctx.roundRect(-iw2/2,-ih2/2,iw2,ih2,S.imgCornerRadius); ctx.clip()
    }
    ctx.drawImage(img, -iw2/2, -ih2/2, iw2, ih2)
    ctx.restore()
  }

  if (rainEngine) {
    Matter.Composite.allBodies(rainEngine.world).filter(b => !b.isStatic).forEach(body => {
      const el = body._imgEl
      if (!el || !el.complete || el.naturalWidth === 0) return
      ctx.save()
      ctx.translate(body.position.x, body.position.y); ctx.rotate(body.angle)
      ctx.drawImage(el, -body._hw, -body._hh, body._hw*2, body._hh*2)
      ctx.restore()
    })
  }

  ctx.restore()

  if (rainEngine && rainTextCollision) syncRainTextBodies(w, h)

  for (const l of S.lotties) {
    const lc = l.container.querySelector('canvas')
    if (!lc || lc.width === 0) continue
    const outW = l.animW*l.scale, outH = l.animH*l.scale
    const lx = l.xPct/100*w, ly = l.yPct/100*h
    ctx.save()
    ctx.globalAlpha = l.opacity
    ctx.translate(lx, ly); ctx.rotate((l.rotation||0) * Math.PI/180)
    ctx.drawImage(lc, -outW/2, -outH/2, outW, outH)
    ctx.restore()
  }

  const scrollHidesText = S.scrollMode && S.activeLayer.type === 'text'
  if (!flags.hideTransformHandles && !scrollHidesText) drawHandlesOnCtx()
  if (!scrollHidesText) drawSnapGuides()

  ctx.restore()
}

export function loop() {
  if (!flags.isPaused) drawFrame()
  requestAnimationFrame(loop)
}
