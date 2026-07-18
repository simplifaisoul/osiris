# KAM Multi-INT + SPYS Fazlı Uygulama Yol Haritası

Tarih: 2026-07-18  
Girdi: `unified-feature-inventory.md`, `codebase-gap-analysis.md`  

## Değişmez uygulama ilkeleri

- Mevcut Next.js API route’ları korunur; davranış değişiklikleri contract test ile kapılanır.
- Mevcut `package-lock.json` byte-for-byte korunur. Faz 1 başlangıç SHA-256 değeri `bb89d1a0017487daa132fa5598e8d9030ad22a0723349614b1262c5ec7cb9f9f`’dir.
- Root `package.json` bağımlılıkları lockfile onayı olmadan değiştirilemez. Script eklemek mümkündür. Yeni backend bağımlılıkları ayrı Python servisinde pinlenir.
- SPYS kullanıcı arayüzü ADR-001 Kurum onayı gelmeden yazılmaz. Faz 1 yalnız SPYS domain/schema/API sözleşmesini kurar.
- Tüm örnek kayıtlar `is_synthetic=true`, `source_type=SYNTHETIC` ve görünür `SENTETİK` etiketi taşır.
- SPYS deployment profile genel ağa çıkmaz; public connectorlar build ve runtime’da kapalıdır.

## Faz 1 - Foundation

### Kapsam

F-001, F-015 foundation, F-026 foundation, F-027-F-029, F-031-F-032 baseline, F-034-F-036 schema baseline, F-048 expiry model, F-050-F-052 foundation, F-054-F-055 foundation, F-058-F-060 validation/document metadata baseline.

### Dosyalar

Oluşturulacak:

```text
services/api/pyproject.toml
services/api/Dockerfile
services/api/app/__init__.py
services/api/app/main.py
services/api/app/config.py
services/api/app/errors.py
services/api/app/db.py
services/api/app/security/jwks.py
services/api/app/security/principal.py
services/api/app/security/policy.py
services/api/app/security/headers.py
services/api/app/domain/common_object.py
services/api/app/domain/audit.py
services/api/app/domain/planning.py
services/api/app/domain/currency.py
services/api/app/domain/notifications.py
services/api/app/repositories/audit.py
services/api/app/repositories/common_object.py
services/api/app/repositories/planning.py
services/api/app/services/audit_service.py
services/api/app/services/planning_service.py
services/api/app/services/currency_service.py
services/api/app/services/notification_service.py
services/api/app/api/health.py
services/api/app/api/observations.py
services/api/app/api/planning.py
services/api/app/api/currencies.py
services/api/app/api/audit.py
services/api/alembic.ini
services/api/migrations/env.py
services/api/migrations/versions/0001_foundation.py
services/api/scripts/seed_synthetic.py
services/api/tests/conftest.py
services/api/tests/unit/test_policy.py
services/api/tests/unit/test_currency.py
services/api/tests/unit/test_planning_workflow.py
services/api/tests/unit/test_audit_chain.py
services/api/tests/integration/test_health.py
services/api/tests/integration/test_observations.py
services/api/tests/integration/test_planning.py
packages/contracts/src/common-object.ts
packages/contracts/src/errors.ts
packages/contracts/src/planning.ts
packages/contracts/src/index.ts
src/lib/foundation/api-client.ts
src/lib/foundation/principal.ts
src/lib/foundation/error-response.ts
src/app/api/ready/route.ts
infra/docker/docker-compose.foundation.yml
infra/kubernetes/base/namespace.yaml
infra/kubernetes/base/configmap.yaml
infra/kubernetes/base/api-deployment.yaml
infra/kubernetes/base/api-service.yaml
infra/kubernetes/base/web-deployment.yaml
infra/kubernetes/base/web-service.yaml
infra/kubernetes/base/network-policies.yaml
infra/kubernetes/base/kustomization.yaml
infra/observability/otel-collector.yaml
docs/adr/ADR-001-frontend-framework.md
docs/adr/ADR-002-institution-iam.md
docs/adr/ADR-003-network-separation.md
docs/adr/ADR-004-cryptographic-suite.md
docs/adr/ADR-009-time-storage.md
docs/adr/ADR-011-immutable-root-lockfile.md
docs/requirements/requirements-traceability-matrix.md
docs/security/threat-model.md
docs/operations/foundation-runbook.md
```

