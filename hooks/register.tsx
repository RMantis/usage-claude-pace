import { atom, read, update } from 'claude-code'
import type { Register } from 'claude-code'

import type { PaceSnap } from '../types'

const snapAtom = atom({ plugin: 'usage-pace', key: 'snap' } as const, null)
// View: 'recap' (one line) or 'detail' (full text + a bar per day).
const viewAtom = atom({ plugin: 'usage-pace', key: 'view' } as const, 'recap')

// Glyph of the thin bars: ▬ sits in the middle of the text line (▄ sat below the baseline).
const GLYPH = '▬'
const DAY = 24 * 60 * 60 * 1000
const WEEK = 7 * DAY
const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

const pad2 = (n: number) => String(n).padStart(2, '0')

const isSnap = (v: unknown): v is PaceSnap =>
  typeof v === 'object' &&
  v !== null &&
  typeof (v as PaceSnap).pct === 'number' &&
  typeof (v as PaceSnap).resetsAt === 'string'

export const register: Register = on => {
  // On every measurement: keep the latest weekly usage (and persist it across sessions).
  on('session.measure', async ($, e, next) => {
    const week = e.rateLimits.find(r => r.kind === 'seven_day')

    if (week && week.resetsAt) {
      const snap: PaceSnap = { pct: week.percentUsed, resetsAt: week.resetsAt }
      await update($, snapAtom, () => snap)
      await $.store.set('snap', snap)
    }

    return next(e)
  })

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    if (e.props.hasSurvey) {
      return next(e)
    }

    let snap = (await read($, snapAtom)) as PaceSnap | null
    if (!snap) {
      const stored = await $.store.get('snap')
      snap = isSnap(stored) ? stored : null
    }

    const now = await $.clock.now()
    const { Box, Button, Text } = $.ui.resolve(e)

    if (!snap || Date.parse(snap.resetsAt) <= now) {
      return (
        <Box>
          <Text dimColor>Weekly usage: waiting for the first reading (shows up after the first reply)</Text>
        </Box>
      )
    }

    const resetMs = Date.parse(snap.resetsAt)
    const startMs = resetMs - WEEK
    // Days elapsed in the weekly window, and the usage you'd have if you spread it evenly until the reset.
    const elapsedDays = Math.max(0, Math.min(7, (now - startMs) / DAY))
    const expected = (elapsedDays / 7) * 100
    const diff = snap.pct - expected
    const todayIdx = Math.min(6, Math.floor(elapsedDays))

    const color = diff <= 0 ? 'success' : diff <= 10 ? 'warning' : 'error'
    const diffText =
      Math.abs(diff) < 0.5
        ? 'on pace'
        : diff > 0
          ? `+${diff.toFixed(1)}% above pace`
          : `${Math.abs(diff).toFixed(1)}% below pace`

    const reset = new Date(resetMs)
    const resetText = `${DAYS[reset.getDay()]} ${pad2(reset.getHours())}:${pad2(reset.getMinutes())}`

    // Points per day you can still spend to land on exactly 100% at the reset. The part of today
    // that is left counts as a fraction of a day.
    const daysLeft = Math.max(0.01, 7 - elapsedDays)
    const perDayLeft = Math.max(0, (100 - snap.pct) / daysLeft)

    const view = (await read($, viewAtom)) as 'recap' | 'detail'
    const isDetail = view === 'detail'

    const toggle = (
      <Button
        key="view"
        label={isDetail ? '▴' : '▾'}
        dimColor
        onPress={() => update($, viewAtom, v => (v === 'recap' ? 'detail' : 'recap'))}
      />
    )

    // Recap view: a single line, a few things at a glance.
    if (!isDetail) {
      const shortDiff =
        Math.abs(diff) < 0.5
          ? 'on pace'
          : diff > 0
            ? `+${Math.round(diff)}% above pace`
            : `${Math.round(Math.abs(diff))}% below pace`
      // A bar over the whole week (0..100%) that fills the free space: each stretch is a percentage-width Box
      // (so the scale is exact at any width) that clips a row of thin glyphs.
      // Up to the pace (or to your usage, if lower) blue; what goes over the pace orange; the margin you
      // have not used yet below the pace green.
      const lo = Math.round(Math.max(0, Math.min(100, Math.min(snap.pct, expected))))
      const hi = Math.round(Math.max(0, Math.min(100, Math.max(snap.pct, expected))))
      const isOver = snap.pct > expected
      const spans: [number, number, string][] = [
        [0, lo, 'suggestion'],
        [lo, hi, isOver ? 'warning' : 'success'],
        [hi, 100, 'inactive'],
      ]
      const bar = []
      for (const [from, to, c] of spans) {
        if (to - from <= 0) continue
        bar.push(
          <Box key={`p${from}`} width={`${to - from}%`} minWidth={0} flexShrink={0} height={1} overflow="hidden">
            <Text color={c} wrap="clip">{GLYPH.repeat(160)}</Text>
          </Box>,
        )
      }
      return (
        <Box flexDirection="row" alignItems="center">
          <Text>
            <Text color={color} bold>{Math.round(snap.pct)}%</Text>
            <Text dimColor> this week · </Text>
            <Text color={color}>{shortDiff}</Text>
            <Text dimColor>{` · ${perDayLeft.toFixed(1)}% left per day`}</Text>
          </Text>
          {/* width 0 + flexGrow: the bar takes only the space that is left; without it the 160 clipping
              glyphs give it a huge natural width and push the text and the button onto new lines. */}
          <Box width={0} minWidth={0} flexGrow={1} flexShrink={1} flexDirection="row" height={1} overflow="hidden" marginX={1}>{bar}</Box>
          <Text dimColor>{`resets ${resetText} `}</Text>
          {toggle}
        </Box>
      )
    }

    // Detail view: day name + a thin bar per day, seven equal columns.
    const dayShare = 100 / 7
    const columns = []
    for (let d = 0; d < 7; d++) {
      // How much of day d's share (1/7 of the week) the cumulative usage has filled (0..1).
      const f = Math.max(0, Math.min(1, (snap.pct - d * dayShare) / dayShare))
      // Where you should be right now inside the day (today only).
      const p = d === todayIdx ? Math.max(0, Math.min(1, elapsedDays - d)) : null
      const dayName = DAYS[new Date(startMs + d * DAY + 60 * 60 * 1000).getDay()]

      // The day's bar fills its column: whole-percent stretches that clip a row of glyphs,
      // and a white tick at today's pace.
      const cuts = [0, f, 1]
      if (p !== null) cuts.push(p)
      cuts.sort((x, y) => x - y)
      const bar = []
      for (let i = 0; i < cuts.length - 1; i++) {
        const w = Math.round(cuts[i + 1] * 100) - Math.round(cuts[i] * 100)
        if (w > 0) {
          const isFill = cuts[i + 1] <= f + 0.0001
          bar.push(
            <Box key={`b${d}-${i}`} width={`${w}%`} minWidth={0} flexShrink={0} height={1} overflow="hidden">
              <Text color={isFill ? color : 'inactive'} wrap="clip">{GLYPH.repeat(40)}</Text>
            </Box>,
          )
        }
        if (p !== null && Math.abs(cuts[i + 1] - p) < 0.0001 && p > 0.0001 && p < 0.9999) {
          bar.push(
            <Box key={`m${d}`} width={1} flexShrink={0} height={1} overflow="hidden">
              <Text color="text">█</Text>
            </Box>,
          )
        }
      }
      columns.push(
        <Box key={`c${d}`} width="14%" minWidth={0} flexShrink={1} flexDirection="row" gap={1} overflow="hidden">
          <Text bold={d === todayIdx} dimColor={d > todayIdx}>{dayName}</Text>
          <Box width={0} minWidth={0} flexGrow={1} flexShrink={1} flexDirection="row" height={1} overflow="hidden">{bar}</Box>
        </Box>,
      )
    }

    return (
      <Box flexDirection="column">
        <Box flexDirection="row" justifyContent="space-between">
          <Text>
            <Text dimColor>Week </Text>
            <Text color={color} bold>{snap.pct.toFixed(1)}%</Text>
            <Text dimColor>  pace </Text>
            <Text>{expected.toFixed(1)}%</Text>
            <Text dimColor>  </Text>
            <Text color={color}>{diffText}</Text>
            <Text dimColor>{` · ${perDayLeft.toFixed(1)}% left per day · resets ${resetText}`}</Text>
          </Text>
          {toggle}
        </Box>
        <Box flexDirection="row" gap={1}>{columns}</Box>
      </Box>
    )
  })
}
