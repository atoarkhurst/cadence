# Cadence

Cadence is a lightweight accountability app for two friends who want to make each week count.

The idea grew out of a weekly ritual: meet on Saturday, choose three or four realistic intentions, encourage each other during the week, and meet again to reflect on how it went. Cadence turns that shared note into a focused product built around planning, visible progress, and encouragement.

## What the prototype does

- Set a short list of weekly tasks and measurable goals
- Track daily habits
- See daily completion streaks
- Create a read-only snapshot link to share progress
- Save progress in the browser between visits

The current version is intentionally local-first. It is useful for testing the core workflow before adding accounts, a database, or real-time partner updates.

## Product direction

The core loop is:

1. **Plan together** — choose a small number of intentions for the week.
2. **Make progress visible** — update goals without turning the app into a complicated project manager.
3. **Encourage each other** — let a partner react or leave a short note.
4. **Reflect and reset** — review the week together, celebrate wins, and carry forward what matters.

The next meaningful product milestone is a private shared week for two people. That will require sign-in, persistent cloud data, partner invitations, and lightweight encouragement. Those capabilities should be added only after the planning and progress experience feels simple and useful.

## How the React app fits together

- `src/main.jsx` starts React and defines the app's routes.
- `src/Root.jsx` is the shared page layout and navigation.
- `src/App.jsx` renders the daily habit view and manages its state.
- `src/Week.jsx` renders weekly tasks and goals and manages their state.
- `src/pages/ShareView.jsx` renders a read-only progress snapshot.
- `src/utils/` contains focused logic that does not need to render anything.
- CSS files live beside the screens they style.

React components turn state into interface. Event handlers update that state, and React renders the new result. `useEffect` synchronizes selected state with browser storage so it survives a refresh. React Router chooses which screen to render from the URL.

## Run it locally

You will need a recent version of Node.js.

```bash
npm install
npm run dev
```

Then open the local address shown in the terminal.

Useful checks:

```bash
npm run lint
npm run build
```

`lint` catches suspicious code and consistency problems. `build` creates the optimized production version and confirms that the app can be packaged successfully.

## A practical learning path

Use the existing features as small React lessons:

1. Change a label or default goal to see how JSX becomes the interface.
2. Trace one checkbox from its click handler to its state update and rerender.
3. Follow the weekly data from `useState` into `localStorage` through `useEffect`.
4. Add an empty state or validation message as a small independent feature.
5. Extract one repeated interface pattern into a reusable component.
6. Add automated tests around date, streak, and sharing utilities.
7. Only then connect the proven workflow to authentication and a database.

## Near-term roadmap

- Refine the weekly planning flow around three or four intentions
- Add a Saturday review and rollover experience
- Model a private partnership and shared weekly plan
- Add short encouragement reactions or notes
- Add authentication and persistent storage
- Add tests and deploy a small private beta

## Tech stack

- React for the interface and state-driven components
- React Router for navigation
- Vite for local development and production builds
- Browser storage for prototype persistence

This stack is deliberately small. It keeps the product easy to understand today and leaves room to add a hosted backend when the shared experience is ready.
