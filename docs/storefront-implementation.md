# Website PhoneHouse — implementation and rollout

## Delivered in this change

- Public route `/cua-hang` and product URLs `/cua-hang/san-pham/:catalogItemId`, without moving the existing CRM or customer portal.
- Reference-led retail layout: red search header, category menu, service shortcuts, two campaign panels, category tiles, compact product grids, filters, branch picker, product variants, customer-care links and mobile bottom navigation. PhoneHouse identity and content only; no FPT logos, business claims, discounts or product database copied.
- Tokens: retail red `#cb1c22`, dark red `#a31319`, canvas `#f3f4f6`, white `#ffffff`, text `#18181b`, supporting grey `#64646e`. Arial/Segoe UI, a 1200px container, left-aligned merchandise information. Banner artwork is code-native illustration; product images come from explicit public catalogue/model content or already-published store presentations.
- `GET /api/storefront/products`: all active Product Master entries (DEVICE / ACCESSORY / PART), including unpriced and zero-stock entries. Search, kind/brand/budget/in-stock filters, stable tie-breaking and filter-bound paging. Reads Firestore in 500-document batches, not a silent first-1000 limit. Per-instance 30-second single-flight cache; request submission bypasses that cache.
- `GET /api/storefront/products/:id`: public allowlisted detail and related configurations.
- Stock from active branches: available devices, accessory `inventoryBalances`, part inventory. Reserved/sold devices and closed branches are excluded. SKU/legacy model matches must be uniquely exact; explicit master links take precedence. Projection quantities are not counted twice.
- Retail policy branch/item/SKU/model-variant priorities; Product Master fallback, then legacy physical prices. Missing prices remain null/“Liên hệ”, never a made-up selling price. Unchosen branch uses stocked-branch prices first.
- Persistent cart stores only identifiers and quantities; prices are reloaded. Contact details are not persisted in browser storage.
- The visible first catalogue page refreshes every 60 seconds without replacing existing cards with a loading skeleton. Auto-refresh pauses for open dialogs/product detail and expanded pagination; manual refresh remains available. This is periodic stock visibility, not a real-time stock guarantee. Request submission rechecks current server data.
- `POST /api/storefront/orders`: **purchase requests**, not sales orders. Server-side validation, price recheck, consent, honeypot, per-phone transaction-based limit, App Check, IP rate limit and idempotent submission. No stock reservations, invoices, payments, shipment booking or revenue entries.
- CRM → Website & Mini App khách hàng → Đơn từ website: branch-scoped inbox, NEW → CONTACTED → CLOSED/CANCELLED with expected-state checks. Staff use existing POS after confirming the actual unit and terms with the customer. Closing a request does not create a sale.
- `POST /api/storefront/assistant`: existing Telegram & AI shared key/config, server only. AI extracts a bounded shopping intent (model, budget, condition); the server supplies catalogue truth. Model-generated prices, URLs and actions are discarded. Human/personal enquiries link to OTP-protected customer care; the existing CUSTOMER_PORTAL omnichannel provider is reused.
- Public promotion banners/articles reuse published customer-portal campaigns. Existing AI content studio remains the editing/publishing tool.
- Route-level lazy loading separates the storefront, customer portal and CRM bundles.

### Product media, specifications and accessories

- Product Master and Catalog Model now have an explicit public-content block: primary image, gallery URLs (up to eight displayed images including the primary image), approved description, highlights and a bounded specification table. Internal notes, cost fields, IMEI/unit identifiers and unpublished inventory media are never used as public content.
- A published physical inventory row contributes only its existing public cover (or the first legacy device image used by miniweb), never its complete inspection album. Publish additional approved photos explicitly in the master/model gallery.
- A device inherits images in a deterministic order: SKU master → same model and colour sibling → explicitly published branch presentation → published miniweb variant → generic model. Captions distinguish catalogue/reference and already-published store images; none implies confirmation of the exact used-phone unit. Text uses SKU → published miniweb variant → published stock → model; higher-priority specifications override identical labels. Variant fields imported under `attributes` are normalized locally for the same model/storage/condition content key without modifying pricing or ledger identifiers.
- CRM editing is under Danh mục → Model/Sửa SKU. Use the Model form for content shared by configurations and the SKU form only for a real configuration override. Gallery lines are trimmed and validated on the server; only HTTPS or safe relative paths are accepted. Saving invalid content does not partially publish it, and the in-process storefront snapshot is invalidated immediately.
- Website & Mini App → Cấu hình miniweb now includes a public-content audit: staff can filter active products missing images, descriptions, specifications, confirmed accessory compatibility or retail price, then edit the SKU or its shared model content with optimistic revision checks. The audit never exposes private notes, costs, IMEIs or inspection albums; price/stock remain server-authoritative.
- Accessories and parts are related only when the master has an exact compatible-model ID or code; legacy exact model names are supported only when no stronger reference exists. Related cards reuse normal branch price/availability and add the exact accessory identifier to the cart. A phone's model image/specifications are never inherited by an accessory merely because it references that phone for compatibility, and that legacy phone reference is not shown as the accessory's own model.
- The synthetic preview includes clearly labelled SVG fixtures for a front/back phone gallery and cable accessory. It is useful for UI flow checks only, is loopback-only and never writes Firebase. Replace or approve real Product Master media before publishing production pages.

