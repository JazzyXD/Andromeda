# Andromeda

A night-sky learning app for your courses and study guides, run on your own Claude plan through Claude Code.

## What works now (stage 2)

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

- `src/main/` the app itself: `claude.js` runs Claude Code locked down, `tools.js` the course tools, `data.js` your courses and their history, `extract.js` slide text, `github.js` backup
- `src/renderer/` everything you see: `sky.js` draws the sky, `app.js` runs the screens
- `src/shared/constellations.js` the real constellation shapes used for courses
