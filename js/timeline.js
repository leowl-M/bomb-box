import { S, flags } from './state.js'
import { FORMATS } from './constants.js'
import { drawFrame } from './renderer.js'
import { canvas, ctx } from './canvas.js'
import { restoreLottiesFromSnapshot } from './lottie.js'
import { getRainState, setRainState, rebuildRainStickerList } from './rain.js'

export const TL = {
  scenes: [],
  activeIdx: 0,
  isPlaying: false,
  isLooping: false,
}

let _playStartTime = 0
let _playRaf = null
let _lastPlaySceneIdx = -1

const _transOffscreen = document.createElement('canvas')
let _transBuffer = null
let _transType = 'none'
let _transDuration = 0
let _transStart = 0

let _dragSourceIdx = -1
let _openPopupEl = null
let _openPopupCleanup = null

// ── History (undo / redo) ─────────────────────────────────────────────────────

const _history = []
let _historyPtr = -1
let _projectModified = false

function _cloneScenes() {
  return TL.scenes.map(s => ({
    ...s,
    transition: { ...s.transition },
    state: {
      ...s.state,
      texts:   (s.state.texts   || []).map(t => ({ ...t })),
      lotties: (s.state.lotties || []).map(l => ({ ...l })),
    }
  }))
}

function _pushHistory() {
  _history.splice(_historyPtr + 1)
  _history.push({ scenes: _cloneScenes(), activeIdx: TL.activeIdx })
  if (_history.length > 25) _history.shift()
  _historyPtr = _history.length - 1
  _projectModified = true
  _updateUndoRedoBtns()
}

function _updateUndoRedoBtns() {
  const u = document.getElementById('tl-undo-btn')
  const r = document.getElementById('tl-redo-btn')
  if (u) u.disabled = _historyPtr <= 0
  if (r) r.disabled = _historyPtr >= _history.length - 1
}

function _restoreHistory(entry) {
  TL.scenes = entry.scenes.map(s => ({
    ...s,
    transition: { ...s.transition },
    state: {
      ...s.state,
      texts:   (s.state.texts   || []).map(t => ({ ...t })),
      lotties: (s.state.lotties || []).map(l => ({ ...l })),
    }
  }))
  TL.activeIdx = Math.min(entry.activeIdx, TL.scenes.length - 1)
  TL.isPlaying = false
  restoreSceneState(TL.scenes[TL.activeIdx].state)
  flags.lastAutoTriggerTime = -Infinity
  renderTimelineUI()
  _updateUndoRedoBtns()
}

function _undo() {
  if (_historyPtr <= 0) return
  _historyPtr--
  _restoreHistory(_history[_historyPtr])
}

function _redo() {
  if (_historyPtr >= _history.length - 1) return
  _historyPtr++
  _restoreHistory(_history[_historyPtr])
}

function _autoSave() {
  if (!TL.scenes.length) return
  try {
    localStorage.setItem('bombbox_autosave', JSON.stringify({ version: 1, scenes: TL.scenes, savedAt: Date.now() }))
  } catch {}
}

const TRANS_ICONS = {
  none: '·', fade: '◎',
  'zoom-in': '⊕', 'zoom-out': '⊖',
  'slide-r': '→', 'slide-l': '←',
  'slide-d': '↓', 'slide-u': '↑',
}
const TRANS_NAMES = {
  none: 'Nessuna', fade: 'Fade',
  'zoom-in': 'Zoom In', 'zoom-out': 'Zoom Out',
  'slide-r': 'Slide Dx', 'slide-l': 'Slide Sx',
  'slide-d': 'Slide Giù', 'slide-u': 'Slide Su',
}

function _easeInOut(t) { return t < 0.5 ? 2*t*t : -1+(4-2*t)*t }

export function applyTransitionOverlay(type, progress, buffer) {
  if (!buffer || progress >= 1) return
  const { w, h } = FORMATS[S.format]
  const ease = _easeInOut(progress)
  ctx.save()
  ctx.globalAlpha = Math.max(0, 1 - ease)
  switch (type) {
    case 'fade': ctx.drawImage(buffer, 0, 0); break
    case 'zoom-in': { const sc = 1 + ease * 0.35; ctx.translate(w/2, h/2); ctx.scale(sc, sc); ctx.drawImage(buffer, -w/2, -h/2); break }
    case 'zoom-out': { const sc = 1 - ease * 0.3; ctx.translate(w/2, h/2); ctx.scale(sc, sc); ctx.drawImage(buffer, -w/2, -h/2); break }
    case 'slide-r': ctx.drawImage(buffer, ease * w,  0); break
    case 'slide-l': ctx.drawImage(buffer, -ease * w, 0); break
    case 'slide-d': ctx.drawImage(buffer, 0,  ease * h); break
    case 'slide-u': ctx.drawImage(buffer, 0, -ease * h); break
    default:        ctx.drawImage(buffer, 0, 0)
  }
  ctx.restore()
}