## Verification

- Verified on 2026-10-13 with `npm run verify`: type checks, lint, 109 passing test files / 715 passing tests (1 file / 16 emulator-dependent tests skipped), client-write boundary and production client/server build. The existing large Firebase vendor-chunk warning remains.
- Browser QA covered desktop and 390px/320px layouts, search/filter, product detail, configuration selection, cart and synthetic purchase-request submission. Unpriced totals say “Chờ báo giá”; expanded pagination remains intact during automatic refresh; no new browser errors appeared in the final chat open/close check.
- New tests cover >1000 catalogue rows, no-stock/no-price visibility, inactive records, stock linkage ambiguity, branch filtering, reserved inventory, public-field privacy, safe images, policy priority, pagination, stale prices, idempotency, phone rate limits, staff scope/state and App Check.
- AI provider tests are mocked: they verify shared configuration and server-derived replies without spending credits or making real provider calls.
- Local visual QA can run with `npx tsx scripts/preview-storefront.ts`, then open `http://127.0.0.1:3100/cua-hang`. This script uses **synthetic in-memory data only**, binds to loopback, rejects production/Vercel environments, and is never imported into the production server. Preview purchases do not write Firebase, notify customers, or reserve stock.
- Real data development requires existing Firebase Admin credentials. The checked local env files did not contain those credentials at implementation time. No credentials were copied into source code.

## Not yet completed / must not be advertised as live

This is the catalogue + purchase-request phase of the ecommerce plan, not the entire plan and not a pixel-identical copy of FPT Shop.

1. Atomic online-order reservation sharing POS ownership rules; shop selects the used-phone unit and customer confirms its actual condition/photos.
2. payOS QR creation, signed/idempotent payment webhooks, payment reconciliation, refunds, and preventing duplicate cash posting when converting to an invoice. Credentials and merchant channel must be verified before activation.
3. GHTK fee/booking/tracking/webhook/COD reconciliation; delivered and COD settled are different states. Credentials and pickup configuration must be verified. No mock courier fees shown to customers.
4. Cart/order account history, transactional notifications and a durable outbox for external side effects.
5. Share the safe catalogue-intent assistant with Facebook Messenger and Zalo OA only after channel ownership, consent, messaging eligibility and handoff behavior are verified. Existing channel integrations are not automatically reconfigured by this change.
6. Public SSR/SEO (canonical metadata, structured data, sitemap), complete approved commerce/privacy/shipping policies, real campaign artwork, and final production content review.
7. Scale to a materialized/search-indexed public read model if full-catalog scans become expensive; the current cache is per instance, not a distributed synchronization guarantee.

## Release checks

1. Run `npm run verify` and browser-check desktop/mobile.
2. Verify deployed Firebase Admin access and production App Check site/domain configuration. Guest catalogue reads intentionally do not need App Check; AI and contact mutations always do in production.
3. Confirm Product Master names/images/prices/active flags, master-to-stock links and the public active-branch list. Product/campaign image hosts must satisfy the existing production Content Security Policy (prefer the project's Firebase Storage). No data migration is performed automatically.
4. Check the scoped staff request inbox with a non-admin account.
5. Obtain the user's deployment instruction, then commit/push/deploy via the existing Vercel workflow. This change does not deploy archived `functions/` or activate payment/shipping providers.
