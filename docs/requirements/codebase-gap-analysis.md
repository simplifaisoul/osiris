# KAM Multi-INT + SPYS Kod Tabanı Boşluk Analizi

Tarih: 2026-07-18  
Denetlenen depo: `/Users/badtux/osiris`  
Denetim modu: salt okunur; Step 1 envanterinden sonra  

## Yönetici özeti

Mevcut depo, çok sayıda açık internet kaynağını MapLibre tabanlı tek bir Next.js panelinde gösteren işlevsel bir OSINT uygulamasıdır. Ancak bağlayıcı şartnamelerin tarif ettiği kurumsal Multi-INT platformu değildir: kalıcı veri katmanı, kurum IAM entegrasyonu, RBAC/ABAC, değişmez audit, servis sınırları, Kafka, ortak obje modelinin tam sözleşmesi, SPYS veri modeli ve SPYS modülleri yoktur.

| Status | Count | Meaning |
|---|---:|---|
| ✅ Implemented | 1 | Alanın ana kabul ölçütleri mevcut |
| 🟡 Partial | 25 | Çalışan bir parça var; şartname kapsamı tamamlanmamış |
| ❌ Missing | 34 | Kabul edilebilir uygulama kanıtı bulunamadı |

## Başlangıç bütünlük kaydı

- Branch: `master`, upstream `origin/master`.
- Denetim başlangıcında kullanıcıya ait değişiklik: `package-lock.json` (16 adet `peer` metadata satırı eksik).
- Başlangıç `package-lock.json` SHA-256: `bb89d1a0017487daa132fa5598e8d9030ad22a0723349614b1262c5ec7cb9f9f`.
- Kullanıcıya ait untracked alan: `logs/`.
- Bu iki alan değiştirilmeyecek.
- Mevcut uygulama yaklaşık 32 KLOC; 67 Next.js route/source dosyası ve yalnız bir test dosyası içeriyor.

## Özellik eşlemesi