function _drawTransitionOverlay(type, progress) {
  applyTransitionOverlay(type, progress, _transBuffer)
}

// ── Serialization ─────────────────────────────────────────────────────────────

function imageToDataURL(img) {
  if (!img || !img.complete || img.naturalWidth === 0) return null
  try {
    const c = document.createElement('canvas')
    c.width = img.naturalWidth; c.height = img.naturalHeight
    c.getContext('2d').drawImage(img, 0, 0)
    return c.toDataURL('image/jpeg', 0.85)
  } catch { return null }
}

export function snapshotCurrentState() {
  return {
    format: S.format,
    globalScale: S.globalScale,
    bgColor: S.bgColor,
    bgCornerRadius: S.bgCornerRadius,
    fontSize: S.fontSize,
    currentFont: S.currentFont,
    kerning: S.kerning,
    lineHeight: S.lineHeight,
    autoEffect: S.autoEffect,
    autoDelay: S.autoDelay,
    autoForce: S.autoForce,
    effectDuration: S.effectDuration,
    easingIn: S.easingIn,
    easingOut: S.easingOut,
    tremolio: S.tremolio,
    tremolioForce: S.tremolioForce,
    tremolioSpeed: S.tremolioSpeed,
    scrollMode: S.scrollMode,
    scrollSpeed: S.scrollSpeed,
    scrollDirection: S.scrollDirection,
    scrollGapV: S.scrollGapV,
    scrollTileMode: S.scrollTileMode,
    scrollReps: S.scrollReps,
    scrollWordGap: S.scrollWordGap,
    compPadL: S.compPadL,
    compPadR: S.compPadR,
    compPadT: S.compPadT,
    compPadB: S.compPadB,
    fps: S.fps,
    imgXPct: S.imgXPct,
    imgYPct: S.imgYPct,
    imgScale: S.imgScale,
    imgRotation: S.imgRotation,
    imgOpacity: S.imgOpacity,
    imgCornerRadius: S.imgCornerRadius,
    imageSrc: imageToDataURL(S.image),
    texts: S.texts.map(t => ({ ...t })),
    lotties: S.lotties.map(l => ({
      label: l.label,
      animationData: l.animationData || null,
      animW: l.animW,
      animH: l.animH,
      xPct: l.xPct,
      yPct: l.yPct,
      scale: l.scale,
      opacity: l.opacity,
      rotation: l.rotation,
    })),
    rainState: getRainState(),
  }
}

export function restoreSceneState(snap, { skipFormat = false } = {}) {
  Object.assign(S, {
    globalScale: snap.globalScale,
    bgColor: snap.bgColor,
    bgCornerRadius: snap.bgCornerRadius,
    fontSize: snap.fontSize,
    currentFont: snap.currentFont,
    kerning: snap.kerning,
    lineHeight: snap.lineHeight,
    autoEffect: snap.autoEffect,
    autoDelay: snap.autoDelay,
    autoForce: snap.autoForce,
    effectDuration: snap.effectDuration,
    easingIn: snap.easingIn,
    easingOut: snap.easingOut,
    tremolio: snap.tremolio,
    tremolioForce: snap.tremolioForce,
    tremolioSpeed: snap.tremolioSpeed,
    scrollMode: snap.scrollMode,
    scrollSpeed: snap.scrollSpeed,
    scrollDirection: snap.scrollDirection,
    scrollGapV: snap.scrollGapV,
    scrollTileMode: snap.scrollTileMode,
    scrollReps: snap.scrollReps,
    scrollWordGap: snap.scrollWordGap,
    compPadL: snap.compPadL,
    compPadR: snap.compPadR,
    compPadT: snap.compPadT,
    compPadB: snap.compPadB,
    fps: snap.fps,
    imgXPct: snap.imgXPct,
    imgYPct: snap.imgYPct,
    imgScale: snap.imgScale,
    imgRotation: snap.imgRotation,
    imgOpacity: snap.imgOpacity,
    imgCornerRadius: snap.imgCornerRadius,
    texts: snap.texts.map(t => ({ ...t })),
    scrollY: 0,
  })

  if (S.texts.length > 0) {
    S.activeTextId = S.texts[0].id
    S.activeLayer = { type: 'text', id: S.texts[0].id }
  }

  restoreLottiesFromSnapshot(snap.lotties || [], { skipUI: TL.isPlaying })
  setRainState(snap.rainState || null)
  rebuildRainStickerList()

  if (snap.imageSrc) {
    const img = new Image()
    img.src = snap.imageSrc
    S.image = img
  } else {
    S.image = null
  }

  if (!skipFormat && snap.format && snap.format !== S.format) {
    S.format = snap.format
    const { w, h } = FORMATS[snap.format]
    canvas.width = w
    canvas.height = h
    document.getElementById('fmt-badge').textContent = `${w} × ${h}`
  } else if (!skipFormat && snap.format) {
    S.format = snap.format
  }
}

