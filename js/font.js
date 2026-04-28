import { BUNDLED_FONTS } from './constants.js'
import { S, activeText } from './state.js'
import { recalcFont } from './canvas.js'

export const loadedFonts = []
export let uploadedFontCount = 0

export function setFontStatus(msg, color) {
  const el = document.getElementById('font-status-msg')
  if (el) { el.textContent = msg; el.style.color = color || '#737373' }
}

export function addFontToSelect(family, label) {
  if (loadedFonts.find(f => f.family === family)) return
  loadedFonts.push({ family, label })
  const sel = document.getElementById('font-select')
  const opt = document.createElement('option')
  opt.value = family; opt.textContent = label; sel.appendChild(opt)
}

// Inject @font-face for bundled fonts
BUNDLED_FONTS.forEach(f => {
  const s = document.createElement('style')
  s.textContent = `@font-face{font-family:'${f.family}';src:url('${f.file}');font-weight:900;font-style:italic;}`
  document.head.appendChild(s)
})

// Load bundled fonts
Promise.all(BUNDLED_FONTS.map(f => document.fonts.load(`900 italic 12px '${f.family}'`).catch(() => []))).then(() => {
  BUNDLED_FONTS.forEach(f => {
    if (document.fonts.check(`900 italic 12px '${f.family}'`)) addFontToSelect(f.family, f.label)
  })
  if (loadedFonts.length > 0) {
    const match = loadedFonts.find(f => f.family === S.currentFont) || loadedFonts[0]
    S.currentFont = match.family; S.fontLoaded = true
    setFontStatus(match.label + ' caricato', '#31A362')
    document.getElementById('font-select').value = S.currentFont
    recalcFont()
  } else {
    setFontStatus('Nessun font trovato — carica manualmente', '#F0C500')
  }
})

async function handleFontFile(file) {
  if (!file) return
  if (!['.ttf','.otf','.woff','.woff2'].some(e => file.name.toLowerCase().endsWith(e))) return
  try {
    const familyName = `uploaded-font-${uploadedFontCount++}`
    const face = new FontFace(familyName, await file.arrayBuffer(), { weight:'900', style:'italic' })
    await face.load(); document.fonts.add(face)
    const label = file.name.replace(/\.[^.]+$/, '')
    addFontToSelect(familyName, label)
    document.getElementById('font-select').value = familyName
    S.currentFont = familyName; S.fontLoaded = true
    activeText().fontFamily = familyName
    setFontStatus(label + ' caricato', '#31A362'); recalcFont()
  } catch { setFontStatus('Errore caricamento font', '#FF3EBA') }
}

// ── Event listeners ───────────────────────────────────────────────────────────

document.getElementById('font-select').addEventListener('change', e => {
  S.currentFont = e.target.value
  activeText().fontFamily = e.target.value
  recalcFont()
})

const fontZone  = document.getElementById('font-zone')
const fontInput = document.getElementById('font-input')
fontZone.addEventListener('dragover',  e => { e.preventDefault(); fontZone.classList.add('drag') })
fontZone.addEventListener('dragleave', () => fontZone.classList.remove('drag'))
fontZone.addEventListener('drop',      e => { e.preventDefault(); fontZone.classList.remove('drag'); handleFontFile(e.dataTransfer.files[0]) })
fontInput.addEventListener('change',   () => { handleFontFile(fontInput.files[0]); fontInput.value = '' })