| Feature ID | Status | Evidence | Notes |
|---|---|---|---|
| F-001 | 🟡 Partial | `src/lib/sdk/types.ts`, `src/app/api/sdk/ingest/route.ts` | Küçük `PolybolosEntity` modeli var; şartnamedeki nesne/alan/provenance/version/hash/retention sözleşmesi ve kalıcı depo yok. |
| F-002 | 🟡 Partial | `src/lib/sdk/PolybolosClient.ts`, `src/lib/sdk/LatticeAdapter.ts`, `src/app/api/sdk/ingest/route.ts` | Genel connector manifest/health/retry/circuit-breaker/checkpoint/dedup/state sözleşmesi ve ≥60 manifest yok. |
| F-003 | 🟡 Partial | `src/app/api/flights/route.ts`, `src/components/OsirisMap.tsx` | Çoklu ADS-B kaynağı ve katmanlar çalışıyor; NOTAM, hava sahası, rota/anomali geçmişi, provenance ve testler eksik. |
| F-004 | 🟡 Partial | `src/app/api/maritime/route.ts`, `src/components/OsirisMap.tsx` | AIS, liman ve boğaz gösterimi var; identity-change/AIS-off analizi, persistence ve lisans kaydı yok. |
| F-005 | 🟡 Partial | `src/app/api/satellites/route.ts`, `src/app/api/space-weather/route.ts`, `src/app/api/sentinel/route.ts` | TLE/uydu/space weather/SAR katalog sorgusu var; geçiş, yer istasyonu ve SAR değişim analizi tamam değil. |
| F-006 | 🟡 Partial | `src/app/api/flights/route.ts:239`, `src/app/api/flights/route.ts:361`, `src/components/LayerPanel.tsx:88` | NAC-P grid türetimi var; çıktı `gps_jamming`/“GPS Jamming” diye kesin etiketleniyor, baz çizgisi ve yanlış-pozitif modeli yok; etik guardrail ihlali. |
| F-007 | 🟡 Partial | `src/app/api/cctv/route.ts`, ülke adapterleri, `src/components/CameraViewer.tsx` | Geniş açık kamera kataloğu ve viewer var; lisans/kullanım temeli, timeline/archive, health modeli ve yetki kaydı eksik. |
| F-008 | 🟡 Partial | `src/app/api/earthquakes/route.ts`, `fires/route.ts`, `weather/route.ts`, `air-quality/route.ts`, `infrastructure/route.ts` | Birçok afet/çevre kaynağı var; ortak model, olay füzyonu ve kritik altyapı etki kabul testleri yok. |
| F-009 | 🟡 Partial | `src/app/api/news/route.ts`, `src/app/api/gdelt/route.ts`, `src/app/api/live-news/route.ts` | RSS/GDELT/TV/Telegram parçaları var; arşiv, lisans kaydı, dedup ve kurumsal kaynak yönetimi yok. |
| F-010 | 🟡 Partial | `src/app/api/news/route.ts:106` | Açık `t.me/s` içerik alımı var; kanal yönetimi, çok dilli geoparsing/provenance ve kampanya analizi eksik. |
| F-011 | 🟡 Partial | `src/app/api/cyber-threats/route.ts`, `malware/route.ts`, `osint/cve/route.ts`, `osint/threats/route.ts` | Pasif CVE/IOC sorguları var; STIX/TAXII, SIEM sözleşmesi, asset allowlist policy ve kalıcı CTI modeli yok. |
| F-012 | 🟡 Partial | `src/app/api/crypto/route.ts`, `src/app/api/osint/sanctions/route.ts`, `src/lib/sanctions.ts` | BTC/ETH ve yaptırım araması var; entity-resolution kanıtı ve kesin kimlik iddiasını önleyen kayıt modeli/test yok. |
| F-013 | 🟡 Partial | `src/app/api/conflicts/route.ts`, `frontlines/route.ts` | Canlı ve statik çatışma katmanı var; analist doğrulama workflow’u ve kaynak sürümlemesi yok. |
| F-014 | 🟡 Partial | `src/app/api/infrastructure/route.ts`, `public/data/submarine-cables*.json` | Bazı altyapı katmanları var; hassas veri profili, kurumsal yetki ve kapsam tamam değil. |
| F-015 | 🟡 Partial | `src/components/OsirisMap.tsx`, `src/components/LayerPanel.tsx`, `src/app/page.tsx` | Güçlü MapLibre/WebGL, globe, layer, cluster ve canlı panel temeli var; vector-tile backend, replay, geofence/case/report akışları yok. |
| F-016 | ❌ Missing | not found | Watchlist ve server-side aktif takip yaşam döngüsü yok. |
| F-017 | 🟡 Partial | `src/components/LiveAlerts.tsx`, `src/components/AiOverview.tsx` | UI’da türetilmiş alarm özeti var; kalıcı alert service, ≤3 dakika SLA ölçümü, ack/assignment/channel delivery yok. |
| F-018 | 🟡 Partial | `src/components/EntityGraphPanel.tsx`, `src/app/api/entity/expand/route.ts` | Görsel graph paneli var; graph DB, kanıtlı edge, merkeziyet/path/community ve entity resolution pipeline yok. |
| F-019 | ❌ Missing | not found | Vaka, görev, dört-göz, evidence custody ve immutable history yok. |
| F-020 | 🟡 Partial | `src/components/SearchBar.tsx`, `src/components/OsintPanel.tsx` | Geocode ve ayrı OSINT sorguları var; birleşik full-text/Boolean/semantic/visual/geospatial search index yok. |
| F-021 | ❌ Missing | not found | Media Vault ingest/transcode/proxy/storyboard/archive/HSM/LTO yaşam döngüsü yok. |
| F-022 | 🟡 Partial | `src/app/api/ai/analyze/route.ts`, `ai/briefing/route.ts`, `ai/overview/route.ts`, `src/lib/ai-engine.ts` | Metin analizi/Gemini destekli özet var; STT, 17 dil, OCR/vision pipeline, offline model gateway, lineage ve model kalite kayıtları yok. |
| F-023 | ❌ Missing | not found | Açıklanabilir koordineli kampanya/bot risk pipeline’ı yok. |
| F-024 | 🟡 Partial | `src/lib/ai-engine.ts`, `src/app/api/entity/expand/route.ts` | Heuristik ilişkilendirme parçaları var; event-driven fusion, conflict evidence, model lineage ve kalıcı correlation yok. |
| F-025 | ❌ Missing | not found | Şartname rapor tipleri ve PDF/DOCX/XLSX/GeoJSON/STIX export engine yok. |
| F-026 | 🟡 Partial | `src/app/api/sdk/ingest/route.ts`, `src/app/api/sdk/stream/route.ts`, `src/lib/sdk/LatticeAdapter.ts` | Push ingest/SSE var; SPYS/MYS/KAM-BAKS, Kafka/SFTP/e-imza/AD-LDAP/SIEM adapter sözleşmeleri yok. |
| F-027 | ❌ Missing | not found | OIDC/OAuth/JWT doğrulama, kurum IAM adapteri, MFA claims ve RBAC/ABAC enforcement yok. |
| F-028 | 🟡 Partial | `next.config.ts`, `.env.example`, `Dockerfile` | Bazı HTTP başlıkları ve env kullanımı var; TLS termination/mTLS, OpenBao/KMS, field encryption/rotation yok. CSP `unsafe-inline`, `unsafe-eval` ve wildcard remote image kabul ediyor. |
| F-029 | ❌ Missing | `src/middleware.ts` yalnız Umami telemetry | Audit değil; kimlik/işlem/sonuç/veri/immutable hash/SIEM/5 yıl retention yok. Middleware IP’yi hardcoded internal Umami adresine yolluyor. |
| F-030 | ❌ Missing | not found | CI workflow, 20-stage pipeline, SBOM/signing/offline update/rollback gate yok. |
| F-031 | 🟡 Partial | `Dockerfile`, `docker-compose.yml` | Non-root image ve restart policy var; HA replicas, Kubernetes/Helm, DB/broker/object HA, backup/DR/RPO/RTO yok. |
| F-032 | 🟡 Partial | `src/app/api/health/route.ts`, `intel/server.js:708` | Basit health endpointleri var; readiness dependency checks, OpenTelemetry/Prometheus/Grafana/Loki/Alertmanager yok. |
| F-033 | ✅ Implemented | `src/app/globals.css`, `src/components/OsirisMap.tsx`, `src/app/page.tsx` | Koyu komuta merkezi dili, MapLibre, geniş ekran panelleri ve responsive temel mevcut; erişilebilirlik testleri yine eklenmeli. |
| F-034 | ❌ Missing | not found | SPYS HİP veri modeli/API/workflow/UI yok. ADR-001 gereği UI zaten karar bekliyor. |
| F-035 | ❌ Missing | not found | SPYS SHP yok. |
| F-036 | ❌ Missing | not found | SPYS OYTEP yok. |
| F-037 | ❌ Missing | not found | SPYS ARGE alt modülü yok. |
| F-038 | ❌ Missing | not found | SPYS Modernizasyon alt modülü yok. |
| F-039 | ❌ Missing | not found | SPYS Harekâtı İdame alt modülü yok. |
| F-040 | ❌ Missing | not found | SPYS Altyapı alt modülü yok. |
| F-041 | ❌ Missing | not found | SPYS İnsan Gücü alt modülü yok. |
| F-042 | ❌ Missing | not found | SPYS Kuvvet Yapısı alt modülü yok. |
| F-043 | ❌ Missing | not found | SPYS Acil Harekât İhtiyaçları yok. |
| F-044 | ❌ Missing | not found | SPYS HARDES yok. |
| F-045 | ❌ Missing | not found | SPYS ARMERKOM yok. |
| F-046 | ❌ Missing | not found | SPYS Bütçeleme yok. |
| F-047 | ❌ Missing | not found | SPYS Ömür Devir yok. |
| F-048 | ❌ Missing | not found | SPYS Proje Koordinasyon/Yönetim/Takip ve DEMAT uyarıları yok. |
| F-049 | ❌ Missing | not found | SPYS Dönemsel Listeleme yok. |
| F-050 | ❌ Missing | not found | Decimal-safe TL/USD/EUR modeli ve kur politikası yok. |
| F-051 | ❌ Missing | not found | SPYS workflow gate ve server-side Poka-Yoke framework’ü yok. |
| F-052 | 🟡 Partial | `src/components/LiveAlerts.tsx` | Görsel in-app alert var; e-posta/service trigger/mute/preference/delivery log altyapısı yok. |
| F-053 | ❌ Missing | not found | SPYS reporting engine, filigran, background job ve report archive yok. |
| F-054 | ❌ Missing | not found | Dönem ve immutable archive veri modeli yok. |
| F-055 | ❌ Missing | not found | 5 yıllık immutable application/audit log ve SIEM forwarding yok. |
| F-056 | ❌ Missing | not found | TÜBİTAK BİLGEM/A test kanıt paketi ve acceptance gate yok. |
| F-057 | ❌ Missing | not found | Jenkins/GitLab CI tanımı ve release gates yok. |
| F-058 | ❌ Missing | not found | Kurum IAM claim mapping, role/group screen variants, timeout/lockout policy yok. |
| F-059 | ❌ Missing | Ad-hoc route checks only | Paylaşılan schema/data-dictionary/range/reference/regex server validation sistemi yok; Zod bağımlılığı bulunmuyor. |
| F-060 | ❌ Missing | not found | Versioned SPYS document repository, magic-byte upload validation ve template registry yok. |

