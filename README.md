# Andromeda

A night-sky learning app for your courses and study guides, run on your own Claude plan through Claude Code.

## What works now (stage 4)

- **Two laptops, one set of courses:** connect the same GitHub account on both and they stay the same. Andromeda checks for the other laptop's changes when it opens, every 2 minutes, when you come back to its window, and right before Claude changes anything. The header shows where things stand (synced, syncing, offline, or what went wrong); click it to sync now.
- **Changes on both laptops are combined item by item:** a test added on one and a week added on the other both stay. Only when the very same item changed on both does the newer change win; the other stays in the history.
- **Scores from either laptop:** each laptop keeps its own score file and Andromeda combines them, so a quiz taken anywhere shows everywhere.
- **A guide builds on one laptop at a time.** The other shows "Building on School laptop". Stop works from either one. If the building laptop goes quiet, the other offers **Carry on here**.
- **Laptop names** come from the computer and can be changed in Settings.
- **Second laptop:** install, sign in to Claude Code, connect GitHub, and your courses and guides appear.

## Stage 3

- **Learning guides:** press **Make a guide** on anything in a course's Coming up, use **Plan a guide** in Guides, or ask for a guide in the chat. The plan screen fills in the course, test and weeks, guesses the kind of course (you confirm), and builds nothing until you press Build guide. Guides default to Opus at high effort.
- **Built a week at a time** with the rules from your guide skills (shipped in `src/main/guide-rules/`). Each week saves and backs up as soon as it's done, so you can read week 1 while the rest builds. If you hit a Claude limit, the guide pauses and carries on by itself after the reset while Andromeda is open.
- **Read and practise in the app:** the same layout, boxes, quizzes, confidence taps and typed blanks as your chat guides, in the night-sky colours (prints light). Scores and typed answers save to your data and GitHub backup.

## Stage 2

- **First open:** checks Claude Code is installed, and connects GitHub with a short code so your courses are backed up to your private `Andromeda-data` repo.
- **Courses by prompting:** "Add Income Tax 2, Tue and Thu with Dan Carli", "The final is Dec 15", "Chapter 12 is taxable income for corporations". Claude can only use Andromeda's course tools and read your course files: no commands, no internet, nothing outside your Andromeda folder.
- **Every change can be undone**, and deleting a course or removing files always asks you first.
- **Files:** drop PDFs, PowerPoints, Word or Excel files onto a course (or anywhere, then say which course). Their text is pulled out once on your laptop, with hidden slides skipped and tables kept as rows, so Claude reads a cheap text version. Photos and scanned PDFs are read by Claude only when needed.
- **Find dates:** each course file has a Find dates button. It reads that file on Sonnet and shows a checklist of every date with the line it came from; nothing is added until you tick and confirm.
- **Course pages:** click a card and it grows into the course while the sky pans to that course's constellation.
- **Usage** under the prompt box, plus the model and effort picker (course prompts default to Haiku, medium).

Your data lives in an `Andromeda Data` folder in your home folder, separate from the app's code.

## Try it

You need [Node.js](https://nodejs.org) (LTS), Git, and [Claude Code](https://code.claude.com/docs/en/setup) signed in (type `claude` in a terminal once).

```
git clone -b stage-2 https://github.com/JazzyXD/Andromeda.git
cd Andromeda
npm install
npm start
```

On Windows PowerShell, use `npm.cmd install` and `npm.cmd start`.

Shortcuts: Ctrl or Cmd + 1, 2, 3 switch tabs. Ctrl or Cmd + K jumps to the prompt box. Esc closes a course page.

## Where things live

- `src/main/` the app itself: `claude.js` runs Claude Code locked down, `tools.js` the course and guide tools, `data.js` your courses and their history, `guides.js` planning and building guides, `extract.js` slide text, `github.js` connecting GitHub, `sync.js` keeping both laptops the same
- `src/renderer/` everything you see: `sky.js` draws the sky, `galaxies.js` the distant galaxies, `app.js` runs the screens, `guide-page.js` the page a guide is shown in
- `src/shared/constellations.js` the real constellation shapes used for courses