// ── Scene CRUD ────────────────────────────────────────────────────────────────

function makeScene(label, snap) {
  return {
    id: `sc_${Date.now()}_${Math.random().toString(36).slice(2, 5)}`,
    label,
    duration: 3,
    thumbnail: null,
    transition: { type: 'none', duration: 0.4 },
    state: snap,
  }
}

function captureThumbnail() {
  const { w, h } = FORMATS[S.format]
  const thumbW = 90
  const thumbH = Math.round(h / w * thumbW)
  const c = document.createElement('canvas')
  c.width = thumbW; c.height = thumbH
  c.getContext('2d').drawImage(canvas, 0, 0, thumbW, thumbH)
  return c.toDataURL('image/jpeg', 0.7)
}

export function addScene() {
  if (TL.scenes.length > 0) {
    TL.scenes[TL.activeIdx].state = snapshotCurrentState()
    TL.scenes[TL.activeIdx].thumbnail = captureThumbnail()
  }
  _pushHistory()
  const snap = snapshotCurrentState()
  // New scene: inherit visual settings but start with clean rain/stickers
  snap.rainState = {
    effect: snap.rainState?.effect || 'normal',
    speed: 1, modChaos: false, modExplosive: false,
    isLooping: false, textCollision: false,
    imgUrls: [], active: false, amount: 20, size: 60,
  }
  const scene = makeScene(`Scena ${TL.scenes.length + 1}`, snap)
  TL.scenes.push(scene)
  TL.activeIdx = TL.scenes.length - 1
  setRainState(snap.rainState)
  scene.thumbnail = captureThumbnail()
  renderTimelineUI()
}

export function duplicateScene(idx) {
  if (TL.scenes[TL.activeIdx]) TL.scenes[TL.activeIdx].state = snapshotCurrentState()
  _pushHistory()
  const src = TL.scenes[idx]
  const clone = {
    ...src,
    id: `sc_${Date.now()}_${Math.random().toString(36).slice(2, 5)}`,
    label: src.label + ' copy',
    transition: { ...src.transition },
    state: { ...src.state, texts: src.state.texts.map(t => ({ ...t })) },
  }
  TL.scenes.splice(idx + 1, 0, clone)
  selectScene(idx + 1)
}

export function deleteScene(idx) {
  if (TL.scenes.length <= 1) return
  if (TL.scenes[TL.activeIdx]) {
    TL.scenes[TL.activeIdx].state = snapshotCurrentState()
    TL.scenes[TL.activeIdx].thumbnail = captureThumbnail()
  }
  _pushHistory()
  TL.scenes.splice(idx, 1)
  const newIdx = Math.min(idx, TL.scenes.length - 1)
  TL.activeIdx = newIdx
  restoreSceneState(TL.scenes[newIdx].state)
  flags.lastAutoTriggerTime = -Infinity
  renderTimelineUI()
}

export function selectScene(idx) {
  if (TL.scenes[TL.activeIdx]) {
    TL.scenes[TL.activeIdx].state = snapshotCurrentState()
    TL.scenes[TL.activeIdx].thumbnail = captureThumbnail()
  }
  TL.activeIdx = idx
  restoreSceneState(TL.scenes[idx].state)
  flags.lastAutoTriggerTime = -Infinity
  renderTimelineUI()
}

// ── Playback ──────────────────────────────────────────────────────────────────

function getPlayPosition(elapsed) {
  let cumTime = 0
  for (let i = 0; i < TL.scenes.length; i++) {
    const dur = TL.scenes[i].duration * 1000
    if (elapsed < cumTime + dur) return { sceneIdx: i, localTime: elapsed - cumTime, done: false }
    cumTime += dur
  }
  return { sceneIdx: TL.scenes.length - 1, localTime: 0, done: true }
}

