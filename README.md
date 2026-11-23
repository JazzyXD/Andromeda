# Andromeda

A night-sky learning app for your courses and study guides, built with Claude.

## Stage 1 (this preview)

- The window, the hand-drawn moving sky, and the three tabs: Courses, Guides and Settings
- Sample courses and guides so you can see the layout; your real ones arrive in stage 2
- The frosted prompt box with the model and effort picker underneath (Claude connects in stage 2)
- Motion setting in Settings: Match system, Full, or Reduced

## Try it on a laptop

You need [Node.js](https://nodejs.org) (the LTS version) and Git.

```
git clone https://github.com/JazzyXD/Andromeda.git
cd Andromeda
npm install
npm start
```

Shortcuts: Ctrl or Cmd + 1, 2, 3 switch tabs. Ctrl or Cmd + K jumps to the prompt box.

## Build an installer

On the Mac: `npm run dist:mac` makes a .dmg in `dist/`.
On Windows: `npm run dist:win` makes a setup .exe in `dist/`.

The app isn't code-signed, so the first time you open it:
- **Mac:** right-click Andromeda, choose Open, then Open again.
- **Windows:** click "More info", then "Run anyway".

## Where things live

- `src/main/` runs the app window, menus and shortcuts
- `src/renderer/` is everything you see: `sky.js` draws the sky, `app.js` runs the screens, `styles.css` is the look
- `build/icon.png` is the app icon
