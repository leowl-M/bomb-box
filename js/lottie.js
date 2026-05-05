import { S } from './state.js'
import { rainSelectedLottieIdxs, rebuildRainStickerList, buildRainPresetList } from './rain.js'

export function setLottieStatus(msg, color) {
  const el = document.getElementById('lottie-status')
  if (el) { el.textContent = msg; el.style.color = color || '#737373' }
}

export function setActiveLottie(idx) {
  S.activeLottieIdx = idx
  S.activeLayer = { type:'lottie', id:idx }
  document.querySelectorAll('.lottie-item').forEach((el, i) => el.classList.toggle('lottie-active', i === idx))
  const ctrl = document.getElementById('lottie-controls')
  if (idx >= 0) { ctrl.classList.remove('hidden'); syncLottieSliders() }
  else ctrl.classList.add('hidden')
}

export function syncLottieSliders() {
  const l = S.lotties[S.activeLottieIdx]; if (!l) return
  const set = (id, v, dec) => {
    document.getElementById(id).value = v
    document.getElementById(id+'-v').textContent = dec != null ? v.toFixed(dec) : v
  }
  set('lottie-x', l.xPct, 0); set('lottie-y', l.yPct, 0)
  set('lottie-scale', l.scale, 2); set('lottie-opacity', l.opacity, 2)
  document.getElementById('lottie-rotation').value = l.rotation
  document.getElementById('lottie-rotation-v').textContent = l.rotation + '°'
}

export function rebuildLottieList() {
  const list = document.getElementById('lottie-list'); list.innerHTML = ''
  S.lotties.forEach((l, i) => {
    const item = document.createElement('div')
    item.className = 'lottie-item flex items-center gap-2 p-2 bg-neutral-800 border border-neutral-700 rounded-md cursor-pointer transition-colors hover:bg-neutral-700'
    item.dataset.idx = i
    item.innerHTML = `<span class="flex-1 text-xs truncate text-neutral-300">${l.label}</span><button class="lottie-remove shrink-0 text-neutral-500 hover:text-red-400 text-xs px-1 transition-colors" data-idx="${i}">✕</button>`
    item.addEventListener('click', e => { if (!e.target.classList.contains('lottie-remove')) setActiveLottie(i) })
    item.querySelector('.lottie-remove').addEventListener('click', e => { e.stopPropagation(); removeLottie(i) })
    list.appendChild(item)
  })
  if (S.activeLottieIdx >= 0) {
    const items = document.querySelectorAll('.lottie-item')
    if (items[S.activeLottieIdx]) items[S.activeLottieIdx].classList.add('lottie-active')
  }
  rebuildRainStickerList()
}

export function restoreLottiesFromSnapshot(snaps, { skipUI = false } = {}) {
  S.lotties.forEach(l => { try { l.anim.destroy() } catch {} l.container.remove() })
  S.lotties = []
  S.activeLottieIdx = -1
  if (!snaps || !snaps.length) {
    if (!skipUI) { rebuildLottieList(); setActiveLottie(-1) }
    return
  }
  snaps.forEach(snap => {
    if (!snap.animationData || typeof lottie === 'undefined') return
    const container = document.createElement('div')
    container.style.cssText = `position:fixed;top:-9999px;left:-9999px;width:${snap.animW}px;height:${snap.animH}px;pointer-events:none;overflow:hidden;`
    document.body.appendChild(container)
    const anim = lottie.loadAnimation({ container, renderer:'canvas', loop:true, autoplay:true, animationData:snap.animationData })
    S.lotties.push({ anim, container, label:snap.label, animationData:snap.animationData, animW:snap.animW, animH:snap.animH, xPct:snap.xPct, yPct:snap.yPct, scale:snap.scale, opacity:snap.opacity, rotation:snap.rotation })
  })
  if (!skipUI) {
    rebuildLottieList()
    setActiveLottie(S.lotties.length > 0 ? 0 : -1)
  }
}

export function removeLottie(idx) {
  S.lotties[idx].anim.destroy(); S.lotties[idx].container.remove(); S.lotties.splice(idx, 1)
  const next = new Set()
  rainSelectedLottieIdxs.forEach(i => { if (i < idx) next.add(i); else if (i > idx) next.add(i-1) })
  rainSelectedLottieIdxs.clear(); next.forEach(i => rainSelectedLottieIdxs.add(i))
  if (S.activeLottieIdx >= idx) S.activeLottieIdx = Math.max(-1, S.activeLottieIdx-1)
  rebuildLottieList(); setActiveLottie(S.activeLottieIdx)
}

async function loadLottieJSON(file) {
  if (typeof lottie === 'undefined') { setLottieStatus('Lottie non disponibile', '#FF3EBA'); return }
  let data
  try { data = JSON.parse(await file.text()) } catch { setLottieStatus('JSON non valido: ' + file.name, '#FF3EBA'); return }
  const animW = data.w || 400, animH = data.h || 400
  const container = document.createElement('div')
  container.style.cssText = `position:fixed;top:-9999px;left:-9999px;width:${animW}px;height:${animH}px;pointer-events:none;overflow:hidden;`
  document.body.appendChild(container)
  const anim = lottie.loadAnimation({ container, renderer:'canvas', loop:true, autoplay:true, animationData:data })
  anim.addEventListener('error', () => setLottieStatus('Errore animazione: ' + file.name, '#FF3EBA'))
  const label = file.name.replace(/\.json$/i, '')
  S.lotties.push({ anim, container, label, animationData:data, animW, animH, xPct:50, yPct:50, scale:1.0, opacity:1.0, rotation:0 })
  rebuildLottieList(); setActiveLottie(S.lotties.length-1); setLottieStatus(label + ' caricato', '#31A362')
}

