// Keeps a harness window out of the way while it runs.
//
// These suites drive a real Electron window, and Chromium only draws at full rate
// for a window it is actually presenting — a hidden or minimized one is throttled
// to about one frame a second, which would make every frame rate read as 1. Until
// it is asked for screenshots, or a measurement needs the window present, it is
// shown without focus, kept off the taskbar and parked in the bottom corner so the
// desktop underneath stays usable.
const { screen } = require('electron')

/** Park the window in the corner of the work area, off the taskbar. */
function backstage(win) {
  win.setSkipTaskbar(true)
  const area = screen.getPrimaryDisplay().workAreaSize
  const [width, height] = win.getSize()
  win.setPosition(Math.max(0, area.width - width - 12), Math.max(0, area.height - height - 12))
}

/** Show the window again without pulling focus away from whatever is in front. */
function showBackstage(win) {
  if (win.isMinimized()) win.restore()
  win.showInactive()
}

module.exports = { backstage, showBackstage }