Değiştirilecek:

```text
package.json                         # yalnız script ekleri
.env.example                        # aşağıdaki değişkenler
docker-compose.yml                  # foundation overlay referansı/açıklaması; mevcut servisler korunur
next.config.ts                      # ignoreBuildErrors kaldırılır; CSP sıkılaştırılır
src/proxy.ts                        # hardcoded Umami kaldırılır; auth/audit correlation
src/app/api/health/route.ts         # liveness sözleşmesi
src/app/api/flights/route.ts        # GNSS olasılık dili ve provenance
src/components/LayerPanel.tsx       # “GNSS Anomali Olasılığı” etiketi
src/components/OsirisMap.tsx        # aynı güvenli etiket ve SENTETİK görünürlüğü
README.md                            # gerçek mimari/durum ve .env.example adı
```

### Pinned paketler

Root npm lock kısıtı nedeniyle yeni root dependency eklenmez. Mevcut ve kilitli sürümler: Next `16.2.6`, React `19.2.4`, TypeScript `5.x` lock çözümü, Vitest `2.1.9`, Zod transitive lock `4.4.3`. Zod’un root production dependency yapılması ancak package-lock değişikliği için ayrı onayla yapılır; Faz 1 yeni Next route’u mevcut kilitli kopyayı kullanır ve Docker bundle testiyle doğrulanır.

Python servisinde tam pin:

```text
fastapi==0.115.12
uvicorn[standard]==0.34.2
pydantic==2.11.5
pydantic-settings==2.9.1
SQLAlchemy==2.0.41
alembic==1.16.1
asyncpg==0.30.0
PyJWT[crypto]==2.10.1
cryptography==45.0.2
httpx==0.28.1
prometheus-client==0.22.1
opentelemetry-api==1.33.1
opentelemetry-sdk==1.33.1
opentelemetry-exporter-otlp-proto-grpc==1.33.1
python-multipart==0.0.20
pytest==8.3.5
pytest-asyncio==0.26.0
```

### `.env.example` ekleri

```text
DEPLOYMENT_PROFILE=OSIRIS_CONNECTED
DATABASE_URL=postgresql+asyncpg://kam_app@postgres:5432/kam
DATABASE_PASSWORD_FILE=/run/secrets/postgres_password
OIDC_ISSUER=https://institution-iam.example.invalid/realms/kam
OIDC_JWKS_URL=https://institution-iam.example.invalid/realms/kam/protocol/openid-connect/certs
OIDC_AUDIENCE=kam-multi-int
OIDC_JWKS_CACHE_SECONDS=300
OIDC_MFA_REQUIRED=true
OIDC_MFA_AMR_VALUE=mfa
OIDC_MFA_ACR_VALUES=
OIDC_DEVICE_CLAIM=device_id
AUTH_REQUIRED=true
SESSION_IDLE_TIMEOUT_SECONDS=900
LOGIN_LOCKOUT_OWNER=INSTITUTION_IAM
OPENBAO_ADDR=https://openbao.service:8200
OPENBAO_ROLE=kam-api
AUDIT_HMAC_KEY_FILE=/run/secrets/audit_hmac_key
AUDIT_RETENTION_YEARS=5
SIEM_ENABLED=false
SIEM_CEF_ENDPOINT=
DEFAULT_TIMEZONE=Europe/Istanbul
CLASSIFICATION_DEFAULT=UNCLASSIFIED
OTEL_EXPORTER_OTLP_ENDPOINT=http://otel-collector:4317
PROMETHEUS_METRICS_ENABLED=true
PUBLIC_CONNECTORS_ENABLED=true
TENDER_REQUIREMENTS_CONFIG=/etc/kam/tender-requirements.json
CURRENCY_BASE=TRY
CURRENCY_ALLOWED=TRY,USD,EUR
CURRENCY_SCALE=4
DEMAT_YELLOW_DAYS=92
DEMAT_RED_DAYS=31
```

### Docker/Kubernetes

