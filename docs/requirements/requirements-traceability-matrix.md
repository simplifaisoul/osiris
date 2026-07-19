# Unified Requirement Traceability Matrix

Tarih: 2026-07-18  
Durum değerleri: `IMPLEMENTED`, `PARTIAL`, `PLANNED`, `BLOCKED_DECISION`.

Bu matris, birleşik envanterdeki 60 alanın her birini kod bileşeni ve ölçülebilir kabul testine bağlar. `PARTIAL` ve `PLANNED` satırları tamamlanmış kabul edilmez.

| ID | Source clause | Component | Acceptance test / evidence | Phase | Status |
|---|---|---|---|---:|---|
| F-001 | A §4 | `services/api/app/domain/models.py`, `schemas.py`, migration 0001 | Common Object happy/error schema; provenance/tenant/hash DB constraints | 1 | PARTIAL |
| F-002 | A §5, §23 | `services/ingestion/app/connectors/*`, `packages/contracts/schemas/connector-manifest.schema.json` | SDK core + 12 manifests + JSON-schema contract shipped and tested (36 tests); missing key => CONFIGURATION_REQUIRED verified; ≥60 catalogue + Kafka/object-store sinks remain | 2 | PARTIAL |
| F-003 | A §6.1 | existing `src/app/api/flights/route.ts`; future aviation connector | ADS-B normalize, NOTAM/airspace contract, route anomaly tests | 2 | PARTIAL |
| F-004 | A §6.2 | existing maritime route; future AIS connector | AIS dedup, off/identity-change, port-waiting tests | 2 | PARTIAL |
| F-005 | A §6.3 | satellites/space-weather/Sentinel routes; future analytics | TLE freshness, SGP4/pass/SAR change acceptance | 2/5 | PARTIAL |
| F-006 | A §6.4 | flights GNSS derivation; future `analytics/gnss.py` | multi-aircraft/baseline false-positive test; forbidden verdict vocabulary | 2/5 | PARTIAL |
| F-007 | A §6.5 | CCTV routes/viewer; future licensed connector manifests | license basis, health, authorized analysis tests | 2 | PARTIAL |
| F-008 | A §6.6 | earthquake/fire/weather/air-quality routes | source normalization and infrastructure-distance integration | 2 | PARTIAL |
| F-009 | A §6.7 | news/GDELT/live-news routes | source license, dedup, archive and provenance tests | 2 | PARTIAL |
| F-010 | A §6.8 | news Telegram public preview; future connector | public-only channel, geoparsing, source-return tests | 2 | PARTIAL |
| F-011 | A §6.9 | passive CTI routes; future `analytics/cti.py` | STIX/TAXII, allowlist and no-exploit tests | 5 | PARTIAL |
| F-012 | A §6.10 | crypto/sanctions routes; future financial analytics | alias match evidence; no on-chain identity verdict test | 5 | PARTIAL |
| F-013 | A §6.11 | conflict/frontline routes; future event connector | source date/version and analyst validation tests | 2 | PARTIAL |
| F-014 | A §6.12 | infrastructure route; future classified layer service | authorized-network and distance impact tests | 2 | PARTIAL |
| F-015 | A §9 | existing MapLibre UI; future vector tile service | 10K entity rendering, viewport delta, geofence/replay e2e | 1/2 | PARTIAL |
| F-016 | A §10 | future watchlist API/alerting service | threshold activation, frequency/backfill/termination tests | 5 | PLANNED |
| F-017 | A §10 | current alerts UI; future alerting service | ingest-to-durable-alert p95 ≤180 s; AI close denied | 5 | PARTIAL |
| F-018 | A §8, §11 | graph panel; future graph repository/fusion | path/community/evidence and map bidirectional selection | 5 | PARTIAL |
| F-019 | A §11 | future case service | four-eyes, evidence hash/custody, immutable history e2e | 5 | PLANNED |
| F-020 | A §12 | search UI; future OpenSearch service | full-text/Boolean/semantic/visual; frequent-query p95 <300 ms | 5 | PARTIAL |
| F-021 | A §13 | future archive/media-processing services | magic byte/malware/proxy/storyboard/recall/hash tests | 5 | PLANNED |
| F-022 | A §7 | existing AI routes; future AI/media services | 17-language quality corpus; STT/OCR/vision lineage tests | 4 | PARTIAL |
| F-023 | A §7.4 | future campaign analytics | explained score/indicator output; definitive verdict rejected | 4 | PLANNED |
| F-024 | A §8 | future fusion service | cross-domain correlation with conflict/missing evidence fields | 4 | PARTIAL |
| F-025 | A §14, B §3.2.20 | future reporting service | required formats, metadata, RBAC/audit and watermark tests | 3/6 | PLANNED |
| F-026 | A §15, B §3.1.8-9 | SDK ingest/SSE; future integration adapters | idempotency/retry/DLQ and SPYS/MYS/KAM-BAKS contract tests | 1/6 | PARTIAL |
| F-027 | A §16, B §3.1.8 | `security/principal.py`, `policy.py`, ADR-002 | valid/expired/wrong-audience JWT; role/tenant/classification negatives | 1 | IMPLEMENTED |
| F-028 | A §16, B §3.2.12-14 | secret-file config, CSP, ADR-004, K8s | no hardcoded secret; TLS/mTLS deployment and rotation tests | 1/6 | PARTIAL |
| F-029 | A §16, B §3.2.19 | `domain/audit.py`, `audit_events`, audit API | happy chain and tamper detection; SIEM delivery later | 1/6 | PARTIAL |
| F-030 | A §17 | future CI scripts/GitLab/Jenkins | all 20 gates; failed gate blocks promotion; signed rollback | 6 | PLANNED |
| F-031 | A §18, B §3.2.19.2 | Compose/K8s baseline; future HA overlays | node/DB/broker failure and measured RPO/RTO | 1/6 | PARTIAL |
| F-032 | A §19, B §3.2.19 | health/ready/metrics/OTel baseline | dependency 503, metric scrape; full dashboards/alerts later | 1/6 | PARTIAL |
| F-033 | A §20, B §3.2.3 | existing design system/map UI | contrast, keyboard, 16:9/tablet/browser accessibility tests | 1/6 | PARTIAL |
| F-034 | B §3.3.2 | planning schema/service; UI after ADR-001 | HİP Poka-Yoke, PTD/HİAD/2nd query/template tests | 1/3 | PARTIAL |
| F-035 | B §3.3.3 | planning period schema; future SHP service | exact 20-year period and six submodule data transfer | 1/3 | PARTIAL |
| F-036 | B §3.3.4 | planning period/currency schema; future OYTEP | exact 10-year, source/financing and approval tests | 1/3 | PARTIAL |
| F-037 | B §3.3.5 | future SPYS ARGE service | PTD/ÖYE/PİTD/statistical report template tests | 3 | PLANNED |
| F-038 | B §3.3.6 | future Modernisation service | preparation/plan/package/program/statistics tests | 3 | PLANNED |
| F-039 | B §3.3.7 | future Sustainment service | two submodules, three stock tables and report tests | 3 | PLANNED |
| F-040 | B §3.3.8 | future Infrastructure service | SHP plan/report and OYTEP programme tests | 3 | PLANNED |
| F-041 | B §3.3.9 | future Workforce service | status/specialty and yearly workforce/resource tests | 3 | PLANNED |
| F-042 | B §3.3.10 | future Force Structure service | TBS and four-plan consistency tests | 3 | PLANNED |
| F-043 | B §3.3.11 | future Urgent Need service | PTD/workflow and bypass-isolation tests | 3 | PLANNED |
| F-044 | B §3.3.12 | future HARDES service | project type/card/update/tracking tests | 3 | PLANNED |
| F-045 | B §3.3.13 | future ARMERKOM service | project scope and configurable tracking template | 3 | PLANNED |
| F-046 | B §3.3.14 | future Budget service; decimal foundation | allocation, multi-year percentage and report tests | 1/3 | PARTIAL |
| F-047 | B §3.3.15 | future Life Cycle service | inventory-entry and force-structure yearly planning tests | 3 | PLANNED |
| F-048 | B §3.3.16 | planning workflow/allocation model; future module | document/decision/delivery plus 92/31-day DEMAT boundaries | 1/3 | PARTIAL |
| F-049 | B §3.3.17 | future Period service | immutable close, copy, activate and historical report tests | 3 | PLANNED |
| F-050 | B §3.1.10.6 | `domain/services.py` Decimal conversion | 0.1+0.2 exact, rounding, invalid rate and currency tests | 1 | IMPLEMENTED |
| F-051 | B §3.1.25.2, §3.2.18.10 | planning Pydantic/state machine/DB checks | missing/range/reference/transition negatives; UI after ADR-001 | 1/3 | PARTIAL |
| F-052 | B §3.2.7 | DEMAT expiry rule; future notification service | 92/31-day delivery, mute preference and trace tests | 1/3 | PARTIAL |
| F-053 | B §3.2.20 | future SPYS reporting service | filter/format/background/preview/watermark/RBAC/archive | 3 | PLANNED |
| F-054 | B §3.2.5, §3.3.17 | future archive/period service | archive immutability, retention and historical query | 3 | PLANNED |
| F-055 | B §3.2.19 | audit chain baseline; future SIEM/retention policy | 5-year WORM/SIEM/disk-growth/per-period report tests | 1/6 | PARTIAL |
| F-056 | B §3.1.13 | future acceptance evidence package | independent A-class report and all findings closed gate | 6 | PLANNED |
| F-057 | B §3.2.8.4, §3.2.15-18 | future GitLab/Jenkins pipelines | parallel trigger/static/image/test/rollback/audit tests | 6 | PLANNED |
| F-058 | B §3.1.8, §3.2.3-16 | IAM/policy foundation; UI after ADR-001 | claim mapping, role screen, timeout/lockout delegation, F/Q/shortcut | 1/3 | PARTIAL |
| F-059 | B §3.2.6, §3.2.18.10 | Pydantic/Zod schemas and DB constraints | email/regex/range/reference/mandatory/error happy-negative suite | 1/3 | PARTIAL |
| F-060 | B §3.1.23, §3.3.* | common object document metadata; future document service | magic bytes/version/author/date/template/access audit tests | 3 | PLANNED |

## Clarification trace

The 82 tender-deferred clauses listed in `unified-feature-inventory.md` map to the relevant F-034-F-060 rows and remain `REQUIRES_CLARIFICATION`. They may pass acceptance only with a versioned template and Institution approval reference; a placeholder is not treated as implemented behavior.