async function loadLottieFromURL(url, label) {
  if (typeof lottie === 'undefined') return
  let data
  try { data = await (await fetch(url)).json() } catch { setLottieStatus('Errore: ' + label, '#FF3EBA'); return }
  const animW = data.w || 400, animH = data.h || 400
  const container = document.createElement('div')
  container.style.cssText = `position:absolute;left:-9999px;top:-9999px;pointer-events:none;width:${animW}px;height:${animH}px;`
  document.body.appendChild(container)
  const anim = lottie.loadAnimation({ container, renderer:'canvas', loop:true, autoplay:true, animationData:data })
  anim.addEventListener('error', () => setLottieStatus('Errore: ' + label, '#FF3EBA'))
  S.lotties.push({ anim, container, label, animationData:data, animW, animH, xPct:50, yPct:50, scale:1.0, opacity:1.0, rotation:0 })
  rebuildLottieList(); setActiveLottie(S.lotties.length-1); setLottieStatus(label + ' caricato', '#31A362')
}

// ── Event listeners ───────────────────────────────────────────────────────────

const lottieZone  = document.getElementById('lottie-zone')
const lottieInput = document.getElementById('lottie-input')
lottieZone.addEventListener('dragover',  e => { e.preventDefault(); lottieZone.classList.add('border-neutral-500') })
lottieZone.addEventListener('dragleave', () => lottieZone.classList.remove('border-neutral-500'))
lottieZone.addEventListener('drop', e => {
  e.preventDefault(); lottieZone.classList.remove('border-neutral-500')
  Array.from(e.dataTransfer.files).filter(f => f.name.toLowerCase().endsWith('.json')).forEach(loadLottieJSON)
})
lottieInput.addEventListener('change', () => {
  Array.from(lottieInput.files).forEach(loadLottieJSON); lottieInput.value = ''
})

document.getElementById('lottie-add-btn').addEventListener('click', () => {
  const sel = document.getElementById('lottie-select'), file = sel.value
  if (!file) return
  loadLottieFromURL(`Lottie/${file}`, file.replace(/\.json$/i, ''))
})

;['x','y','scale','opacity','rotation'].forEach(key => {
  const el = document.getElementById(`lottie-${key}`)
  const ve = document.getElementById(`lottie-${key}-v`)
  if (!el || !ve) return
  el.addEventListener('input', () => {
    const l = S.lotties[S.activeLottieIdx]; if (!l) return
    const v = parseFloat(el.value)
    const prop = key==='x' ? 'xPct' : key==='y' ? 'yPct' : key
    l[prop] = v
    ve.textContent = key==='rotation' ? v+'°' : (Number.isInteger(v) ? v : v.toFixed(2))
  })
})

// Load preset list from server or index.json
;(async () => {
  try {
    let files
    const apiRes = await fetch('/api/lotties')
    if (apiRes.ok) { files = await apiRes.json() }
    else { const r = await fetch('Lottie/index.json'); if (!r.ok) return; files = await r.json() }
    files = files.filter(f => f.toLowerCase() !== 'index.json')
    if (!files.length) return
    const row = document.getElementById('lottie-preset-row')
    const sel = document.getElementById('lottie-select')
    row.classList.remove('hidden')
    files.forEach(f => {
      const opt = document.createElement('option')
      opt.value = f; opt.textContent = f.replace(/\.json$/i, '')
      sel.appendChild(opt)
    })
    buildRainPresetList(files)
  } catch {}
})()

// Lottie gallery with lazy-loaded previews
;(function () {
  const sel     = document.getElementById('lottie-select')
  const addBtn  = document.getElementById('lottie-add-btn')
  const row     = document.getElementById('lottie-preset-row')
  const gallery = document.getElementById('lottie-gallery')
  if (!sel || !gallery) return
  const built = new Set()

  function build() {
    ;[...sel.options].forEach(opt => {
      if (!opt.value || built.has(opt.value)) return
      built.add(opt.value); row.classList.remove('hidden')
      const card = document.createElement('button')
      card.type = 'button'; card.className = 'lot-card'; card.title = opt.textContent
      card.innerHTML = `<div class="lot-thumb" data-src="Lottie/${opt.value}"></div><span class="lot-label">${opt.textContent}</span>`
      card.addEventListener('click', () => { sel.value = opt.value; addBtn.click() })
      gallery.appendChild(card)
    })
  }
  new MutationObserver(build).observe(sel, { childList:true }); build()

  const io = new IntersectionObserver(entries => {
    entries.forEach(async entry => {
      if (!entry.isIntersecting) return
      const el = entry.target; if (el.dataset.loaded) return
      el.dataset.loaded = '1'; io.unobserve(el)
      try {
        const res = await fetch(el.dataset.src), data = await res.json()
        if (typeof lottie === 'undefined') return
        lottie.loadAnimation({ container:el, renderer:'svg', loop:true, autoplay:true, animationData:data, rendererSettings:{ preserveAspectRatio:'xMidYMid meet' } })
      } catch {}
    })
  }, { threshold:0.1 })
  new MutationObserver(() => {
    gallery.querySelectorAll('.lot-thumb:not([data-loaded])').forEach(t => io.observe(t))
  }).observe(gallery, { childList:true })
  gallery.querySelectorAll('.lot-thumb').forEach(t => io.observe(t))
})()
