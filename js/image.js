import { S } from './state.js'

export function syncImageSliders() {
  if (!S.image) return
  const set = (id, v, dec) => {
    const el = document.getElementById(id); if (!el) return
    el.value = v
    const ve = document.getElementById(id + '-v'); if (ve) ve.textContent = dec != null ? v.toFixed(dec) : v
  }
  set('img-x', S.imgXPct, 0); set('img-y', S.imgYPct, 0)
  set('img-scale', S.imgScale, 2); set('img-rotation', S.imgRotation, 0); set('img-opacity', S.imgOpacity, 2)
}

function handleImageFile(file) {
  if (!file?.type.startsWith('image/')) return
  const reader = new FileReader()
  reader.onload = e => {
    const img = new Image()
    img.onload = () => {
      S.image = img
      document.getElementById('img-thumb').src = e.target.result
      document.getElementById('img-thumb').style.display = 'block'
      ;['img-x-row','img-y-row','img-scale-row','img-rotation-row','img-opacity-row','img-corner-radius-row','remove-img']
        .forEach(id => document.getElementById(id).style.display = 'grid')
      document.getElementById('remove-img').style.display = 'block'
    }
    img.src = e.target.result
  }
  reader.readAsDataURL(file)
}

// ── Event listeners ───────────────────────────────────────────────────────────

const uploadZone = document.getElementById('upload-zone')
const fileInput  = document.getElementById('file-input')
uploadZone.addEventListener('dragover',  e => { e.preventDefault(); uploadZone.classList.add('border-neutral-500','text-neutral-400') })
uploadZone.addEventListener('dragleave', () => uploadZone.classList.remove('border-neutral-500','text-neutral-400'))
uploadZone.addEventListener('drop',      e => { e.preventDefault(); uploadZone.classList.remove('border-neutral-500','text-neutral-400'); handleImageFile(e.dataTransfer.files[0]) })
fileInput.addEventListener('change',     () => { handleImageFile(fileInput.files[0]); fileInput.value = '' })

document.getElementById('remove-img').addEventListener('click', () => {
  S.image = null
  ;['img-thumb','img-x-row','img-y-row','img-scale-row','img-rotation-row','img-opacity-row','img-corner-radius-row','remove-img']
    .forEach(id => document.getElementById(id).style.display = 'none')
})