## Bloke edici teknik açıklar

1. **Güvenlik kapısı yok:** Uygulama ve API route’ları anonim; authorization middleware yok.
2. **Kalıcı sistem-of-record yok:** PostgreSQL/PostGIS migration veya ORM bulunmuyor; SDK ingest global process belleğinde ve yeniden başlatmada kayboluyor.
3. **API sözleşmesi yok:** `zod` yok; route’lar farklı ad-hoc kontroller ve farklı hata gövdeleri kullanıyor.
4. **Type safety kapısı devre dışı:** `next.config.ts` içinde `typescript.ignoreBuildErrors: true`; çok sayıda `any` var.
5. **Air-gap uyumsuzluğu:** Uygulama doğrudan onlarca genel ağ servisine çıkar; Nginx ayrıca 1.1.1.1 ve 8.8.8.8 kullanır; middleware internal Umami hedefini zorunlu varsayar.
6. **Yanlış güven dili:** GNSS türetimi “GPS Jamming” diye kesin sunulur; şartname yalnız olasılık/anomali diline izin verir.
7. **Sentetik/fallback etiketleme:** Eski ISS TLE fallback’i ve statik conflict fallback’leri `SYNTHETIC` ortak model etiketi taşımıyor.
8. **Test açığı:** Sadece Utah CCTV parser testi var; API/security/auth/audit/data model testi yok.
9. **Dağıtım açığı:** Yalnız tek sunucu Docker Compose var; Kubernetes, Helm, secrets, DB, Kafka ve observability stack yok.
10. **Dokümantasyon-uygulama sapması:** README `.env.template` derken depoda `.env.example` var; production-grade iddiası mevcut kalite kapılarıyla kanıtlanmıyor.

## Step 2 çıkış kapısı

- [x] 60 özellik alanı kanıt yoluyla eşlendi.
- [x] Mevcut kullanıcı değişiklikleri ayrıştırıldı.
- [x] Uygulama, veri, güvenlik, test ve dağıtım boşlukları kaydedildi.
- [x] SPYS UI için ADR-001 karar bekleme kuralı korundu.

