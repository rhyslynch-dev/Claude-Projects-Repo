# Weekly Game Plan — Onboarding for IT

Orientation for engineers taking on hosting and maintenance of this
application. For step-by-step deployment instructions see
[`DEPLOY.md`](./DEPLOY.md) — this document covers what the app *is* and how
the code is organised, so that the deployment guide makes sense and changes
can be made safely.

**Owner:** Rhys Lynch (rhys.lynch@bulk.com) — Digital Product

---

## 1. First things first: repository scope

The repository is a personal monorepo containing several unrelated
applications. **Only `weekly-game-plan/` is in scope for this handover.**

```
Claude-Projects-Repo/
├── weekly-game-plan/     ← THIS APP — the only directory in scope
├── personal-backlog/     ← unrelated personal tool, not for hosting
├── weather-app/          ← unrelated, ignore
├── french-tutor/         ← unrelated, ignore
├── README.md             ← repo-level, not app documentation
└── hello.md              ← scratch file, ignore
```

Point the App Service deploy root at `weekly-game-plan/`, not the repository
root. Nothing outside that directory should be deployed or modified.

Note that `personal-backlog/` also contains HiBob integration code. It is a
separate application with its own credentials and is **not** part of this
handover — do not deploy it.

---

## 2. What the app does

A shared board used by the Digital Product team (7 people) in a weekly
meeting, currently Monday afternoons.

Each team member has a card where they record:

| Field | Meaning |
|---|---|
| `goal` | What they intend to achieve this week |
| `toAchieve` | Anticipated blockers ("anchors that may slow me down") |
| `lastWeekGoal` | Carried forward automatically from the previous week |
| `outcomeStatus` | Whether last week's goal was hit — set via buttons |

Alongside this:

- **Kudos** — free-text appreciation posted from one member to another, with
  🥳 reactions. Not anonymous.
- **Team Leave** — read-only panel pulling absence data from the HiBob HR
  system, showing who is off this week and over the next 10 weeks.
- **History** — previous weeks, browsable and grouped by year and month.

Everyone edits simultaneously on their own device during the meeting, and
edits appear live on everyone else's screen. That real-time behaviour is the
core of the app, which is why the WebSocket configuration in `DEPLOY.md`
matters so much.

---

## 3. Architecture

Deliberately minimal — no build step, no framework, no database.

```
Browser                          Node.js process
┌──────────────────┐             ┌────────────────────────────┐
│ public/index.html│             │ server.js                  │
│ public/app.js    │◄─ HTTP ────►│  Express: static + 4 routes│
│ public/style.css │             │                            │
│                  │◄─ WebSocket►│  Socket.io: 5 events       │
└──────────────────┘             │                            │
                                 │  ▼ fs.writeFileSync        │
                                 │  data/weeks.json           │
                                 └────────────────────────────┘
                                            │ HTTPS
                                            ▼
                                    api.hibob.com (leave data)
```

**Stack:** Node.js ≥18, Express 4, Socket.io 4. Front end is vanilla
JavaScript with no external libraries. No transpiler, no bundler, no
`npm run build`.

**Total application code is about 1,400 lines** across four files — small
enough to read end to end in a sitting, and worth doing before making
changes.

| File | Lines | Contains |
|---|---|---|
| `server.js` | ~290 | Everything server-side: member list, persistence, HTTP routes, Socket.io handlers, HiBob client |
| `public/app.js` | ~550 | All client logic: rendering, socket wiring, modals, leave panel |
| `public/style.css` | ~495 | All styling, including the responsive grid |
| `public/index.html` | ~80 | Page shell and modal markup |

---

## 4. HTTP API

All read-only. Mutations go over Socket.io, not HTTP.

| Route | Returns |
|---|---|
| `GET /api/members` | The team list — id, name, initials, colour, photo path |
| `GET /api/week/:key` | One week's board, creating it if absent. Key is a date, e.g. `/api/week/2026-08-17` |
| `GET /api/history` | Every stored week, newest first |
| `GET /api/leave` | HiBob absence data, split into `thisWeek` and `thisMonth` |

`/api/leave` is the only route that reaches outside the process. It fails
soft: on error it returns HTTP 500 and the panel shows "Failed to load"
while the rest of the board continues working.

---

## 5. Socket.io events

This is where all writes happen. Understanding these five events is most of
understanding the app.

**Client → server**

| Event | Effect |
|---|---|
| `join-week` | Joins the room named after the week key, and receives `week-state` back |
| `update-field` | Writes one field on one member's card. Field name is allow-listed to `goal`, `toAchieve`, `outcomeStatus` |
| `add-kudos` | Appends a kudo |
| `upvote-kudos` | Toggles the current user's 🥳 on a kudo |
| `start-new-week` | Rolls the board over to a fresh week |

**Server → client**

| Event | Effect |
|---|---|
| `week-state` | Full board snapshot. **The client renders nothing until this arrives** |
| `field-updated` | One field changed — patches in place, no re-render |
| `kudos-added` / `kudos-upvoted` | Kudos changes |
| `week-changed` | Broadcast to everyone when the week rolls over |