- Compose overlay: PostgreSQL 16 + PostGIS 3.5, API, OpenBao dev dışı bağlantı noktası, OTel Collector; secret’lar Docker secrets dosyalarıyla verilir.
- Kubernetes: default-deny ingress/egress, API yalnız web namespace/service account’tan; SPYS profile’da internet egress yok; non-root, read-only root filesystem, seccomp, dropped capabilities, probes, PDB ve HPA.
- TLS sonlandırma kurum ingress’inde TLS 1.3; service-mesh mevcutsa STRICT mTLS, yoksa ayrı ADR ile kurum PKI sidecar.

### Ölçülebilir kabul

1. Geçersiz/missing JWT tüm korunan endpointlerde aynı RFC 7807-benzeri yapı ile `401`; yetersiz policy `403`.
2. OIDC JWKS imza, issuer, audience, expiry ve clock-skew kontrolleri test edilir; yerel parola tablosu oluşmaz.
3. Her create/update/approve/delete/export işlemi user/IP/device/correlation/result ile hash-zincirli audit üretir; zincir bozma testi tespit edilir.
4. Common Object kaydı tüm zorunlu provenance alanları olmadan `422`; GeoJSON ve confidence range doğrulanır.
5. SPYS proje workflow’u zorunlu alan/bütçe/dönem kuralları geçmeden ilerlemez; hem service hem DB constraint bunu engeller.
6. Tüm para aritmetiği `Decimal`; `0.1 + 0.2 == 0.3` ve rounding policy testleri geçer.
7. DEMAT bildirimi bitişe 92 günde sarı, 31 günde kırmızı; bir gün öncesi/sonrası boundary testleri geçer.
8. `/health` process liveness; `/ready` DB/JWKS/audit dependency durumunu ayrı raporlar ve başarısız dependency’de `503` verir.
9. Seed çıktısındaki kayıtların %100’ü `SYNTHETIC`; source documents’tan kişi/telefon/operasyonel veri bulunmaz.
10. Root lock SHA-256 başlangıç değeriyle aynıdır; `npm run lint`, `npm run test`, `npm run build`, API unit/integration testleri geçer.

## Faz 2 - OSIRIS Core Data Domains

### Kapsam

F-002-F-010, F-013-F-014 ve F-015’in vector-tile/live-delta kısmı.

### Dosyalar

```text
services/ingestion/pyproject.toml
services/ingestion/app/main.py
services/ingestion/app/connectors/{base,manifest,runner,state,checkpoint,circuit_breaker,dedup}.py
services/ingestion/app/connectors/manifests/*.yaml       # ≥60
services/ingestion/app/connectors/{opensky,adsb_lol,aisstream,usgs,firms,eonet,gdacs,noaa,gdelt,telegram_public}.py
services/ingestion/tests/connectors/*.py
packages/contracts/schemas/connector-manifest.schema.json
packages/common-object-model/schemas/*.json
infra/kafka/topics.yaml
infra/docker/docker-compose.ingestion.yml
infra/kubernetes/base/ingestion-*.yaml
src/app/api/connectors/route.ts
src/app/api/connectors/[id]/route.ts
src/components/ConnectorHealthPanel.tsx
```

### Pinned paketler

`aiokafka==0.12.0`, `tenacity==9.1.2`, `httpx==0.28.1`, `PyYAML==6.0.2`, `jsonschema==4.23.0`, `geojson-pydantic==1.2.0`, `shapely==2.1.1`, `redis==6.2.0`.

### Ortam ve altyapı

`KAFKA_BOOTSTRAP_SERVERS`, `CONNECTOR_MANIFEST_DIR`, `RAW_OBJECT_STORE_ENDPOINT`, `RAW_OBJECT_STORE_BUCKET`, `CONNECTOR_MAX_RETRIES`, `CONNECTOR_CIRCUIT_FAILURE_THRESHOLD`, kaynak başına secret-file yolları. Kafka topics: `raw.observation.v1`, `normalized.observation.v1`, `connector.status.v1`, DLQ ve replay topics. MinIO/Ceph adapteri ve PostgreSQL checkpoint/dedup tabloları eklenir.

### Kabul

- 60 manifest schema-valid; eksik anahtarlıların tamamı `CONFIGURATION_REQUIRED`, hiçbiri `ACTIVE` değil.
- En az 10 hukuken uygun connector contract/integration testli çalışır.
- Aynı kaynak+content hash yeniden işlendiğinde tek kayıt; event replay idempotent.
- Circuit breaker ve back-pressure yük testinde kanıtlanır.
- SPYS profile’da connector egress denemeleri NetworkPolicy ve application policy ile reddedilir.

