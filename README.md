# usage-pace

A small mod for Claude Code that puts your **weekly usage** above the prompt and tells you whether you are
ahead of or behind the pace that would land you on exactly 100% when the weekly limit resets.

It reads the `seven_day` rate-limit window that Claude Code already reports on a subscription, so it needs no
setup and makes no network calls of its own.

## What you see

Collapsed (one line):

```
60% this week · +9% above pace · 11.7% left per day ▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬ resets Fri 08:00  ▾
```

- **60% this week**: how much of the weekly limit you have used.
- **+9% above pace**: your usage minus the usage you would have if you spread it evenly over the week
  (green when you are on or under pace, yellow up to 10 points over, red beyond that).
- **11.7% left per day**: what you can still spend per day, from now to the reset, to end on exactly 100%.
  The part of today that is left counts as a fraction of a day.
- **The bar** covers the whole week. Blue is the part up to the pace, orange is what goes over it, and green
  is the margin you have not used yet when you are under pace.
- **resets Fri 08:00**: when the window resets, in your local time.

Press **▾** to expand, **▴** to collapse. The expanded view adds the exact figures and one thin bar per day
of the window. Each day is worth 1/7 of the week, the bars fill cumulatively, and the white tick on today's bar
marks where you should be right now.

The days are 24-hour blocks counted from the reset time, not from midnight.

## Install

At the prompt of a terminal session:

```
/plugin install usage-pace --marketplace RMantis/usage-claude-pace
```

From a shell:

```
claude plugin install usage-pace --marketplace RMantis/usage-claude-pace
```

In the desktop app, where `/plugin` does not run: click **+** next to the prompt box, then **Plugins**,
**Add marketplace** with `RMantis/usage-claude-pace`, then **Add plugin**.

It shows nothing until Claude has replied once in the session, since that is when the usage figures arrive.
After that the last reading is remembered across sessions until the window resets.

## Notes

- It needs a plan that reports rate-limit windows. Off a subscription there is nothing to show.
- Early-access plugin API: it may need changes as Claude Code's mod API evolves.
