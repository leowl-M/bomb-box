export function applyEasing(p, type) {
  p = Math.max(0, Math.min(1, p))
  switch(type) {
    case 'linear':    return p
    case 'easeIn':    return p*p
    case 'easeOut':   return p*(2-p)
    case 'easeInOut': return p<0.5 ? 2*p*p : -1+(4-2*p)*p
    case 'elastic':   return p===0 ? 0 : p===1 ? 1 : Math.pow(2,-10*p)*Math.sin((p*10-0.75)*(2*Math.PI/3))+1
    case 'bounce': {
      if(p<1/2.75)    return 7.5625*p*p
      if(p<2/2.75)  { p-=1.5/2.75;  return 7.5625*p*p+0.75 }
      if(p<2.5/2.75){ p-=2.25/2.75; return 7.5625*p*p+0.9375 }
      p-=2.625/2.75; return 7.5625*p*p+0.984375
    }
    case 'back': { const c1=1.70158, c3=c1+1; return c3*p*p*p - c1*p*p }
    case 'sharp':     return p<0.15 ? p/0.15 : 1
    default:          return p
  }
}
