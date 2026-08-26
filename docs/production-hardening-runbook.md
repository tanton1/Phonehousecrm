# PhoneHouseCRM production hardening

## Required production configuration

- `CORS_ALLOWED_ORIGINS`: comma-separated trusted web origins.
- `TELEGRAM_BOT_TOKEN`, `TELEGRAM_CHAT_ID`, `TELEGRAM_WEBHOOK_SECRET`: all three are mandatory when Telegram is enabled.
- Firebase Admin credentials must support Cloud Storage signed URLs for the evidence API.
- Configure Cloud Storage CORS for `PUT` from the production web origin before enabling evidence uploads.

Register the Telegram webhook with `secret_token` equal to `TELEGRAM_WEBHOOK_SECRET`. The server rejects missing or mismatched secrets and unknown chat IDs.

## Release order

1. Deploy the server and web application.
2. Deploy `firestore.rules`, `storage.rules`, and indexes from the same commit.
3. Verify `/api/health` and `/api/ready` without exposing database error details.
4. Test attendance session creation, check-in, check-out, evidence upload, and Telegram `/report` using production-like accounts.
5. Roll back the application and Rules to the same previous release if a health check fails.

## Client write boundary

New browser Firestore writes are rejected by `npm run check:client-writes`. Existing legacy writers remain isolated in `src/services/firestoreService.ts` while their screens are migrated to server APIs. Do not add another allowlisted file.

## System-wide administration reads

`/api/admin/operational-snapshot` is ADMIN-only and capped at 200 records for every included domain. It returns a `summary` with exact total/loaded/partial values so the cap is never silent. Do not replace it with an unscoped Firestore listener. Concrete branch screens may use realtime queries only when `branchId` is present in the query.

## Evidence lifecycle

The browser requests a short-lived upload URL. The server validates branch/resource access and then records SHA-256, MIME type, object size, actor and timestamps. Browser direct Storage reads/writes are denied. Revocation is append-only metadata; it does not delete the audit record.

## Attendance policy

Face photos are optional supporting evidence only. A two-minute, one-use server session is bound to user, branch, device, IP and action. Invalid GPS or store network creates `PENDING_REVIEW`; a browser embedding can never create `VERIFIED` attendance.

## Local verification

Run `npm run verify`. Rules Emulator tests also require Java 21: `npm run test:rules`. GitHub Actions installs Java automatically.
