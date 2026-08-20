# Weekly Game Plan — Deployment Guide

A real-time collaborative board used by the Digital Product team in a weekly
meeting. Node.js + Express, with Socket.io for live sync between participants.

**Repository:** `git@github.com:rhyslynch-dev/Claude-Projects-Repo.git`
**Deploy root:** `weekly-game-plan/` (this is a monorepo — the repository root
contains other unrelated apps, so the App Service must be pointed at this
subdirectory, not the repo root)

---

## 1. Runtime

| | |
|---|---|
| Runtime | Node.js 18 LTS or newer |
| Install | `npm install` (do not commit or upload `node_modules/`) |
| Start | `npm start` (runs `node server.js`) |
| Port | Reads `process.env.PORT`, falls back to 3000. Azure injects `PORT` automatically — do not hardcode it. |

No build step. There is no bundler, transpiler or framework CLI; static assets
in `public/` are served directly by Express.

---

## 2. ⚠️ Enable WebSockets — required

**Azure App Service has WebSockets disabled by default. The application will
appear broken until this is turned on.**

Set it under **Configuration → General settings → Web sockets = On**, or:

```bash
az webapp config set \
  --resource-group <group> \
  --name <app-name> \
  --web-sockets-enabled true
```

### Why this matters

The client renders the board only after it receives a `week-state` event over
the Socket.io connection. If the WebSocket handshake fails, users get a
**blank page with no error message** — the page loads, the board never
appears. This is the single most likely cause of a failed first deploy, and
the symptom gives no hint as to the cause.

To verify after deploying, open the browser devtools Network tab, filter to
`WS`, and confirm the `/socket.io/` connection reports status **101 Switching
Protocols**. Anything else (repeated long-polling requests to
`/socket.io/?EIO=4&transport=polling`) means WebSockets are still off.

---

## 3. Configuration

Set as **Application Settings** under Configuration. Do not deploy a `.env`
file — see `.env.example` for the full annotated list.

| Setting | Required | Notes |
|---|---|---|
| `HIBOB_SERVICE_ID` | Yes | HiBob service user ID, format `SERVICE-XXXXX` |
| `HIBOB_TOKEN` | Yes | HiBob service user token — treat as a secret |
| `PORT` | No | Injected by Azure; leave unset |
| `HIBOB_INSECURE_TLS` | No | **Leave unset.** See below. |

### Secrets handling

`HIBOB_TOKEN` is a live credential granting read access to company-wide
absence data. It should be supplied through whatever secret-management
process applies (Key Vault reference, or entered directly into Application
Settings by the person who holds it) — not sent over email or chat, and not
committed to the repository.

If the HiBob panel is not needed on day one, the app starts and functions
without these variables; the Team Leave panel will simply show a load error.

### `HIBOB_INSECURE_TLS`

**Leave unset.** Setting it to `true` disables TLS certificate validation on
outbound HiBob calls.

It exists only as an escape hatch: the HiBob request previously failed with
`SELF_SIGNED_CERT_IN_CHAIN` on a Bulk network that intercepted HTTPS with a
self-signed root certificate. That interception no longer appears to be in
effect — the call has been verified working with validation fully enabled —
so the flag should not be needed anywhere, including locally. It is retained
in case the proxy behaviour returns on some office networks.

If HiBob calls ever fail with a certificate error in Azure, that indicates a
genuine trust problem worth investigating rather than bypassing.

---

## 4. ⚠️ Data persistence — decision required before go-live

Board data is stored as a **JSON file on local disk** at
`data/weeks.json`, written synchronously on every edit.

This works on a **single instance**. It breaks on more than one:

- Each instance holds its own copy of the file, so edits made by users on
  instance A are invisible to users on instance B.
- Socket.io broadcasts are in-memory and per-instance, so real-time sync
  silently stops working across instances — which defeats the core purpose of
  the app.

**Two options:**

1. **Pin to a single instance** (scale-out = 1, no autoscale). Simplest, and
   adequate for the current usage: one team, seven people, editing
   concurrently for roughly an hour a week. Note that App Service can still
   recycle the instance, so `data/` should sit on the persisted `/home` mount
   rather than ephemeral container storage.

2. **Externalise state.** Move board data to a database (Azure SQL, Postgres
   or Cosmos DB) and add the Socket.io Redis adapter
   (`@socket.io/redis-adapter`) so broadcasts reach every instance. Required
   if the app is ever scaled out or needs durability guarantees.

Option 1 is a configuration choice and needs no code change. Option 2 is a
code change — raise it with the app owner rather than implementing it
unilaterally, as it affects the data model.

### Existing history

None needs migrating. The owner has accepted starting with an empty board;
`data/weeks.json` is gitignored and will not arrive with the deploy. The app
creates the file on first write, so no seeding or initialisation is required.

---

## 5. Access

Intended for internal access only — an internal URL reachable by staff. There
is **no authentication layer** in the application. Any user who can reach the
URL can read and edit every board and post kudos as any team member.

If the hostname is reachable beyond the internal network, put access control
in front of it (App Service Authentication / Entra ID, or an IP restriction).

---

## 6. Post-deploy verification

1. Board loads and shows seven member cards.
   *Blank page → WebSockets are off, see section 2.*
2. Open the URL in two browsers, type in a field in one, confirm the text
   appears in the other within about a second. Confirms Socket.io is working
   end to end.
3. Team Leave panel populates.
   *"Failed to load" → check `HIBOB_SERVICE_ID` / `HIBOB_TOKEN`; the server
   logs the underlying HiBob error.*
4. Restart the App Service, reload, and confirm previously entered text is
   still present. Confirms `data/` is on persisted storage, not ephemeral
   container disk.

---

## 7. Making changes after handover

Changes are made in the Git repository, not by sending files:

1. Change is committed and pushed to `main` by the app owner.
2. App Service redeploys — automatically if continuous deployment is
   configured against `main`, otherwise triggered manually.

Configuring continuous deployment from the `main` branch is the recommended
setup, as it removes any file handover from the loop entirely.

---

## Contact

Rhys Lynch — application owner, rhys.lynch@bulk.com
