import { FORMATS } from './constants.js'
import { S, makeTextLayer } from './state.js'
import { recalcFont } from './canvas.js'
import { updateRainWalls } from './rain.js'
import { syncTextUI } from './text.js'
import { updateColor } from './color.js'
import { triggerDownload } from './export.js'

// ── Format ────────────────────────────────────────────────────────────────────

export function setFormat(fmt) {
  S.format = fmt
  const { w, h } = FORMATS[fmt]
  const canvas = document.getElementById('canvas')
  canvas.width = w; canvas.height = h
  document.getElementById('fmt-badge').textContent = `${w} × ${h}`
  document.querySelectorAll('.fmt-btn').forEach(b => b.classList.toggle('active', b.dataset.fmt === fmt))
  recalcFont()
  updateRainWalls()
}

document.querySelectorAll('.fmt-btn').forEach(b => b.addEventListener('click', () => setFormat(b.dataset.fmt)))

// ── Generic range binding ─────────────────────────────────────────────────────

export function bindRange(id, key, valId, parse) {
  const el = document.getElementById(id), ve = document.getElementById(valId)
  el.addEventListener('input', () => {
    S[key] = parse(el.value)
    const v = parseFloat(el.value)
    ve.textContent = Number.isInteger(v) ? v : v.toFixed(parseFloat(el.step) < 0.1 ? 2 : 1)
    recalcFont()
  })
}

bindRange('kerning',       'kerning',        'kerning-v',         v => parseFloat(v))
bindRange('lh',            'lineHeight',     'lh-v',              v => parseFloat(v))
bindRange('img-scale',     'imgScale',       'img-scale-v',       v => parseFloat(v))
bindRange('img-x',         'imgXPct',        'img-x-v',           v => parseFloat(v))
bindRange('img-y',         'imgYPct',        'img-y-v',           v => parseFloat(v))
bindRange('img-rotation',  'imgRotation',    'img-rotation-v',    v => parseFloat(v))
bindRange('img-opacity',   'imgOpacity',     'img-opacity-v',     v => parseFloat(v))
bindRange('img-corner-radius', 'imgCornerRadius', 'img-corner-radius-v', v => parseInt(v))
bindRange('global-scale',  'globalScale',    'global-scale-v',    v => parseFloat(v))
bindRange('bg-corner-radius','bgCornerRadius','bg-corner-radius-v',v => parseInt(v))
bindRange('duration',      '_dur',           'duration-v',        v => parseInt(v))
bindRange('fps',           'fps',            'fps-v',             v => parseInt(v))
bindRange('autoDelay',     'autoDelay',      'autoDelay-v',       v => parseInt(v))
bindRange('autoForce',     'autoForce',      'autoForce-v',       v => parseFloat(v))
bindRange('effectDuration','effectDuration', 'effectDuration-v',  v => parseInt(v))
bindRange('tremolio-force','tremolioForce',  'tremolio-force-v',  v => parseFloat(v))
bindRange('tremolio-speed','tremolioSpeed',  'tremolio-speed-v',  v => parseFloat(v))

document.getElementById('comp-pad-all').addEventListener('input', function() {
  const v = parseInt(this.value)
  S.compPadL = S.compPadR = S.compPadT = S.compPadB = v
  document.getElementById('comp-pad-all-v').textContent = v; recalcFont()
})

document.getElementById('tremolio-toggle').addEventListener('click', function() {
  S.tremolio = !S.tremolio
  this.textContent = S.tremolio ? 'ON' : 'OFF'
  this.classList.toggle('border-[#CEFF00]', S.tremolio)
  this.classList.toggle('text-[#CEFF00]', S.tremolio)
  const tc = document.getElementById('tremolio-controls')
  tc.style.display = S.tremolio ? 'flex' : 'none'; tc.style.flexDirection = 'column'
})

document.getElementById('autoEffect').addEventListener('change', e => { S.autoEffect = e.target.value })
document.getElementById('easingIn').addEventListener('change',   e => { S.easingIn   = e.target.value })
document.getElementById('easingOut').addEventListener('change',  e => { S.easingOut  = e.target.value })

document.querySelectorAll('.speed-preset').forEach(btn => {
  btn.addEventListener('click', () => {
    S.effectDuration = parseInt(btn.dataset.ms)
    document.getElementById('effectDuration').value = S.effectDuration
    document.getElementById('effectDuration-v').textContent = S.effectDuration
    document.querySelectorAll('.speed-preset').forEach(b => b.classList.remove('active'))
    btn.classList.add('active')
  })
})

