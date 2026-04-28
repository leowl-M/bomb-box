import { FORMATS } from './constants.js'

export function makeTextLayer(text = 'DESIGN BOMB!!!') {
  return {
    id: `t${Date.now()}_${Math.random().toString(36).slice(2,7)}`,
    label: 'Testo',
    text,
    align: 'center',
    textColor: '#F7F6EB',
    fontFamily: 'PPFrama-ExtraboldItalic',
    textXPct: 50, textYPct: 50,
    textScale: 1.0, textRotation: 0,
    _bboxW: 0, _bboxH: 0,
  }
}

const _initial = makeTextLayer()

export const S = {
  format: 'post',
  kerning: 0, lineHeight: 1.0, fps: 60,
  bgColor: '#141414',
  image: null, imgScale: 1.0, imgOpacity: 1.0, imgCornerRadius: 0,
  imgXPct: 50, imgYPct: 50, imgRotation: 0,
  fontSize: 100, currentFont: 'PPFrama-ExtraboldItalic', fontLoaded: false,
  paletteTarget: 'bg',
  autoEffect: 'none', autoDelay: 1000, autoForce: 5.0, effectDuration: 600,
  easingIn: 'easeInOut', easingOut: 'easeInOut',
  tremolio: false, tremolioForce: 3.0, tremolioSpeed: 1.0,
  frameCount: 0,
  lotties: [], activeLottieIdx: -1,
  texts: [_initial],
  activeTextId: _initial.id,
  activeLayer: { type: 'text', id: _initial.id },
  globalScale: 1.0,
  compPadL: 0, compPadR: 0, compPadT: 0, compPadB: 0,
  bgCornerRadius: 0,
}

// Shared mutable flags — use object so any module can mutate them
export const flags = {
  isPaused: false,
  hideTransformHandles: false,
  lastAutoTriggerTime: -Infinity,
  activeGuides: { v: false, h: false, rot: false },
  _lastHapticAt: 0,
}

export function activeText() {
  let t = S.texts.find(x => x.id === S.activeTextId)
  if (!t) {
    if (!S.texts.length) S.texts.push(makeTextLayer(''))
    t = S.texts[0]
    S.activeTextId = t.id
  }
  return t
}

export function getActiveLayerData() {
  const { w, h } = FORMATS[S.format]
  if (S.activeLayer.type === 'text') {
    const t = activeText()
    return { obj:t, type:'text', x:t.textXPct/100*w, y:t.textYPct/100*h, scale:t.textScale, rot:t.textRotation, w:t._bboxW, h:t._bboxH, color:'#CEFF00' }
  }
  if (S.activeLayer.type === 'lottie' && S.activeLottieIdx >= 0) {
    const l = S.lotties[S.activeLottieIdx]
    return { obj:l, type:'lottie', x:l.xPct/100*w, y:l.yPct/100*h, scale:l.scale, rot:l.rotation||0, w:l.animW, h:l.animH, color:'#5CE0A0' }
  }
  if (S.activeLayer.type === 'image' && S.image) {
    const img = S.image
    const fit = Math.min(w*0.7/img.width, h*0.7/img.height)
    return { obj:img, type:'image', x:S.imgXPct/100*w, y:S.imgYPct/100*h, scale:S.imgScale, rot:S.imgRotation, w:img.width*fit, h:img.height*fit, color:'#7C92FF' }
  }
  return null
}