Rooms are keyed by week, so `io.to(weekKey).emit(...)` reaches exactly the
clients viewing that week.

> **Why a blank page means WebSockets are off:** the board only renders on
> receipt of `week-state`. If the WebSocket handshake fails, the HTML and CSS
> still load, so the user sees a styled but completely empty page with no
> error. See `DEPLOY.md` section 2.

---

## 6. Data model

Single JSON file, `data/weeks.json`, rewritten in full on every edit.

```jsonc
{
  "weeks": {
    "2026-08-17": {                    // key = Monday's date, ISO format
      "weekKey": "2026-08-17",
      "members": {
        "rhys": {
          "goal": "...",
          "toAchieve": "...",
          "lastWeekGoal": "...",       // copied forward on week creation
          "outcomeStatus": null        // null | "achieved" | "partial" | "missed"
        }
        // ... one entry per member
      },
      "kudos": [
        {
          "id": 1755432000000,         // Date.now()
          "from": "rhys",
          "to": "megan",
          "message": "...",
          "timestamp": "2026-08-17T09:00:00.000Z",
          "upvotes": ["david"]         // member ids who reacted
        }
      ]
    }
  }
}
```

Notes for anyone modifying this:

- **Week keys are always the Monday** of that week, derived by `getWeekKey()`.
- **`loadData()` / `saveData()` read and write the whole file synchronously**
  on every mutation. Fine at this scale (the file is ~26KB after several
  months), but it is why the app cannot be scaled out — see `DEPLOY.md`
  section 4.
- **There is no schema migration mechanism.** Adding a field means handling
  its absence in older week records, as the existing `?.` and `|| ''`
  fallbacks do.

---

## 7. Adding or removing a team member

The team list is **hardcoded** in the `MEMBERS` array near the top of
`server.js`. There is no admin UI.

To add someone:

1. Add an entry to `MEMBERS` — `id`, `name`, `initials`, `color`, `photo`.
2. Drop their photo into `public/images/`, matching the `photo` path.
3. Restart the process.

`getOrCreateWeek()` backfills the new member into the current week on the
next load, so their card appears with empty fields rather than breaking.

> This backfill exists because of a real bug: before it was added, a member
> added mid-week was absent from the already-created week record, and
> `update-field` wrote to `undefined` and threw. Because that throw was
> inside an unguarded Socket.io handler, it **crashed the whole process** —
> taking the board down for everyone the moment the new person typed in their
> card. Fixed, but worth knowing the shape of the hazard: unguarded writes in
> socket handlers can take the server down, not just fail the request.

Removing a member from `MEMBERS` hides their card but leaves their historical
data intact in `weeks.json`, which is intentional.

---

## 8. Running it locally

```bash
git clone git@github.com:rhyslynch-dev/Claude-Projects-Repo.git
cd Claude-Projects-Repo/weekly-game-plan
npm install
cp .env.example .env     # then fill in the HiBob values
npm start                # http://localhost:3000
```

The app starts and works without HiBob credentials — only the Team Leave
panel will show an error. That makes local development possible without
handling production secrets.

To exercise the real-time behaviour, open the URL in two browser windows and
type in one; text should appear in the other within about a second.

---

## 9. Things that will surprise you

Ordered roughly by how likely they are to cost you time.

1. **WebSockets are disabled by default on Azure App Service**, and the
   failure mode is a silent blank page. This is the most likely cause of a
   failed first deploy. `DEPLOY.md` section 2.
2. **The app cannot be scaled out.** Two instances means split data and
   broken live sync. Pin scale-out to 1 unless the storage layer is replaced.
   `DEPLOY.md` section 4.
3. **There is no authentication.** Anyone who can reach the URL can edit
   every card and post kudos as any member.
4. **The member list is code, not configuration.** Team changes require a
   commit and redeploy.
5. **`HIBOB_INSECURE_TLS` exists and must stay unset.** It disables TLS
   certificate validation and was a workaround for HTTPS interception on an
   office network. Verified unnecessary — see `DEPLOY.md` section 3.
6. **`data/weeks.json` is gitignored**, so a fresh deploy starts with an
   empty board. This is expected and accepted by the owner; no migration is
   needed.
7. **No CDN dependencies** — the Socket.io browser client is served by the
   application itself at `/socket.io/socket.io.js`. Nothing is fetched from a
   third-party origin at runtime, so restricted egress is not a problem.
   (The only outbound call is server-side, to `api.hibob.com`.)

---

## 10. Making changes

Changes flow through Git, not file handover:

1. Commit and push to `main`.
2. App Service redeploys — automatically with continuous deployment
   configured against `main`, otherwise manually.

Continuous deployment from `main` is the recommended setup. Application
changes are normally made by the owner; please raise anything that alters the
data model or the member list with him rather than changing it directly, as
both have downstream effects on stored history.

---

## Questions

Rhys Lynch — rhys.lynch@bulk.com
