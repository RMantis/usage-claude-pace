import { expect, test } from 'claude-code/testing'

const BAND = {
  plugin: 'usage-pace',
  surface: 'desktop',
  component: 'AbovePrompt',
  props: { hasSurvey: false },
} as const

const DAY = 24 * 60 * 60 * 1000

test('without a reading the band says it is waiting', async ($, on) => {
  on('clock.now', () => ({ value: Date.now() }))
  on('store.get', () => ({ value: undefined }))

  const ui = await $.ui.mount(BAND)

  expect((await ui.find({ type: 'Text', text: /waiting/ }))?.text).toMatch(/waiting/)
  await ui.unmount()
})

test('with a stored reading the recap line shows the weekly usage', async ($, on) => {
  const snap = { pct: 60, resetsAt: new Date(Date.now() + 3 * DAY).toISOString() }
  on('clock.now', () => ({ value: Date.now() }))
  on('store.get', () => ({ value: snap }))

  const ui = await $.ui.mount(BAND)

  expect((await ui.find({ type: 'Text', text: /60%/ }))?.text).toMatch(/60%/)
  await ui.unmount()
})