// ── Preset save / load ────────────────────────────────────────────────────────

const PRESET_KEYS = ['format','kerning','lineHeight','fps','bgColor',
  'imgScale','imgOpacity','imgCornerRadius','autoEffect','autoDelay','autoForce','effectDuration',
  'easingIn','easingOut','tremolio','tremolioForce','tremolioSpeed',
  'globalScale','compPadL','compPadR','compPadT','compPadB','bgCornerRadius','currentFont']

function savePreset() {
  const name = document.getElementById('preset-name').value.trim() || 'preset'
  const data = { _name:name }
  PRESET_KEYS.forEach(k => { data[k] = S[k] })
  data.texts = S.texts; data.activeTextId = S.activeTextId
  const blob = new Blob([JSON.stringify(data, null, 2)], { type:'application/json' })
  const url = URL.createObjectURL(blob)
  triggerDownload(url, name.replace(/\s+/g,'_') + '.json')
  setTimeout(() => URL.revokeObjectURL(url), 10000)
}

function applyPreset(data) {
  PRESET_KEYS.forEach(k => { if (k in data) S[k] = data[k] })
  if (Array.isArray(data.texts) && data.texts.length) {
    S.texts = data.texts.map(t => ({
      ...makeTextLayer(''), ...t,
      id: t.id || makeTextLayer('').id,
      text: t.text || '',
      align: t.align || 'center',
      textColor: t.textColor || '#F7F6EB',
      fontFamily: t.fontFamily || S.currentFont,
    }))
    S.activeTextId = (data.activeTextId && S.texts.some(t => t.id === data.activeTextId)) ? data.activeTextId : S.texts[0].id
  } else {
    const legacy = makeTextLayer(data.text || 'DESIGN BOMB!!!')
    legacy.align = data.align || 'center'
    legacy.textColor = data.textColor || '#F7F6EB'
    legacy.fontFamily = data.currentFont || S.currentFont
    legacy.textXPct = ('textXPct' in data) ? data.textXPct : 50
    legacy.textYPct = ('textYPct' in data) ? data.textYPct : 50
    legacy.textScale = ('textScale' in data) ? data.textScale : 1
    legacy.textRotation = ('textRotation' in data) ? data.textRotation : 0
    S.texts = [legacy]; S.activeTextId = legacy.id
  }

  const rmap = {
    'kerning':'kerning-v','lh':'lh-v','img-scale':'img-scale-v','img-opacity':'img-opacity-v',
    'img-corner-radius':'img-corner-radius-v','fps':'fps-v','autoDelay':'autoDelay-v',
    'autoForce':'autoForce-v','effectDuration':'effectDuration-v',
    'tremolio-force':'tremolio-force-v','tremolio-speed':'tremolio-speed-v',
    'global-scale':'global-scale-v','comp-pad-all':'comp-pad-all-v','bg-corner-radius':'bg-corner-radius-v'
  }
  const smap = {
    'kerning':'kerning','lh':'lineHeight','img-scale':'imgScale','img-opacity':'imgOpacity',
    'img-corner-radius':'imgCornerRadius','fps':'fps','autoDelay':'autoDelay','autoForce':'autoForce',
    'effectDuration':'effectDuration','tremolio-force':'tremolioForce','tremolio-speed':'tremolioSpeed',
    'global-scale':'globalScale','comp-pad-all':'compPadL','bg-corner-radius':'bgCornerRadius'
  }
  Object.keys(rmap).forEach(id => {
    const el = document.getElementById(id), ve = document.getElementById(rmap[id])
    if (!el || !ve) return
    const v = S[smap[id]]; if (v == null) return
    el.value = v; ve.textContent = Number.isInteger(v) ? v : v.toFixed(Number.isInteger(parseFloat(el.step)) ? 1 : 2)
  })
  ;['autoEffect','easingIn','easingOut'].forEach(id => { const el = document.getElementById(id); if (el) el.value = S[id] })
  if (S.currentFont) {
    const fs = document.getElementById('font-select')
    if (fs && [...fs.options].some(o => o.value === S.currentFont)) fs.value = S.currentFont
  }
  document.querySelectorAll('.fmt-btn').forEach(b => b.classList.toggle('active', b.dataset.fmt === S.format))
  updateColor('bg', S.bgColor); syncTextUI()
  const tt = document.getElementById('tremolio-toggle')
  if (tt) {
    tt.textContent = S.tremolio ? 'ON' : 'OFF'
    tt.classList.toggle('border-[#CEFF00]', S.tremolio)
    tt.classList.toggle('text-[#CEFF00]', S.tremolio)
    const tc = document.getElementById('tremolio-controls')
    if (tc) { tc.style.display = S.tremolio ? 'flex' : 'none'; tc.style.flexDirection = 'column' }
  }
  setFormat(S.format); recalcFont(); syncTextUI()
}