## Faz 3 - SPYS Planning Modules

### Kapsam

F-034-F-060’ın tamamı. UI geliştirmesi yalnız ADR-001 `APPROVED` olunca başlar.

### Dosyalar

```text
services/api/app/domain/spys/*.py
services/api/app/services/spys/*.py
services/api/app/api/spys/*.py
services/api/migrations/versions/0002_spys_modules.py
services/reporting/app/templates/spys/*.json
packages/contracts/src/spys/*.ts
apps/spys-angular/*                                  # ADR-001 Option A
apps/web/src/app/spys/*                              # ADR-001 Option B; yalnız seçilen yol
apps/web/src/components/spys/forms/*
apps/web/src/components/spys/workflows/*
services/api/tests/spys/*.py
tests/e2e/spys/*.spec.ts
```

### Pinned paketler

Backend Faz 1 pinleri; reporting için `reportlab==4.4.1`, `openpyxl==3.1.5`, `weasyprint==65.1`, `celery==5.5.3`. Option A seçilirse Kurumun onayladığı Angular sürümü ayrı lockfile ile; Option B seçilirse mevcut Next/React stack ve root lock değişikliği gerektirmeyen bileşenler.

### Ortam ve altyapı

`SPYS_ENABLED`, `SPYS_UI_IMPLEMENTATION`, `INSTITUTION_REPORTING_BASE_URL`, `DOCUMENT_STORE_BUCKET`, `REPORT_WORKER_CONCURRENCY`, `REPORT_WATERMARK_CLASSIFICATION`, `TENDER_REQUIREMENTS_CONFIG`. Reporting worker, read replica/OLAP connection, immutable document bucket ve notification queue eklenir.

### Kabul

- HİP→SHP→OYTEP veri devri ve 20/10 yıllık dönem sınırları uçtan uca doğrulanır.
- Altı planlama alt modülünde duplicate/reference/mandatory rules server-side geçer.
- 82 tender-deferred maddenin template’i onaylanmadıysa işlem `REQUIRES_CLARIFICATION` olarak görünür; sistem format uydurmaz.
- DEMAT boundary, dönem kopyalama, document version/diff, four-eyes approval ve RBAC e2e testleri geçer.
- Rapor watermark’ı her sayfada kullanıcı/cihaz/zaman/sınıflandırma/sayfa-toplam/sürüm taşır.

## Faz 4 - OSIRIS AI & Analytics

### Kapsam

F-022-F-024 ve F-017 analitik tetikleme.

### Dosyalar

```text
services/ai/app/{gateway,lineage,guardrails,models}.py
services/media-processing/app/{stt,ocr,vision,keyframes}.py
services/analytics/app/{nlp,translation,campaigns,anomaly}.py
services/fusion/app/{correlation,entity_resolution,evidence}.py
packages/contracts/schemas/model-output.schema.json
tests/model-quality/*
docs/ai/model-cards/*
```

### Pinned paketler

`transformers==4.52.4`, `sentence-transformers==4.1.0`, `faster-whisper==1.1.1`, `torch==2.7.1` (CPU/GPU profile ayrı), `pytesseract==0.3.13`, `opencv-python-headless==4.11.0.86`, `networkx==3.5`, `rapidfuzz==3.13.0`.

### Ortam ve altyapı

`MODEL_GATEWAY_URL`, `MODEL_ALLOWLIST`, `MODEL_CACHE_DIR`, `FACE_MATCHING_ENABLED=false`, `FACE_MATCHING_AUTHORIZATION_REF`, `FACE_MATCHING_THRESHOLD`, `AI_MIN_CONFIDENCE`, `AI_OUTPUT_RETENTION`. GPU node pool yalnız media/AI namespace’inde; internet model download production’da kapalı, imzalı offline model bundle zorunlu.

### Kabul

- 17 dil acceptance corpus; STT word timestamps ve model-quality raporu.
- Her AI çıktısında source/timestamp/model-version/confidence; kaynak yoksa intelligence finding kaydı reddedilir.
- Face matching default kapalı; authorization ve human confirmation olmadan sonuç yayımlanmaz.
- Kampanya çıktısı yalnız açıklanabilir risk skoru; kesin bot/troll verdict sözlük testiyle engellenir.

