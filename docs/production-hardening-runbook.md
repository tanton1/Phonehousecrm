# PhoneHouseCRM production hardening

## Required production configuration

- `CORS_ALLOWED_ORIGINS`: comma-separated trusted web origins.
- `TELEGRAM_BOT_TOKEN`, `TELEGRAM_CHAT_ID`, `TELEGRAM_WEBHOOK_SECRET`: all three are mandatory when Telegram is enabled.
- `TELEGRAM_ALERTS_ENABLED=true` and `TELEGRAM_QUERIES_ENABLED=true`: enable attendance alerts and operational queries separately.
- `TELEGRAM_OWNER_USER_IDS`: comma-separated Telegram user IDs allowed to query the `all` scope. Group members may query a named branch, but not the whole system.
- `ATTENDANCE_ALERT_CRON_SECRET`: required by `/api/telegram/scan-attendance` and `/api/telegram/dispatch`.
- Firebase Admin credentials must support Cloud Storage signed URLs for the evidence API.
- Configure Cloud Storage CORS for `PUT` from the production web origin before enabling evidence uploads.

Register the Telegram webhook with `secret_token` equal to `TELEGRAM_WEBHOOK_SECRET`. The server rejects missing or mismatched secrets and unknown chat IDs.

Schedule `GET /api/telegram/scan-attendance` every five minutes with `Authorization: Bearer <ATTENDANCE_ALERT_CRON_SECRET>`. The scan owns the full five-minute grace period, suppresses overnight false positives, writes one deterministic outbox event, then dispatches pending/retry events. This scheduler is external to the web browser and must be enabled in the Production hosting account.

Supported group examples:

- `/doanhso homnay PH109`
- `/doanhso tuan PH109`
- `/doanhso thang all` (configured owner only)
- `/imei 55555`
- `/kythuat PH109`
- `/tonkho PH109`

## Release order

1. Deploy the server and web application.
2. Deploy `firestore.rules`, `storage.rules`, and indexes from the same commit.
3. Verify `/api/health` and `/api/ready` without exposing database error details.
4. Test attendance session creation, check-in, check-out, evidence upload, Telegram webhook status, `/doanhso`, `/imei`, and one scheduler invocation using production-like accounts.
5. Roll back the application and Rules to the same previous release if a health check fails.

## Client write boundary

New browser Firestore writes are rejected by `npm run check:client-writes`. Existing legacy writers remain isolated in `src/services/firestoreService.ts` while their screens are migrated to server APIs. Do not add another allowlisted file.

## System-wide administration reads

`/api/admin/operational-snapshot` is ADMIN-only and capped at 200 records for every included domain. It returns a `summary` with exact total/loaded/partial values so the cap is never silent. Do not replace it with an unscoped Firestore listener. Concrete branch screens may use realtime queries only when `branchId` is present in the query.

## Evidence lifecycle

The browser requests a short-lived upload URL. The server validates branch/resource access and then records SHA-256, MIME type, object size, actor and timestamps. Browser direct Storage reads/writes are denied. Revocation is append-only metadata; it does not delete the audit record.

## Attendance policy

A live camera photo is required as supporting evidence at check-in, but it is not biometric authorization. A two-minute, one-use server session is bound to user, branch, device, IP and action. Invalid GPS creates `PENDING_REVIEW`; a browser embedding can never create `VERIFIED` attendance. Foreground GPS heartbeats are observed only while PhoneHouseCRM remains open; a web app cannot claim continuous background tracking when the browser or phone suspends it.

## Local verification

Run `npm run verify`. Rules Emulator tests also require Java 21: `npm run test:rules`. GitHub Actions installs Java automatically.
