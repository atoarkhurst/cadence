# Cadence design direction: the shared week

Status: refined cobalt direction implemented across the weekly planner, Today,
check-in, account, sign-in, invitation, encouragement inbox, public snapshot,
and phone navigation. Database, goal persistence, and history are unchanged.

The first pass removes enclosing cards and decorative headings, brings goals up
the page, and groups review, planning, history, and sharing under Week options.
Received encouragement stays beneath the recipient’s goals as a signed note.
One goal-entry control reveals a choice of one-time or counted progress. Paired
names, an editorial date heading, porcelain background, and restrained cobalt
replace the earlier sage palette. No database or authorization logic changed.

## Product idea

Cadence should feel like a thoughtfully made weekly page that two friends return
to together. The emotional reward is being seen and encouraged by someone you
trust. Goals are personal promises, not scores in a competition.

The first screen answers three questions in order:

1. What did I commit to this week?
2. How am I doing, and what can I update now?
3. How is my partner doing, and can I encourage them?

## Reference study

| Reference             | Borrow                                                                               | Leave out                                         |
| --------------------- | ------------------------------------------------------------------------------------ | ------------------------------------------------- |
| Things 3              | Short, legible lists; details appear when needed; a clear Today/Upcoming distinction | Its larger task-management system                 |
| Apple Fitness Sharing | A friend's progress visible in one glance; a direct path to respond                  | Ring competition and scores                       |
| Day One               | A calm sense of time, reflection, and history                                        | A full journaling editor on the weekly page       |
| Focusmate             | The ritual of stating an intention and checking in afterward                         | Scheduling and live-session machinery             |
| Duolingo              | Small moments of positive feedback after an action                                   | Leaderboards, streak pressure, decorative rewards |

These are behavior and hierarchy references, not visual templates to copy.

## Diagnosis that led to the redesign

- A large “Find your rhythm” headline, signature graphic, share button, and
  several links precede the goals. This pushes the weekly promises down.
- Rounded cards contain smaller bordered rows, pills, and tinted message cards.
  The repeated framing makes almost every element feel equally important.
- Uppercase labels and explanatory copy repeat what the layout could convey.
- The two columns imply two equal dashboards. The user's goals should lead, while
  the partner's activity should be close enough to glance at and respond to.

## Screen hierarchy

Desktop (roughly 1024px wide):

```text
cadence                                      Today  This week  Notes  Account
This week · Oct 3–9                         Review ▾

YOUR WEEK                                   IN YOUR CORNER
2 of 4 complete                             Joey · 1 of 2 complete

○ Apply to three roles              1/3      ▰ Read 100 pages        64/100
● Practice React four times         2/4      ○ Go for two runs       1/2
○ Finish portfolio case study                 Joey finished a run today

+ Add an intention                           [ Write Joey a note… ]

                          One recent note from Joey, if any
```

Mobile: header and date, then the user's 3–4 goals, then a compact partner section
with progress and one note action. Keep core goals visible without opening a card
or scrolling past introductory text. Place review and history in a quieter area.

## Visual language

- Use an editorial serif for the page-level moment in time, with a clean sans
  for actions and goal rows. Use weight and spacing before color for hierarchy.
- Porcelain canvas (`#fcfcfa`), ink (`#17243b`), and one cobalt accent
  (`#294ecb`) for actions and progress. Muted copy is `#637086`; quiet
  dividers are `#dce1e8`. The tokens for non-week screens live in
  `src/CadenceTheme.css`; the weekly layout owns its scoped rules in
  `src/WeekStudio.css`.
- Prefer rows and spacing over a border around every item. Use one major panel
  or shared surface, not nested cards.
- One small progress treatment repeated consistently. A count such as `2 / 4`
  should remain readable without a bar; add a bar only where it improves scanning.
- Use plain, human labels: “Your week,” “Joey's week,” “Send Joey a note.” The
  brand line can live on the welcome page, not above every weekly list.
- Active controls need visible focus, clear labels, and a touch area of at least
  44px on mobile. The icon itself can remain visually small.

## Interaction rules

- Tap a one-time goal to complete it. For a repeatable goal, `+` advances by one
  and the current count remains visible. Undo remains available.
- Adding a goal begins with one entry point; choose one-time or repeatable within
  that flow. Avoid showing multiple empty forms by default.
- The partner section shows progress first and a message field second. Received
  encouragement appears beside the recipient's goals without taking over the page.
- Reflection and planning appear at the weekly transition. They remain available
  elsewhere, but should not crowd the default weekly view.
- Keep past weeks read-only and preserve the current data model and history.

## Usability checks

Show desktop and phone mockups to two people, including Joey. Ask them to point to
their goals, update a repeatable goal, find Joey's progress, and send a note. Do
not coach them. Observe whether the four actions are immediately discoverable and
whether the screen feels supportive rather than pressuring. Iterate the mockup
when iterating on the production design.

## Source references

- Things: https://culturedcode.com/things/features/
- Apple Fitness Sharing: https://support.apple.com/en-ie/guide/iphone/iph0b826155d/ios
- Day One: https://dayoneapp.com/
- Focusmate: https://support.focusmate.com/en/articles/9110188-getting-started
- Duolingo streak design: https://blog.duolingo.com/streak-milestone-design-animation/