## Faz 5 - OSIRIS Advanced Capabilities

### Kapsam

F-011-F-012, F-016-F-021, F-005-F-006 ileri analitik, F-017 tam SLA.

### Dosyalar

```text
services/alerting/app/*
services/archive/app/*
services/reporting/app/osiris/*
services/analytics/app/{gnss,cti,financial,space}.py
services/api/app/api/{watchlists,cases,graph,search,media}.py
apps/web/src/app/{watchlists,cases,graph,media-vault,search}/*
infra/opensearch/*
infra/object-storage/*
infra/graph/*
tests/e2e/advanced/*
```

### Pinned paketler

`opensearch-py==2.8.0`, `boto3==1.38.23`, `stix2==3.0.1`, `taxii2-client==2.3.0`, `sgp4==2.25`, `skyfield==1.53`, `python-magic==0.4.27`, `clamd==1.0.2`.

### Ortam ve altyapı

OpenSearch, object storage, graph store, archive worker, ClamAV, alert dispatcher; `ALERT_SLA_SECONDS=180`, `WATCHLIST_BACKFILL_MAX_DAYS`, `GNSS_OUTPUT_LABEL=PROBABLE_ACCURACY_DEGRADATION`, `CTI_ACTIVE_CHECKS_ENABLED=false`, `CTI_ACTIVE_ALLOWLIST`.

### Kabul

- Critical alert source-ingest to durable alert p95 ≤180 s under agreed load; AI cannot close it.
- Evidence hash/custody survives case export/import.
- GNSS output vocabulary never says confirmed jamming and requires multi-aircraft/baseline evidence.
- Media ingest rejects extension spoofing by magic bytes; malware file quarantined; proxy/thumbnail/storyboard generated.
- Search p95 <300 ms for the agreed frequent-query dataset.

## Faz 6 - Production Hardening

### Kapsam

F-025-F-032 completion, F-056-F-057, all integrations, HA/DR and full acceptance.

### Dosyalar

```text
.gitlab-ci.yml
Jenkinsfile
ci/scripts/{lint,unit,typecheck,secret,sast,sca,license,sbom,image,iac,integration,contract,dast,performance,sign,smoke,rollback}.sh
infra/helm/kam-multi-int/*
infra/kubernetes/overlays/{dev,test,training,prod,spys-airgap}/*
infra/observability/{prometheus,grafana,loki,alertmanager}/*
infra/backup/*
docs/security/{hardening,penetration-test-evidence,sbom,licenses}.md
docs/operations/{backup-restore,dr,ha,offline-update,rollback}.md
docs/acceptance/*
tests/{load,stress,failover,restore,dr,accessibility}/*
```

### Pinned araçlar

Container image digest ile: Trivy, Syft, Grype, Cosign, Semgrep, Gitleaks, Checkov, OWASP ZAP, k6. Sürüm ve digestler CI image manifestinde tek kaynak olarak tutulur; floating `latest` yasaktır.

### Ortam ve altyapı

Dört ayrık environment; ayrı DB/key/bucket; signed artifact registry; blue-green/canary; Postgres HA, Kafka quorum, object replication, OpenSearch cluster; SIEM CEF; offline update bundle ve verification station.

### Kabul

- 20 CI aşaması kanıtlı; critical vulnerability veya test failure production promotion’ı engeller.
- SBOM ve imzalı image/bundle doğrulanır; bozuk release otomatik rollback.
- ≥99.9% hedefi için fault injection; ölçülmüş servis RPO/RTO; restore checksum doğrulaması.
- TÜBİTAK BİLGEM/A yetkin firma raporundaki bulgular kapanmadan acceptance başlamaz.
- RTM’deki 60 alan/935 alt gereksinimin her biri test sonucu veya onaylı `REQUIRES_CLARIFICATION` kanıtına bağlıdır.

## Uygulama sırası kapısı

1. Faz 1 backend/schema/security uygulanabilir.
2. SPYS UI, ADR-001 Kurum kararı olmadan **başlatılamaz**.
3. Root dependency veya `package-lock.json` değişikliği ayrı açık onay gerektirir.
4. Her faz sonunda sistem çalışır, test raporu ve RTM güncel halde kalır.