document.getElementById('preset-save-btn').addEventListener('click', savePreset)

document.getElementById('preset-load-input').addEventListener('change', function() {
  const file = this.files[0]; if (!file) return
  const reader = new FileReader()
  reader.onload = e => {
    try {
      const data = JSON.parse(e.target.result); applyPreset(data)
      document.getElementById('preset-status').textContent = 'Preset "' + (data._name || file.name) + '" caricato'
      setTimeout(() => document.getElementById('preset-status').textContent = '', 3000)
      if (data._name) document.getElementById('preset-name').value = data._name
    } catch { document.getElementById('preset-status').textContent = 'File non valido' }
  }
  reader.readAsText(file); this.value = ''
})

// ── Drawers ───────────────────────────────────────────────────────────────────

const colorDrawer   = document.getElementById('color-drawer')
const stickerDrawer = document.getElementById('sticker-drawer')
const formatDrawer  = document.getElementById('format-drawer')
const imageDrawer   = document.getElementById('image-drawer')

function toggleDrawer(drawer) {
  const drawers = [colorDrawer, stickerDrawer, formatDrawer, imageDrawer]
  drawers.forEach(d => {
    if (d !== drawer && d.classList.contains('open')) {
      d.classList.remove('open')
      setTimeout(() => { d.hidden = true }, 350)
    }
  })
  const isOpen = drawer.classList.contains('open')
  if (!isOpen) {
    drawer.hidden = false
    if (drawer === imageDrawer)   S.activeLayer = { type:'image',  id:'bgImage' }
    if (drawer === stickerDrawer) S.activeLayer = { type:'lottie', id:S.activeLottieIdx }
    setTimeout(() => drawer.classList.add('open'), 10)
  } else {
    drawer.classList.remove('open')
    setTimeout(() => { if (!drawer.classList.contains('open')) drawer.hidden = true }, 350)
  }
}

function closeDrawer(drawer) {
  drawer.classList.remove('open')
  setTimeout(() => { drawer.hidden = true }, 350)
}

document.getElementById('desktop-color-btn')?.addEventListener('click',  () => toggleDrawer(colorDrawer))
document.getElementById('close-color-drawer')?.addEventListener('click',  () => closeDrawer(colorDrawer))
document.getElementById('desktop-sticker-btn')?.addEventListener('click', () => toggleDrawer(stickerDrawer))
document.getElementById('close-sticker-drawer')?.addEventListener('click',() => closeDrawer(stickerDrawer))
document.getElementById('desktop-format-btn')?.addEventListener('click',  () => toggleDrawer(formatDrawer))
document.getElementById('close-format-drawer')?.addEventListener('click', () => closeDrawer(formatDrawer))
document.getElementById('desktop-image-btn')?.addEventListener('click',   () => toggleDrawer(imageDrawer))
document.getElementById('close-image-drawer')?.addEventListener('click',  () => closeDrawer(imageDrawer))

// ── Mobile sidebar ────────────────────────────────────────────────────────────

;(function setupMobileControls() {
  const app       = document.querySelector('.app')
  const sidebar   = document.getElementById('controls')
  const toggleBtn = document.getElementById('mobile-controls-toggle')
  const backdrop  = document.getElementById('mobile-backdrop')
  if (!app || !sidebar || !toggleBtn || !backdrop) return

  const mq = window.matchMedia('(max-width: 860px)')

  function setOpen(open) {
    app.classList.toggle('mobile-controls-open', open)
    toggleBtn.setAttribute('aria-expanded', open ? 'true' : 'false')
    toggleBtn.textContent = open ? 'Chiudi controlli' : 'Controlli'
    backdrop.hidden = !open
    document.body.classList.toggle('mobile-ui-lock', open && mq.matches)
  }

  function syncByViewport() {
    if (!mq.matches) { setOpen(false); toggleBtn.style.display = 'none' }
    else toggleBtn.style.display = 'inline-flex'
  }

  toggleBtn.addEventListener('click', () => setOpen(!app.classList.contains('mobile-controls-open')))
  backdrop.addEventListener('click', () => setOpen(false))
  window.addEventListener('keydown', e => { if (e.key === 'Escape' && app.classList.contains('mobile-controls-open')) setOpen(false) })
  mq.addEventListener('change', syncByViewport)
  syncByViewport()
})()
