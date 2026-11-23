import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'

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

const DAY_KEYS = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat']

// Reads the `workingDays` option into a flag per weekday (index 0 = Sunday). Accepts day names or ranges
// ("mon-fri", "mon,tue,wed,thu,fri", "mon-sat,sun"); "all" or anything unreadable means every day.
const parseWorkingDays = (raw: unknown): boolean[] => {
  const text = String(raw ?? '').toLowerCase()
  const flags = [false, false, false, false, false, false, false]
  const names = DAY_KEYS.join('|')
  for (const m of text.matchAll(new RegExp('(' + names + ')[a-z]*\\s*-\\s*(' + names + ')', 'g'))) {
    let i = DAY_KEYS.indexOf(m[1])
    const end = DAY_KEYS.indexOf(m[2])
    flags[i] = true
    while (i !== end) {
      i = (i + 1) % 7
      flags[i] = true
    }
  }
  for (const m of text.matchAll(new RegExp(names, 'g'))) {
    flags[DAY_KEYS.indexOf(m[0])] = true
  }
  return flags.some(Boolean) ? flags : [true, true, true, true, true, true, true]
}

// The `workingDays` option text for a set of flags ("mon-sun" when every day works).
const toSpec = (flags: boolean[]): string =>
  flags.every(Boolean) ? 'mon-sun' : DAY_KEYS.filter((_, i) => flags[i]).join(',')

const PANE = 'usage-pace'
const ORDER = [1, 2, 3, 4, 5, 6, 0] // Monday first
const USAGE =
  '/pace opens the settings pane.\n' +
  '/pace days mon-fri  (or mon,tue,wed… or all): the days that count towards the pace.\n' +
  '/pace view recap|detail|toggle: the one-line recap or the expanded view.'

// Writes the `workingDays` option, as the person would in the config menu. Returns the refusal, if any.
async function setDays($: EngineInterface, flags: boolean[]): Promise<string | undefined> {
  const { deny } = await $.config.set({ key: 'usage-pace.workingDays', value: toSpec(flags) })
  if (deny) $.ui.toast(`Usage pace: ${deny}`)
  return deny
}

// Milliseconds of working time (local calendar days flagged in `work`) between two instants.
const workMs = (from: number, to: number, work: boolean[]): number => {
  let total = 0
  let cursor = from
  while (cursor < to) {
    const midnight = new Date(cursor)
    midnight.setHours(24, 0, 0, 0)
    const end = Math.min(to, midnight.getTime())
    if (work[new Date(cursor).getDay()]) total += end - cursor
    cursor = end
  }
  return total
}

const isSnap = (v: unknown): v is PaceSnap =>
  typeof v === 'object' &&
  v !== null &&
  typeof (v as PaceSnap).pct === 'number' &&
  typeof (v as PaceSnap).resetsAt === 'string'