export function startPlayback() {
  if (!TL.scenes.length) return
  if (TL.scenes[TL.activeIdx]) TL.scenes[TL.activeIdx].state = snapshotCurrentState()
  TL.isPlaying = true
  flags.isPaused = true
  flags.hideTransformHandles = true
  _playStartTime = performance.now()
  _lastPlaySceneIdx = -1
  restoreSceneState(TL.scenes[0].state)
  S.scrollY = 0
  flags.lastAutoTriggerTime = -Infinity
  renderTimelineUI()
  _tickPlayback()
}

export function stopPlayback() {
  TL.isPlaying = false
  if (_playRaf) { cancelAnimationFrame(_playRaf); _playRaf = null }
  flags.isPaused = false
  flags.hideTransformHandles = false
  const fillEl = document.getElementById('tl-playbar-fill')
  if (fillEl) fillEl.style.width = '0%'
  restoreSceneState(TL.scenes[TL.activeIdx].state)
  flags.lastAutoTriggerTime = -Infinity
  renderTimelineUI()
}

export function rewindPlayback() {
  if (TL.isPlaying) {
    _playStartTime = performance.now()
    _lastPlaySceneIdx = -1
    _transBuffer = null
    restoreSceneState(TL.scenes[0].state)
    S.scrollY = 0
    flags.lastAutoTriggerTime = -Infinity
  } else {
    TL.activeIdx = 0
    restoreSceneState(TL.scenes[0].state)
    flags.lastAutoTriggerTime = -Infinity
    renderTimelineUI()
  }
}

function _tickPlayback() {
  if (!TL.isPlaying) return
  const elapsed = performance.now() - _playStartTime
  const { sceneIdx, localTime, done } = getPlayPosition(elapsed)

  if (done) {
    if (TL.isLooping) {
      _playStartTime = performance.now()
      _lastPlaySceneIdx = -1
      _transBuffer = null
      restoreSceneState(TL.scenes[0].state)
      S.scrollY = 0
      flags.lastAutoTriggerTime = -Infinity
      _playRaf = requestAnimationFrame(_tickPlayback)
      return
    }
    stopPlayback()
    return
  }

  if (sceneIdx !== _lastPlaySceneIdx) {
    const newScene = TL.scenes[sceneIdx]
    const tr = newScene.transition || { type: 'none', duration: 0.4 }
    if (tr.type !== 'none' && tr.duration > 0) {
      _transOffscreen.width = canvas.width
      _transOffscreen.height = canvas.height
      _transOffscreen.getContext('2d').drawImage(canvas, 0, 0)
      _transBuffer = _transOffscreen
      _transType = tr.type
      _transDuration = tr.duration * 1000
      _transStart = elapsed
    } else {
      _transBuffer = null
    }
    _lastPlaySceneIdx = sceneIdx
    TL.activeIdx = sceneIdx
    restoreSceneState(TL.scenes[sceneIdx].state)
    S.scrollY = 0
    flags.lastAutoTriggerTime = -Infinity
    renderTimelineUI()
  }

  drawFrame(localTime)

  if (_transBuffer) {
    const progress = (elapsed - _transStart) / _transDuration
    if (progress < 1) {
      _drawTransitionOverlay(_transType, progress)
    } else {
      _transBuffer = null
    }
  }

  // Update progress bar
  const totalMs = TL.scenes.reduce((s, sc) => s + sc.duration * 1000, 0)
  const fillEl = document.getElementById('tl-playbar-fill')
  if (fillEl) fillEl.style.width = Math.min(100, elapsed / totalMs * 100) + '%'

  // Update active card progress strip
  const activeCard = document.querySelector(`.tl-scene-card[data-idx="${sceneIdx}"]`)
  if (activeCard) {
    const strip = activeCard.querySelector('.tl-scene-progress')
    if (strip) strip.style.width = Math.min(100, localTime / (TL.scenes[sceneIdx].duration * 1000) * 100) + '%'
  }

  _playRaf = requestAnimationFrame(_tickPlayback)
}

// ── Export helper ─────────────────────────────────────────────────────────────

export async function prepareSceneForExport(scene) {
  restoreSceneState(scene.state, { skipFormat: true })
  S.scrollY = 0
  flags.lastAutoTriggerTime = -Infinity
  if (S.image && !S.image.complete) {
    await new Promise(r => { S.image.onload = r; S.image.onerror = r })
  }
}

// ── UI rendering ──────────────────────────────────────────────────────────────

function updateTotalDuration() {
  const el = document.getElementById('tl-total')
  if (el) el.textContent = TL.scenes.reduce((s, sc) => s + sc.duration, 0).toFixed(1) + 's'
}

