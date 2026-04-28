// Entry point — imports trigger all module-level setup code
import './font.js'
import './text.js'
import './color.js'
import './image.js'
import './lottie.js'
import './rain.js'
import './interaction.js'
import './export.js'
import './ui.js'

import { S } from './state.js'
import { updateColor } from './color.js'
import { syncTextUI } from './text.js'
import { setFormat } from './ui.js'
import { loop } from './renderer.js'

// Bootstrap
updateColor('bg', S.bgColor)
syncTextUI()
setFormat('post')
loop()