export const register: Register = (on, options) => {
  const work = parseWorkingDays(options?.workingDays)
  const isCustom = work.some(w => !w)
  on('session.start', async ($, e, next) => {
    await $.command.register({
      name: 'pace',
      description: 'Usage pace settings: working days and view',
      argumentHint: '[days mon-fri | view recap|detail]',
    })

    return next(e)
  })

  on('command.run', { command: 'pace' }, async ($, e) => {
    const [sub = '', ...rest] = e.args.trim().split(/\s+/)
    const arg = rest.join(' ').toLowerCase()

    if (sub === '') {
      await $.ui.open({ id: PANE, title: 'Usage pace' })
      return { text: 'Usage pace settings opened.' }
    }

    if (sub === 'days') {
      const isReadable = /\b(all|every)/.test(arg) || DAY_KEYS.some(k => arg.includes(k))
      if (!isReadable) return { text: `Which days? Example: /pace days mon-fri\n${USAGE}` }
      const flags = /\b(all|every)/.test(arg) ? [true, true, true, true, true, true, true] : parseWorkingDays(arg)
      const deny = await setDays($, flags)
      return { text: deny ? `Could not change the working days: ${deny}` : `Working days: ${toSpec(flags)}` }
    }

    if (sub === 'view') {
      const current = (await read($, viewAtom)) as 'recap' | 'detail'
      const next = arg.startsWith('d') ? 'detail' : arg.startsWith('r') ? 'recap' : current === 'recap' ? 'detail' : 'recap'
      await update($, viewAtom, () => next)
      return { text: `View: ${next}` }
    }

    return { text: USAGE }
  })

  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    const { Box, Button, Text } = $.ui.resolve(e)
    const view = (await read($, viewAtom)) as 'recap' | 'detail'

    return (
      <Box flexDirection="column" gap={1}>
        <Text bold>Working days</Text>
        <Text dimColor>Days left out get no budget, and the pace does not advance during them.</Text>
        <Box flexDirection="row" gap={1}>
          {ORDER.map(i => (
            <Button
              key={`day-${DAY_KEYS[i]}`}
              label={`${DAYS[i]} ${work[i] ? '✓' : '·'}`}
              onPress={() => {
                const next = work.map((w, j) => (j === i ? !w : w))
                // Leaving no day at all would fall back to every day: ignore that press.
                if (next.some(Boolean)) void setDays($, next)
              }}
            />
          ))}
        </Box>
        <Box flexDirection="row" gap={1}>
          <Button key="preset-all" label="Every day" onPress={() => void setDays($, [true, true, true, true, true, true, true])} />
          <Button key="preset-week" label="Mon–Fri" onPress={() => void setDays($, [false, true, true, true, true, true, false])} />
        </Box>
        <Text bold>View</Text>
        <Box flexDirection="row" gap={1}>
          <Button
            key="view-recap"
            label={`One line ${view === 'recap' ? '✓' : ''}`.trim()}
            onPress={() => update($, viewAtom, () => 'recap')}
          />
          <Button
            key="view-detail"
            label={`Detailed ${view === 'detail' ? '✓' : ''}`.trim()}
            onPress={() => update($, viewAtom, () => 'detail')}
          />
        </Box>
      </Box>
    )
  })

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
    // Days elapsed in the weekly window, and the usage you'd have if you spread it evenly over the
    // working time until the reset (every hour counts when all days are working days).
    const elapsedDays = Math.max(0, Math.min(7, (now - startMs) / DAY))
    const workTotal = workMs(startMs, resetMs, work)
    const expected = (workMs(startMs, Math.min(now, resetMs), work) / workTotal) * 100
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

    // Points per (working) day you can still spend to land on exactly 100% at the reset. The part of
    // today that is left counts as a fraction of a day.
    const daysLeft = Math.max(0.01, workMs(now, resetMs, work) / DAY)
    const perDayLeft = Math.max(0, (100 - snap.pct) / daysLeft)
    const perDayLabel = isCustom ? 'per work day' : 'per day'

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
            <Text dimColor>{` · ${perDayLeft.toFixed(1)}% left ${perDayLabel}`}</Text>
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
    // Each 24h block of the window is worth its share of the week's working time (1/7 when every day works).
    let shareBefore = 0
    const columns = []
    for (let d = 0; d < 7; d++) {
      const blockStart = startMs + d * DAY
      const blockWork = workMs(blockStart, blockStart + DAY, work)
      const share = (blockWork / workTotal) * 100
      // How much of this block's share the cumulative usage has filled (0..1); a block with no working time
      // stays empty and dim.
      const f = share > 0 ? Math.max(0, Math.min(1, (snap.pct - shareBefore) / share)) : 0
      shareBefore += share
      // Where you should be right now inside the block (today only, and only if it has working time).
      const p =
        d === todayIdx && blockWork > 0
          ? Math.max(0, Math.min(1, workMs(blockStart, now, work) / blockWork))
          : null
      const isOff = blockWork === 0
      const dayName = DAYS[new Date(blockStart + 60 * 60 * 1000).getDay()]

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
          <Text bold={d === todayIdx} dimColor={d > todayIdx || isOff}>{dayName}</Text>
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
            <Text dimColor>{` · ${perDayLeft.toFixed(1)}% left ${perDayLabel} · resets ${resetText}`}</Text>
          </Text>
          {toggle}
        </Box>
        <Box flexDirection="row" gap={1}>{columns}</Box>
      </Box>
    )
  })
}