function _closePopup() {
  if (_openPopupEl) { _openPopupEl.remove(); _openPopupEl = null }
  if (_openPopupCleanup) { _openPopupCleanup(); _openPopupCleanup = null }
}

function _openTransitionPopup(connectorEl, sceneIdx) {
  _closePopup()
  const scene = TL.scenes[sceneIdx]
  if (!scene) return

  const popup = document.createElement('div')
  popup.className = 'tl-trans-popup'

  const title = document.createElement('div')
  title.className = 'tl-trans-popup-title'
  title.textContent = 'Transizione'
  popup.appendChild(title)

  const grid = document.createElement('div')
  grid.className = 'tl-trans-grid'

  Object.entries(TRANS_ICONS).forEach(([type, icon]) => {
    const btn = document.createElement('button')
    btn.className = 'tl-trans-btn' + (type === (scene.transition?.type || 'none') ? ' sel' : '')
    btn.textContent = icon
    btn.title = TRANS_NAMES[type] || type
    btn.addEventListener('click', e => {
      e.stopPropagation()
      if (!TL.scenes[sceneIdx].transition) TL.scenes[sceneIdx].transition = { type: 'none', duration: 0.4 }
      TL.scenes[sceneIdx].transition.type = type
      popup.querySelectorAll('.tl-trans-btn').forEach(b => b.classList.remove('sel'))
      btn.classList.add('sel')
      // Update connector icon and label
      const icon2 = connectorEl.querySelector('.tl-conn-icon')
      const lbl2  = connectorEl.querySelector('.tl-conn-label')
      if (icon2) icon2.textContent = TRANS_ICONS[type]
      if (lbl2)  lbl2.textContent  = type === 'none' ? 'trans' : (TRANS_NAMES[type] || type)
      connectorEl.classList.toggle('has-trans', type !== 'none')
    })
    grid.appendChild(btn)
  })
  popup.appendChild(grid)

  const durRow = document.createElement('div')
  durRow.className = 'tl-trans-dur-row'
  const durLabel = document.createElement('span')
  durLabel.className = 'tl-trans-dur-label'
  durLabel.textContent = 'dur'
  const durInput = document.createElement('input')
  durInput.type = 'number'
  durInput.className = 'tl-trans-dur-input'
  durInput.value = scene.transition?.duration ?? 0.4
  durInput.min = 0.1; durInput.max = 3; durInput.step = 0.1
  durInput.addEventListener('change', e => {
    const v = parseFloat(e.target.value)
    if (v > 0 && TL.scenes[sceneIdx]) TL.scenes[sceneIdx].transition.duration = v
  })
  durInput.addEventListener('click', e => e.stopPropagation())
  durInput.addEventListener('pointerdown', e => e.stopPropagation())
  durRow.appendChild(durLabel); durRow.appendChild(durInput)
  popup.appendChild(durRow)

  document.body.appendChild(popup)
  _openPopupEl = popup

  // Position above connector
  const rect = connectorEl.getBoundingClientRect()
  popup.style.position = 'fixed'
  popup.style.left = (rect.left + rect.width / 2) + 'px'
  popup.style.top = (rect.top - 6) + 'px'
  popup.style.transform = 'translate(-50%, -100%)'

  // Close on outside click
  const onDoc = e => { if (!popup.contains(e.target) && e.target !== connectorEl) { _closePopup() } }
  setTimeout(() => document.addEventListener('click', onDoc), 0)
  _openPopupCleanup = () => document.removeEventListener('click', onDoc)
}

