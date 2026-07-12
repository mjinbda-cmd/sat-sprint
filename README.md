# SAT Sprint

A teen-friendly SAT practice tool: adaptive drills, timed mode with real SAT
pacing, a mistake queue, streaks, weekly goals, and progress tracking for two
students (TJ and Imani by default — rename them with the ✏️ button).

Gamified and tutor-enhanced: earn XP for correct answers (harder = more, plus a
comeback bonus for clearing mistakes), level up through 10 titles, collect 8
badges, browse missed questions in the mistake explorer, and study per-domain
strategy notes in the Learn tab. Untimed sessions also explain why each wrong
choice is wrong; timed sessions stay lean to preserve real-test pacing.

## How to use

**Easiest:** download **`SAT-Sprint.html`** (one self-contained file) and
double-click it. It opens in your browser and works offline. Progress is saved
in that browser on that computer, so keep using the same one.

**On a phone (installable app):** this repo is a PWA. Host it anywhere static
over HTTPS (GitHub Pages works great), then on the phone open the link in
Safari → Share → **Add to Home Screen**. It launches full-screen with its own
icon and works fully offline after the first visit. Progress is saved on each
device.

To host on GitHub Pages: push this repo to GitHub → repo **Settings → Pages**
→ under "Build and deployment" choose **Deploy from a branch**, branch `main`,
folder `/ (root)` → Save. The app appears at
`https://<username>.github.io/<repo>/` within a couple of minutes. When the
code changes, bump the `CACHE` version in `sw.js` so phones pick up the update.

**For development:** the app is three files — `index.html`, `app.js`,
`questions.js` (plus `manifest.webmanifest`, `sw.js`, `icons/`, `fonts/` for
the PWA). Open `index.html` in a browser to run it. After editing, rebuild the
single file with `python3 build.py`.

The `project/` and `chats/` folders below are the original Claude Design
handoff bundle that this app was built from, kept for reference.

---

# Original handoff notes (historical)

# CODING AGENTS: READ THIS FIRST

This is a **handoff bundle** from Claude Design (claude.ai/design).

A user mocked up designs in HTML/CSS/JS using an AI design tool, then exported this bundle so a coding agent can implement the designs for real.

## What you should do — IMPORTANT

**Read the chat transcripts first.** There are 1 chat transcript(s) in `chats/`. The transcripts show the full back-and-forth between the user and the design assistant — they tell you **what the user actually wants** and **where they landed** after iterating. Don't skip them. The final HTML files are the output, but the chat is where the intent lives.

**Read `project/SAT Prep Tool.dc.html` in full.** The user had this file open when they triggered the handoff, so it's almost certainly the primary design they want built. Read it top to bottom — don't skim. Then **follow its imports**: open every file it pulls in (shared components, CSS, scripts) so you understand how the pieces fit together before you start implementing.

**If anything is ambiguous, ask the user to confirm before you start implementing.** It's much cheaper to clarify scope up front than to build the wrong thing.

## About the design files

The design medium is **HTML/CSS/JS** — these are prototypes, not production code. Your job is to **recreate them pixel-perfectly** in whatever technology makes sense for the target codebase (React, Vue, native, whatever fits). Match the visual output; don't copy the prototype's internal structure unless it happens to fit.

**Don't render these files in a browser or take screenshots unless the user asks you to.** Everything you need — dimensions, colors, layout rules — is spelled out in the source. Read the HTML and CSS directly; a screenshot won't tell you anything they don't.

## Bundle contents

- `README.md` — this file
- `chats/` — conversation transcripts (read these!)
- `project/` — the `SAT Prep Tool redesign` project files (HTML prototypes, assets, components)
