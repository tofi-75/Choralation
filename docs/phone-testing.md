# M4 physical-phone test session

> **October 13, 2026 priority update:** Render + Supabase hosting preparation is the current delivery task; see [deployment guide](hosting.md). All account/login/provider setup and publishing are manual owner steps deferred until later. Physical-phone acceptance moves from M4 to M5. Saved-Mass performance redesign and recommendations are deferred. Historical milestone statements below retain their original dates; hosted completion requires actual URL, persistence and pipeline verification.


**Current status — October 10:** Cloudflare HTTPS was removed at the owner's request. The tunnel, its private preview on 5174 and backend on 8001 are stopped. The project-local Cloudflare client, launchers and runtime origin/session files were removed. Local HTTP development remains available on 5173 with the backend on 8000. The Cloudflare sections below are historical evidence, not current launch instructions; diagnostic logs are retained. No firewall, clock or external account settings were changed.

Prepared October 9, 2026. **Physical-device results are pending.** This guide supports the required [M4 acceptance gate](m4-report.md#required-physical-phone-acceptance--a10p). Desktop or emulated checks do not complete it.

## Connect and launch

Connect the phone and computer to the same Wi-Fi. Keep the computer awake. The current Wi-Fi address is **192.168.1.95**; it can change after reconnecting. Open **http://192.168.1.95:5173** on the phone and sign in with your existing account. The phone has a separate browser session. Use an Admin account for reopening.

To reproduce this session from the project folder, start the database, then keep the application servers running in separate terminals:

```powershell
.\dev.cmd db-start

# Terminal 1
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\scripts\phone.ps1 backend -LanAddress 192.168.1.95

# Terminal 2
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\scripts\phone.ps1 frontend -LanAddress 192.168.1.95
```

The frontend command builds and serves optimized assets for realistic phone loading. It waits for TypeScript/build checks to pass and uses the same API/health proxies. It does not hot-reload: restart the frontend command after code changes to rebuild. This local preview is not production deployment.

Use `ipconfig` to find the Wi-Fi IPv4 address if it changes; restart both application servers with that address. Only Vite port 5173 accepts LAN traffic; backend 8000 and database 55432 stay on loopback. The launcher preserves browser Host/Origin and explicitly allows the phone origin for Django session and CSRF checks. Overrides apply to child processes only. Local .env, firewall, network profile and saved execution policy are untouched. Use a trusted local test network.

If the computer opens the phone URL but the phone times out, check that the phone uses the same Wi-Fi, the network has no guest/client isolation, and Windows Firewall allows this project's Node process on the intended network. No firewall rules were added by the launcher. Recheck the address after changing networks.

Stop application terminals with Ctrl+C, then run `.\dev.cmd db-stop`. For an assistant-launched background session, ask the assistant to stop services. Return to the usual `.\dev.cmd backend` / `frontend` launch for loopback-only access.

## Startup performance correction — October 9, 2026

The initial phone session served Vite development modules. After the owner reported slow opening/refreshing, a fresh anonymous mobile-sized browser measured the following:

| Same simulated conditions | Development server | Optimized preview |
| --- | --- | --- |
| Sign-in ready, cold open | 11.30 seconds | 2.05 seconds |
| Initial resource body bytes | 9.10 MB | 0.56 MB |
| Initial resource requests | 26 | 4 |
| Sign-in ready, refresh | 1.38 seconds | 0.83 seconds |

Conditions: Edge/Chromium at 390 px, 120 ms simulated network latency, 1 MB/s download and 4x CPU slowdown, on this computer. A fresh browser context was used for each mode, followed by a cached refresh. The auth identity request took approximately 140–150 ms including simulated latency. No browser JavaScript errors occurred. Diagnostic JSON is under ignored `.cache/phone-loading-{dev,optimized}.json`.

These measurements demonstrate the development-loading overhead; they are not measurements on the owner's physical phone or a guarantee about Wi-Fi performance. The phone launcher now builds current source and serves the optimized preview at the same address. Static assets reuse browser cache; private API responses remain no-store. The existing shared-entry size warning is still tracked for M7. Physical-device retry and acceptance remain pending.
## Test a dedicated Mass

Create a new Mass titled **Phone test — 2026-10-09** so existing programs are not changed. Use seeded hymns, including one repeated selection. Record defects with device/browser, step, expected/actual behavior and screenshots where useful. Keep the test Mass until results are reviewed.

- [ ] Sign in, open navigation and create a Mass; verify the default Sunday and date-based Maronite season, then a manual override.
- [ ] Open placement pickers; confirm placement suggestions and season/neutral preference. Search, expand filters, and scroll a long list.
- [ ] Add several hymns, acknowledge repeat/classification warnings, edit selection notes, remove one selection and reorder with the left arrows.
- [ ] Enter Mass and selection notes with the keyboard open; scroll to actions and confirm input/focus remain usable.
- [ ] Save draft; verify compact view, order/notes and **Hymn not selected** for empty sections. Reload, select Edit and verify the saved program.
- [ ] Read the inline notice, finalize with one click and verify read-only state without a popup. Check hymn usage/history and Mass history. Repeats count separately.
- [ ] As Admin, reopen and verify usage disappears. Re-finalize and verify counts return once without duplicates. Check Viewer access remains read-only if an account is available.
- [ ] Repeat in portrait and landscape: dialogs scroll, actions are reachable, labels wrap, and there is no horizontal page overflow.
- [ ] With a draft open, disable Wi-Fi **and mobile data**, edit notes and wait for save failure. Reconnect, retry, confirm success, then reload to verify notes/order. Do not reload before retrying unsaved changes.
- [ ] Open the same draft on phone and computer. Make competing edits and verify conflict review retains the local copy. Confirm finalization rejects a stale displayed revision after the other session changes the Mass, refreshes the program and requires explicit review acknowledgement before retry.

Record real-device evidence below and copy accepted results to the M4 report. Unavailable devices remain pending. M4 requires recorded coordinator/phone results and resolved blockers.

| Surface | Device / OS / browser version | Date / reviewer | Result / defects |
| --- | --- | --- | --- |
| iPhone / Safari, portrait and landscape | Pending | Pending | Not tested |
| Android / Chrome, portrait and landscape | Pending | Pending | Not tested |
| Desktop keyboard / focus regression | Pending | Pending | Not tested manually |
| Firefox regression | Pending | Pending | Not tested |
| Coordinator weekly workflow | Pending | Pending | Acceptance pending |

## Phone connection diagnosis — firewall unchanged

On October 9 the owner reported Safari at phone address 192.168.1.72 cannot reach the app or health page. The computer serves both at 192.168.1.95; its route to the phone uses Wi-Fi directly on 192.168.1.0/24. Computer-side checks do not establish phone connectivity. The owner explicitly declined firewall changes. No firewall settings have been changed; the unused proposed firewall script was removed.

The build preview now has explicit port/proxy configuration, one LAN host argument and opt-in request logging. The launcher sets PHONE_TEST_SESSION only for the preview process. Logs record method, path without query strings, status, remote address and duration; headers, cookies and bodies are omitted. Background output is under ignored .cache; foreground launches print it in their terminal. Rebuild/restart the frontend after code changes.

In Safari, enter the full HTTP URL **http://192.168.1.95:5173/phone-check.html**. This page has no JavaScript or external dependencies. If it opens, use its backend check and app links. If it times out, note the retry time so the preview log can show whether a request reached the server. An absent phone request and a successful computer request mean the phone-to-server path remains unresolved; rebuilding alone cannot demonstrate or repair that path. Fresh verification passed frontend format/lint/type/build checks, all 16 served asset hashes and JavaScript MIME types, plain-page delivery, database readiness and API proxy/no-store checks over the LAN URL. The mobile simulation reached sign-in in 2.03 seconds cold and 0.71 seconds on refresh with no JavaScript errors. These are computer-side results; a physical Safari retry is pending. Physical-phone acceptance remains blocked on successful connection.
### Follow-up connection result

The owner retried Safari on ports 5173 and 3000; both plain-page requests timed out. No completed requests from 192.168.1.72 appeared in either preview log. Computer-side HTTP/API/CSRF checks succeeded on both ports, and two ICMP probes to the phone succeeded (78/115 ms). The owner reports no VPN. This narrows the problem to the phone-to-server connection path but does not identify a specific blocking component. The attempted read-only Windows Filtering Platform event query required elevation; the elevation request was canceled, so no event evidence was obtained. No firewall, network profile, or routing changes were made. The unused comparison server on port 3000 was stopped; the optimized app remains running on port 5173. Physical-phone testing is blocked on connectivity and must not be marked accepted. A currently working local app's exact Network URL/runtime would provide a useful comparison.
## Direct Django test — October 10, 2026

The owner authorized the research recommendation to test Django without Vite.
The database is running on loopback port 55432. Django is now running with the
explicit direct-test option on **0.0.0.0:8000**, allowing the verified computer
address **192.168.1.95** in its process-only host settings. No .env, firewall,
network-profile or saved execution-policy settings were changed. The frontend
is stopped during this isolated test.

Computer-side checks passed Django system checks, a PostgreSQL SELECT 1, and
HTTP 200 with **{"status":"ok"}** at **http://192.168.1.95:8000/health/live/**.
Phone/Safari confirmation is pending; these results do not complete A10P.

To reproduce, start PostgreSQL, then launch from the project folder:

```powershell
.\dev.cmd db-start
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\scripts\phone.ps1 backend -LanAddress 192.168.1.95 -DirectBackend
```

Open **http://192.168.1.95:8000/health/live/** in Safari. This endpoint checks
Django's HTTP process independently of the database. The readiness endpoint at
**http://192.168.1.95:8000/health/ready/** also checks PostgreSQL.

A successful phone response isolates the original difficulty to the frontend
access path and motivates a focused comparison of the Vite/Node server. A timeout
on this direct test leaves the phone-to-computer connection unresolved. Keep
actual phone results pending until reported.

After diagnosis, stop the direct backend with Ctrl+C (or ask the assistant to
stop its background launcher), then run the ordinary phone backend command
without DirectBackend to return Django to loopback-only mode. The normal
frontend proxy remains the default full-app setup. The database is never
exposed to the LAN by this switch.

## Live connection trace — October 10, 2026

Following another physical-phone timeout, the frontend was launched exactly with
`--host 0.0.0.0 --port 5173 --strictPort`. It is a development server for this
requested comparison; the optimized preview remains the recommended acceptance
mode. Django's direct diagnostic listener remains on 0.0.0.0:8000 and PostgreSQL
remains on 127.0.0.1:55432. These are session observations, not persistent services.

Opt-in logging now covers both development and preview. It records accepted TCP
connections, HTTP request starts, and completed responses. This distinguishes a
request that never reaches Node from an HTTP request that stalls in middleware.
The logger excludes query strings, headers, cookies and request/response bodies.
It is disabled unless PHONE_TEST_SESSION=true. Type checking, ESLint and formatting
passed after this diagnostic change.

Computer-side plain-page and proxied readiness checks returned HTTP 200. The
Wi-Fi route to the previously reported phone address 192.168.1.72 remains direct;
two fresh pings succeeded in 14 and 29 ms. No phone-address connections appeared
in the new Node log or the sampled TCP connection table. Only computer-origin
requests were observed. A new Safari retry/result was requested and remains
pending; chat access does not itself test the phone-to-app network path.

Read-only Windows policy checks show the active network uses the Public profile,
its firewall is enabled, and its default inbound action is Block. No application
allowance exists for the project's Node or Python executable. The generic-looking
Public TCP allowances inspected belong to built-in packaged applications; no
project/port allowance was found. This identifies a likely host-policy blocker,
not a captured packet-drop diagnosis. No policy, rule, routing, or network-profile
changes were made and no administrator prompt was retried.

A firewall-free alternative has been prepared, but **not started**: a temporary
Cloudflare Quick Tunnel restricted to one owner-approved email address. The
2026.10.0 Windows client was downloaded into ignored .local/cloudflared and its
SHA256 matched the official GitHub release asset digest. Help output confirms
--allowed-mail support. The reviewed launch helper is in ignored
.cache/phone-tunnel-launch.ps1; it always requires an exact email allow list,
disables auto-updates and directs explicit logs into the project. Starting it
would route app traffic through Cloudflare and let Cloudflare send the allowed
visitor a login code, so owner approval and the intended email are required.
Nothing has been published or sent by this preparation. After approval, allow only
the generated hostname/origin in the application processes, verify session/CSRF
handling, then obtain physical Safari acceptance. Stopping cloudflared removes
the temporary URL. This is a testing workaround, not a repair of LAN policy.

References: [Windows Firewall rule behavior](https://learn.microsoft.com/en-us/windows/security/operating-system-security/network-security/windows-firewall/rules),
[Cloudflare Quick Tunnels and email protection](https://developers.cloudflare.com/tunnel/get-started/quick-tunnels/).

### Historical protected HTTPS session — October 10, 2026, 21:27 Beirut (removed)

The owner approved the protected Cloudflare session by providing the allowed
email. At that time the tunnel ran with --allowed-mail (one exact email),
--no-autoupdate and HTTP/2. The provider log confirms One-Time PIN authentication
and a registered edge connection. The temporary URL is recorded in ignored
.cache/phone-tunnel-origin.txt; it changes on every tunnel restart.

This session uses a separate **built preview on 127.0.0.1:5174**, proxying to a
separate Django process on **127.0.0.1:8001**. The requested LAN development
server on 5173 and direct diagnostic backend on 8000 remain available. All
backends use the existing loopback database, without migrations or data changes.
Cloudflare can reach only the private built preview through its outbound tunnel;
no firewall, network-profile, .env, saved policy or Windows service was changed.

Vite allows only the generated tunnel hostname in its additional process-scoped
host list. The private backend uses production-style debug/cookie settings,
trusts only the exact HTTPS testing origin, and accepts the forwarded HTTPS
scheme from its loopback proxy. HSTS is disabled for the disposable hostname.
These overrides live in ignored .cache/phone-tunnel-backend.py and apply only to
that backend process; normal application settings are unchanged.

Verification recorded in .cache/phone-tunnel-check.json:
- Built login HTML and both proxied health endpoints return HTTP 200 with the
  tunnel Host/HTTPS headers.
- CSRF bootstrap returns HTTP 200 and a Secure cookie.
- A login request with a valid CSRF token and the approved HTTPS origin reaches
  credential validation (HTTP 400 invalid_credentials for a nonexistent QA user).
- The same request with an untrusted origin is rejected (HTTP 403 csrf_failed).
- An unauthenticated request through the public HTTPS URL receives HTTP 302 to
  login.trycloudflare.com. It cannot reach the app before email authentication.
- TypeScript/build succeeded; the previously tracked shared-entry size warning
  remains. This is a temporary testing session, not a production deployment.

The phone owner was given the HTTPS link and asked to complete email authentication
and confirm the Choralation sign-in page. That actual Safari result is still
pending. Neither the tunnel nor these checks mark M4 physical-device acceptance
complete. The LAN policy diagnosis remains a likely cause; the tunnel is an
approved alternate path, not a change to that policy.

Ignored helpers: .cache/phone-tunnel-launch.ps1 starts the protected connector;
.cache/phone-tunnel-backend.ps1 and .cache/phone-tunnel-frontend.ps1 start the
private application pair. The generated origin must be refreshed and both private
application processes restarted when the tunnel hostname changes. Process IDs
are in .cache/phone-tunnel-session.json, and all logs are in .cache. Ask the
assistant to stop this session when testing ends; stop only those verified process
trees. The URL and email access end when cloudflared stops. No changes were staged
or committed.

### Safari reaches the protected gateway; clock skew rejects login

The owner reported Forbidden on the first protected-link attempt and Bad Request
on refresh. The connector log at 18:30:27 UTC identifies the first failure as
JWT validation: token issued in the future (iat). Subsequent callbacks report
missing authentication-state cookies. The application logs have no corresponding
phone request: rejection occurs in cloudflared before origin selection.

Fresh TLS-verified HTTP Date checks against the Cloudflare login server,
Cloudflare website and Microsoft website agree that the computer's clock is
approximately 62 seconds slow (request round trips under one second). Windows
Time reports not synchronized; its configured domain source is DATA-SRV.ltgrp.local.
The cloudflared 2026.10.0 source confirms broker claims use the local UTC clock
and that the handler clears the state cookie before assertion validation. This
explains both reported errors without weakening token or origin validation.

A one-time clock correction is prepared in ignored .cache/phone-sync-clock.ps1.
Its default is read-only; the measurement was executed and recorded
Applied=false with OffsetSeconds=62.02. Apply requires administrator access,
uses a fresh TLS-verified server Date with an elapsed-time adjustment, rejects
large/slow samples, and leaves configured time servers and firewall unchanged.
The owner was asked to approve that computer-wide action; no time change has
been applied yet. After a correction, reopen the app's /login URL to start a
fresh authentication flow rather than refreshing the already-consumed callback.
Physical Safari acceptance is still pending.

Source inspected: [cloudflared broker assertion validation](https://github.com/cloudflare/cloudflared/blob/2026.10.0/quicktunnelauth/assertion.go),
[callback handling](https://github.com/cloudflare/cloudflared/blob/2026.10.0/quicktunnelauth/handler.go).

## October 10 picker and drag follow-up

Use the left drag handle to reorder hymns within a placement. Verify finger dragging and viewport edge scrolling, interrupted-touch cancellation, saved notes/order after refresh and normal scrolling outside the handle. Picker language/genre/sort share one row; phones show cards while desktop shows a sortable table. Confirm Any-season choices produce no season notice. Automated Chromium touch/phone-width checks are supporting evidence only; physical Safari/Chrome results remain pending. See [picker review](picker-review.md).