export function renderTimelineUI() {
  const container = document.getElementById('tl-scenes')
  if (!container) return
  container.innerHTML = ''
  _closePopup()

  TL.scenes.forEach((scene, idx) => {
    // ── Connector (shows before each card except first) ───────────────
    if (idx > 0) {
      const tr = scene.transition || { type: 'none', duration: 0.4 }
      const conn = document.createElement('div')
      conn.className = 'tl-connector' + (tr.type !== 'none' ? ' has-trans' : '')
      conn.title = 'Transizione — clicca per cambiare'
      const connIcon = document.createElement('div')
      connIcon.className = 'tl-conn-icon'
      connIcon.textContent = TRANS_ICONS[tr.type] || '·'
      const connLabel = document.createElement('div')
      connLabel.className = 'tl-conn-label'
      connLabel.textContent = tr.type === 'none' ? 'trans' : TRANS_NAMES[tr.type] || tr.type
      conn.appendChild(connIcon)
      conn.appendChild(connLabel)
      conn.addEventListener('click', e => { e.stopPropagation(); _openTransitionPopup(conn, idx) })
      container.appendChild(conn)
    }

    // ── Card ──────────────────────────────────────────────────────────
    const card = document.createElement('div')
    card.className = 'tl-scene-card' + (idx === TL.activeIdx ? ' active' : '')
    card.dataset.idx = idx

    // Drag to reorder
    card.draggable = !TL.isPlaying
    card.addEventListener('dragstart', e => {
      if (TL.isPlaying) { e.preventDefault(); return }
      _dragSourceIdx = idx
      card.classList.add('dragging')
      e.dataTransfer.effectAllowed = 'move'
    })
    card.addEventListener('dragover', e => {
      if (_dragSourceIdx < 0 || _dragSourceIdx === idx) return
      e.preventDefault()
      e.dataTransfer.dropEffect = 'move'
      const rect = card.getBoundingClientRect()
      const insertAfter = e.clientX > rect.left + rect.width / 2
      card.classList.toggle('drag-before', !insertAfter)
      card.classList.toggle('drag-after', insertAfter)
    })
    card.addEventListener('dragleave', () => card.classList.remove('drag-before', 'drag-after'))
    card.addEventListener('drop', e => {
      e.preventDefault()
      if (_dragSourceIdx < 0 || _dragSourceIdx === idx) { card.classList.remove('drag-before', 'drag-after'); return }
      const rect = card.getBoundingClientRect()
      const insertAfter = e.clientX > rect.left + rect.width / 2
      let dstIdx = insertAfter ? idx + 1 : idx
      card.classList.remove('drag-before', 'drag-after')
      if (dstIdx === _dragSourceIdx || dstIdx === _dragSourceIdx + 1) { _dragSourceIdx = -1; return }
      const activeId = TL.scenes[TL.activeIdx]?.id
      if (TL.scenes[TL.activeIdx]) TL.scenes[TL.activeIdx].state = snapshotCurrentState()
      _pushHistory()
      const [moved] = TL.scenes.splice(_dragSourceIdx, 1)
      if (_dragSourceIdx < dstIdx) dstIdx--
      TL.scenes.splice(dstIdx, 0, moved)
      TL.activeIdx = Math.max(0, TL.scenes.findIndex(s => s.id === activeId))
      _dragSourceIdx = -1
      renderTimelineUI()
    })
    card.addEventListener('dragend', () => {
      _dragSourceIdx = -1
      document.querySelectorAll('.tl-scene-card').forEach(c => c.classList.remove('drag-before', 'drag-after', 'dragging'))
    })

    // Thumbnail
    const thumb = document.createElement('div')
    thumb.className = 'tl-scene-thumb'
    if (scene.thumbnail) {
      const img = document.createElement('img')
      img.src = scene.thumbnail
      thumb.appendChild(img)
    }
    // Number badge
    const numBadge = document.createElement('div')
    numBadge.className = 'tl-scene-num'
    numBadge.textContent = idx + 1
    thumb.appendChild(numBadge)
    // Progress strip (shown during playback)
    const progress = document.createElement('div')
    progress.className = 'tl-scene-progress'
    thumb.appendChild(progress)

    // Footer row
    const foot = document.createElement('div')
    foot.className = 'tl-scene-foot'

    const labelEl = document.createElement('div')
    labelEl.className = 'tl-scene-label'
    labelEl.textContent = scene.label
    labelEl.title = 'Doppio click per rinominare'
    labelEl.addEventListener('dblclick', e => {
      e.stopPropagation()
      labelEl.contentEditable = 'true'
      labelEl.focus()
      const range = document.createRange()
      range.selectNodeContents(labelEl)
      window.getSelection().removeAllRanges()
      window.getSelection().addRange(range)
    })
    labelEl.addEventListener('blur', () => {
      labelEl.contentEditable = 'false'
      const newLabel = labelEl.textContent.trim()
      if (newLabel) TL.scenes[idx].label = newLabel
      else labelEl.textContent = TL.scenes[idx].label
    })
    labelEl.addEventListener('keydown', e => {
      if (e.key === 'Enter') { e.preventDefault(); labelEl.blur() }
      if (e.key === 'Escape') { labelEl.textContent = TL.scenes[idx].label; labelEl.blur() }
      e.stopPropagation()
    })
    labelEl.addEventListener('click', e => { if (labelEl.contentEditable === 'true') e.stopPropagation() })
    labelEl.addEventListener('pointerdown', e => { if (labelEl.contentEditable === 'true') e.stopPropagation() })

    const durEl = document.createElement('input')
    durEl.type = 'number'
    durEl.className = 'tl-scene-dur'
    durEl.value = scene.duration
    durEl.min = 0.5; durEl.max = 60; durEl.step = 0.5
    durEl.title = 'Durata (s)'
    durEl.addEventListener('change', e => {
      const v = parseFloat(e.target.value)
      if (v > 0) { TL.scenes[idx].duration = v; updateTotalDuration() }
    })
    durEl.addEventListener('click', e => e.stopPropagation())
    durEl.addEventListener('pointerdown', e => e.stopPropagation())

    foot.appendChild(labelEl)
    foot.appendChild(durEl)

    // Delete button
    const delBtn = document.createElement('button')
    delBtn.className = 'tl-scene-del'
    delBtn.textContent = '×'
    delBtn.title = 'Elimina scena'
    delBtn.addEventListener('click', e => { e.stopPropagation(); deleteScene(idx) })

    card.appendChild(thumb)
    card.appendChild(foot)
    card.appendChild(delBtn)
    card.addEventListener('click', () => { if (!TL.isPlaying) selectScene(idx) })
    container.appendChild(card)
  })

  const playBtn = document.getElementById('tl-play-btn')
  if (playBtn) playBtn.textContent = TL.isPlaying ? '⏹' : '▶'

  const loopBtn = document.getElementById('tl-loop-btn')
  if (loopBtn) loopBtn.classList.toggle('active', TL.isLooping)

  updateTotalDuration()
}

