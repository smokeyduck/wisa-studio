# WISA STUDIO opt-in diagnostics design

**Design only.** WISA STUDIO does not implement a first-party diagnostics collector here. The existing Core OTLP export is a separate feature: `telemetry.otlpExportEnabled` allows export to configured `OTEL_*` endpoints and takes effect after relaunch. Do not route Core OTLP data into the proposed WISA endpoint.

## Consent and scope

- Off for new and existing profiles. No diagnostics request before explicit opt-in; no bundled consent with updates, gateway login, or use of the app.
- A Diagnostics setting names the operator, endpoint, exact data, retention, and disable control before asking for consent. Users can decline without losing functionality. A material change in payload or destination requires fresh consent.
- Disabling takes effect immediately: stop sending, abort pending uploads, and discard queued diagnostics. Do not persist an upload queue across launches or retry failed sends. Failure never blocks launch or chat.

## Proposed payload

One sampled startup outcome per launch, from a fixed outcome list (`ready`, `failed`, `timed_out`), with the released app version, OS family (`macOS`, `Windows`, `Linux`), and a coarse elapsed-time bucket. This measures regressions in reaching readiness without collecting prompts or tracking individuals. No durable install/session identifiers, filters that key on a user or workspace, source text, prompts/replies, tool outputs, filenames, model/provider IDs, credentials, exception payloads, crash dumps, or hardware fingerprints. Do not claim crash reporting: the app may fail before a diagnostic can be sent.

## Server requirements before implementation

The owner must approve the exact HTTPS endpoint, hosting operator, retention, and access policy. Validate an allowlist of fields and enum values at ingress; discard rejected payloads without logging bodies. IP addresses are necessarily visible at the network boundary: prohibit their storage in diagnostics and configure the proxy, host, and application access logs accordingly. Proposed retention: 14 days for individual events, then delete them; keep only aggregate operational counts. No combination with gateway, billing, or account records. Publish the actual policy before collecting any event.

## Acceptance

On an isolated profile, capture requests through first launch, upgrade, refusal, opt-in, and opt-out. Verify zero pre-consent and post-opt-out diagnostics, only allowlisted fields after opt-in, and no disk queue. Confirm that a slow or failing collector does not delay startup and verify access-log and retention settings on the deployed collector before enabling delivery.