// ── Project save / load ───────────────────────────────────────────────────────

export function saveProject() {
  if (TL.scenes[TL.activeIdx]) {
    TL.scenes[TL.activeIdx].state = snapshotCurrentState()
    TL.scenes[TL.activeIdx].thumbnail = captureThumbnail()
  }
  _projectModified = false
  const blob = new Blob([JSON.stringify({ version: 1, scenes: TL.scenes })], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url; a.download = `bombbox_${Date.now()}.json`
  document.body.appendChild(a); a.click(); document.body.removeChild(a)
  setTimeout(() => URL.revokeObjectURL(url), 5000)
}

export async function loadProject(file) {
  try {
    const data = JSON.parse(await file.text())
    if (!data.scenes?.length) throw new Error('no scenes')
    TL.scenes = data.scenes.map(s => ({
      ...s,
      transition: s.transition || { type: 'none', duration: 0.4 },
    }))
    TL.activeIdx = 0
    TL.isPlaying = false
    restoreSceneState(TL.scenes[0].state)
    flags.lastAutoTriggerTime = -Infinity
    _history.length = 0; _historyPtr = -1
    _pushHistory()
    _projectModified = false
    renderTimelineUI()
    return true
  } catch (err) {
    console.error('loadProject:', err)
    return false
  }
}

// ── Thumbnail auto-refresh ────────────────────────────────────────────────────

function _thumbLoop() {
  if (!TL.isPlaying && TL.scenes.length > 0) {
    const thumb = captureThumbnail()
    TL.scenes[TL.activeIdx].thumbnail = thumb
    const imgEl = document.querySelector(`.tl-scene-card[data-idx="${TL.activeIdx}"] .tl-scene-thumb img`)
    if (imgEl) {
      imgEl.src = thumb
    } else {
      const thumbDiv = document.querySelector(`.tl-scene-card[data-idx="${TL.activeIdx}"] .tl-scene-thumb`)
      if (thumbDiv) {
        const newImg = document.createElement('img'); newImg.src = thumb
        thumbDiv.insertBefore(newImg, thumbDiv.firstChild)
      }
    }
  }
  setTimeout(_thumbLoop, 2000)
}

// ── Init ──────────────────────────────────────────────────────────────────────

export function initTimeline() {
  // Restore autosave if present and < 24 h old
  let restored = false
  try {
    const saved = localStorage.getItem('bombbox_autosave')
    if (saved) {
      const data = JSON.parse(saved)
      const ageH = (Date.now() - (data.savedAt || 0)) / 3_600_000
      if (data.scenes?.length && ageH < 24) {
        TL.scenes = data.scenes.map(s => ({ ...s, transition: s.transition || { type: 'none', duration: 0.4 } }))
        TL.activeIdx = 0
        restored = true
      }
    }
  } catch {}

  if (!restored) {
    TL.scenes.push(makeScene('Scena 1', snapshotCurrentState()))
    TL.activeIdx = 0
  }

  requestAnimationFrame(() => {
    if (TL.scenes.length > 0) {
      restoreSceneState(TL.scenes[0].state)
      TL.scenes[0].thumbnail = captureThumbnail()
    }
    _pushHistory()
    _projectModified = false
    renderTimelineUI()
    if (restored) {
      const toast = document.createElement('div')
      toast.className = 'tl-toast'
      toast.textContent = '✓ Sessione precedente ripristinata'
      document.body.appendChild(toast)
      setTimeout(() => toast.remove(), 3000)
    }
  })

  document.getElementById('tl-add-btn')?.addEventListener('click', addScene)
  document.getElementById('tl-play-btn')?.addEventListener('click', () => {
    TL.isPlaying ? stopPlayback() : startPlayback()
  })
  document.getElementById('tl-dup-btn')?.addEventListener('click', () => duplicateScene(TL.activeIdx))
  document.getElementById('tl-rewind-btn')?.addEventListener('click', rewindPlayback)
  document.getElementById('tl-loop-btn')?.addEventListener('click', () => {
    TL.isLooping = !TL.isLooping
    document.getElementById('tl-loop-btn')?.classList.toggle('active', TL.isLooping)
  })
  document.getElementById('tl-undo-btn')?.addEventListener('click', _undo)
  document.getElementById('tl-redo-btn')?.addEventListener('click', _redo)

  document.getElementById('tl-save-btn')?.addEventListener('click', saveProject)
  document.getElementById('tl-load-input')?.addEventListener('change', async e => {
    const file = e.target.files[0]; if (!file) return
    const ok = await loadProject(file)
    if (!ok) alert('File progetto non valido o corrotto.')
    e.target.value = ''
  })

  document.getElementById('tl-playbar')?.addEventListener('click', e => {
    if (!TL.scenes.length) return
    const bar = e.currentTarget
    const rect = bar.getBoundingClientRect()
    const pct = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width))
    const totalMs = TL.scenes.reduce((s, sc) => s + sc.duration * 1000, 0)
    const seekMs = pct * totalMs
    if (TL.isPlaying) {
      _playStartTime = performance.now() - seekMs
      _lastPlaySceneIdx = -1
      _transBuffer = null
      flags.lastAutoTriggerTime = -Infinity
    } else {
      const { sceneIdx } = getPlayPosition(seekMs)
      if (sceneIdx !== TL.activeIdx) selectScene(sceneIdx)
    }
  })

  document.addEventListener('keydown', e => {
    // ⌘Z / ⌘⇧Z / ⌘Y / ⌘S — always active, even inside inputs
    if (e.metaKey || e.ctrlKey) {
      if (e.key === 'z') { e.preventDefault(); e.shiftKey ? _redo() : _undo(); return }
      if (e.key === 'y') { e.preventDefault(); _redo(); return }
      if (e.key === 's') { e.preventDefault(); saveProject(); return }
    }

    const tag = document.activeElement?.tagName
    const editing = tag === 'INPUT' || tag === 'TEXTAREA' || document.activeElement?.contentEditable === 'true'
    if (editing) return

    switch (e.key) {
      case 'ArrowLeft':
        if (TL.isPlaying) return
        e.preventDefault()
        if (TL.activeIdx > 0) selectScene(TL.activeIdx - 1)
        break
      case 'ArrowRight':
        if (TL.isPlaying) return
        e.preventDefault()
        if (TL.activeIdx < TL.scenes.length - 1) selectScene(TL.activeIdx + 1)
        break
      case ' ':
        e.preventDefault()
        TL.isPlaying ? stopPlayback() : startPlayback()
        break
      case 'Backspace': case 'Delete':
        if (TL.isPlaying) return
        e.preventDefault()
        deleteScene(TL.activeIdx)
        break
      case 'd': case 'D':
        if (TL.isPlaying || e.metaKey || e.ctrlKey) return
        e.preventDefault()
        duplicateScene(TL.activeIdx)
        break
    }
  })

  // Auto-save every 30 s
  setInterval(_autoSave, 30_000)

  // Warn + save on tab close if project was modified
  window.addEventListener('beforeunload', e => {
    _autoSave()
    if (_projectModified) { e.preventDefault(); e.returnValue = '' }
  })

  // Timeline collapse toggle
  const tlBar = document.getElementById('timeline-bar')
  document.getElementById('tl-toggle-btn')?.addEventListener('click', () => {
    const collapsed = tlBar.classList.toggle('collapsed')
    localStorage.setItem('bombbox_tl_collapsed', collapsed ? '1' : '0')
  })
  const savedCollapsed = localStorage.getItem('bombbox_tl_collapsed')
  const isMobile = window.matchMedia('(max-width: 860px)').matches
  if (savedCollapsed === '1' || (savedCollapsed === null && isMobile)) {
    tlBar.classList.add('collapsed')
  }

  setTimeout(_thumbLoop, 2000)
  renderTimelineUI()
}
