# KAM Multi-INT + SPYS Birleşik Özellik Envanteri

Belge sürümü: 1.0  
Tarih: 2026-07-18  
Durum: Step 1 tamamlandı - kodlamaya geçiş kapısı  

## Kapsam ve yorumlama kuralları

Bu envanter aşağıdaki iki bağlayıcı kaynağın tamamı okunarak hazırlanmıştır:

- **Doküman A - OSIRIS:** `KAM MULTI-INT MASTER KODLAMA PROMPTU`, Bölüm 1-26.
- **Doküman B - SPYS:** `MU. VE BİL.SİS.D.TEK.Ş.2026-01`, 22 sayfa, 2026, yürürlük sonu 31 Aralık 2030.

Her `F-*` satırı bir kabul edilebilir özellik alanıdır; hücredeki noktalı virgülle ayrılmış her unsur aynı satırın atomik alt gereksinimidir. `P0` güvenlik, temel veri bütünlüğü veya sözleşmesel kabul kapısını; `P1` ana operasyonel kabiliyeti; `P2` ileri/iyileştirici kabiliyeti ifade eder. Karmaşıklık `L/M/H/XL` ölçeğindedir.

## Birleşik özellik tablosu

| ID | Source Doc | Section | Domain | Feature / Function | Priority | Complexity | Conflict? |
|---|---|---|---|---|---|---|---|
| F-001 | A | §4 | Common Object Model & Data Schema | Source, Collector, Observation, Entity ve tanımlı tüm istihbarat nesneleri; zorunlu kaynak/zaman/coğrafya/sınıflandırma/güven/lisans/saklama/model/korelasyon/chain-of-custody alanları; GeoJSON; STIX 2.1; ham veriye ve sürümlere geri dönüş; hash doğrulama | P0 | XL | No |
| F-002 | A | §5, §23 | Data Connector SDK (≥60 connectors) | Manifest, lisans/kullanım temeli, auth, rate limit, frekans, health, last-success, hata metriği, retry, circuit breaker, pagination, checkpoint, dedup, raw retention, COM mapping, geocoding, güven ve kalite metriği; sekiz gerçek durum; en az 60 adapter/manifest; eksik anahtarda CONFIGURATION_REQUIRED; demo verisinde SYNTHETIC etiketi | P0 | XL | No |
| F-003 | A | §6.1 | Aviation Domain | Hukuken kullanılabilir ADS-B; ticari/özel/iş jeti/helikopter/açık askerî trafik; iz, hız, irtifa, baş, callsign, kalkış/varış; holding, ani rota, transponder kaybı ve yoğunluk analizi; yetkili NOTAM/hava sahası adapterleri | P1 | H | No |
| F-004 | A | §6.2 | Maritime Domain | AIS; gemi sınıfları ve açık askerî trafik; liman/boğaz/kritik geçiş; bekleme ve anormal rota; AIS kapanması/kimlik değişimi; hukuken uygun açık veya kurumsal kaynak adapterleri | P1 | H | No |
| F-005 | A | §6.3 | Space & Satellite Domain | Aktif uydu/TLE; SGP4; görev sınıfı; geçiş tahmini; yer istasyonu; uzay hava durumu; güneş/jeomanyetik olay; görüntü kataloğu; SAR değişim analizi adapteri | P2 | H | No |
| F-006 | A | §6.4, §21 | GNSS/GPS Anomaly Detection | NAC-P/kalite alanları; grid toplulaştırma; baz çizgisi; olasılık/şiddet/zaman serisi; çoklu uçak doğrulama; yanlış pozitif azaltma; ısı katmanı; türetilmiş sonuç açıklaması; yalnızca “muhtemel GNSS doğruluk bozulması/anomalisi” dili | P1 | H | No |
| F-007 | A | §6.5, §21 | CCTV & Licensed Image Streams | Yalnızca kamu/lisans/kurum yetkili kameralar; trafik/liman/havaalanı/hava durumu akışları; konum, son başarılı görüntü, health, snapshot, timeline; yetkili nesne/olay analizi; özel kamera keşfi veya erişim aşımı yok | P1 | H | No |
| F-008 | A | §6.6 | Earthquake, Disaster & Environmental | M2.5+ deprem; volkan; yangın/hotspot; sel/aşırı hava; hava kalitesi; fırtına/kasırga; afet sınırı; kritik altyapıya mesafe; açık kaynak adapterleri | P1 | H | No |
| F-009 | A | §6.7 | News, Media & RSS/GDELT Ingestion | Web haber/RSS/Atom; ulusal/uluslararası yayın; TV/radyo ve kurumsal sayısallaştırma; forum/blog/podcast/bülten; resmî sosyal API/yetkili sağlayıcı; lisanslı ajans; GDELT; kurum kaynak listesi; erişim kontrolü aşmama | P1 | XL | No |
| F-010 | A | §6.8 | Telegram OSINT | Yalnızca açık kanallar ve t.me önizleme/yetkili API; kanal listesi; dil/zaman; geoparsing; kaynak dönüşü; tekrar/koordinasyon analizi; özel grup/mesaj veya erişim aşımı yok | P1 | M | No |
| F-011 | A | §6.9 | Cyber Threat Intelligence | CVE/CISA KEV/NVD; malware-C2 açık akış; IOC; IP/domain/ASN/BGP/DNS/CT/RDAP; Tor/reputation; STIX/TAXII; SIEM/SOC; pasif varsayılan; aktif kontrol yalnızca açık allowlist; exploit/kimlik bilgisi/kalıcılık yok | P1 | XL | No |
| F-012 | A | §6.10, §21 | Financial Intelligence & Sanctions | BTC/ETH açık zincir; işlem/adres ilişkileri; yaptırım listeleri; kişi/kurum/gemi/uçak; ad/alias çözümleme; blokzincirden kesin gerçek kimlik iddiası yok | P2 | H | No |
| F-013 | A | §6.11 | Conflict & Geopolitical Events | Çatışma/sınır/hava alarmı/protesto/güvenlik/kritik altyapı/göç/insani kriz; kaynak ve güncelleme tarihli statik katman; GDELT/lisanslı olay; analist doğrulamalı katman | P1 | H | No |
| F-014 | A | §6.12 | Critical Infrastructure Layer | Enerji, veri merkezi, liman, havaalanı, demiryolu, koridor, haberleşme, internet kesintisi, kritik üretim, tedarik düğümü; hassas verinin yalnız yetkili ağda işlenmesi | P1 | H | No |
| F-015 | A | §9 | Map & Common Operational Picture (COP) UI | Tek ana etkileşimli harita; 2D/3D; WebGL; katman/grup/cluster; viewport ve progressive load; timeline/replay/live; çizim/geofence/yakınlık/ısı/rota; altlık/uydu/gece/ölçüm; rapor snapshot; alan özeti; olay kümesi; bölge dosyası; graph/entity/evidence/alert/ops/health panelleri; vector tile ve fark güncellemesi | P0 | XL | No |
| F-016 | A | §10 | Active Tracking & Watchlists | Konu, sözcük, kavram, kişi, kurum, hesap, hava/deniz/uydu varlığı, konum/bölge, domain/IP/wallet, hashtag, anlatı, görsel/logo/olay türü; eşikle otomatik aktif takip; artan toplama; geriye tarama; ayrıntılı analiz; otomatik/kalıcı sonlandırma seçenekleri | P1 | XL | No |
| F-017 | A | §10, §22 | Early Warning & Alerting (≤3 min SLA) | Platforma gelişten sonra ≤3 dakikada alarm hedefi; tür/önem/zaman/ilk-son/kaynak/bölge/varlık/güven/kanıt/öneri/sorumlu/onay; in-app/e-posta/push/SIEM/webhook/kurum mesajlaşma; kritik alarmı AI kapatamaz; SLA testi | P0 | XL | No |
| F-018 | A | §8, §11 | Entity Graph & Relationship Analysis | Node-link; zaman/kaynak filtre; ağırlık/topluluk/en kısa yol/merkeziyet; gizli düğüm yalnız analitik hipotez; harita çift yönlü seçim; kanıt görünümü; çok kimlikli entity resolution ve transliterasyon | P1 | XL | No |
| F-019 | A | §11 | Case Management & Workflow | Vaka; ekip/görev/not/delil; sürüm; onay/dört göz; durum/kapanış/timeline/export; değişmez audit; her kanıtta hash ve chain of custody | P1 | H | No |
| F-020 | A | §12 | Search (Full-text, Boolean, Semantic, Visual) | Full-text; Boolean; alan/coğrafya/zaman; semantik; görsel/video karesi; varlık/ilişki/kaynak; kayıtlı sorgu/watchlist; sık sorguda <300 ms hedefi ve gerçek yük testi | P1 | XL | No |
| F-021 | A | §13 | Media Archive - KAM Media Vault | Watch folder/API/manual/bulk; integrity ve malware scan; metadata; proxy/thumbnail/storyboard/transcode; OCR/STT/subtitle/version/preview; full-text/semantic/visual search; aging/HSM/LTO/recall/hash; download/share/watermark/audit; tanımlı medya/doküman formatları ve açıklayıcı format hatası | P1 | XL | No |
| F-022 | A | §7 | Multimodal AI (STT, Translation, NLP, OCR, Vision) | Canlı/batch STT, word timestamp, diarization, enhancement ve çoklu çıktı; 17 dil çeviri, yan yana/eşlemeli/zamanlı/düzenlenebilir; konu/NER/duygu/kavram/özet/trend/anomali/iddia/olay/anlatı/manipülasyon/çelişki/benzerlik/embedding; offline model gateway; OCR/logo/object/scene/similarity/keyframe/storyboard/geocue; tüm çıktıda kaynak-zaman-model-güven; yüz eşleme varsayılan kapalı ve insan onaylı | P1 | XL | No |
| F-023 | A | §7.4, §21 | Bot & Coordinated Campaign Analysis | Zaman/metin/URL/hashtag/hesap kümeleri/duygu/kopya/grafik/etkileşim/hacim göstergeleri; açıklanabilir olasılık ve risk skoru; kesin bot/troll hükmü yok | P2 | H | No |
| F-024 | A | §8 | Data Fusion & Correlation Engine | Haber-sosyal-konum; uçak-GNSS; gemi-liman; uydu-görüntü; afet-tesis; IP-domain-IOC; şirket/kripto-yaptırım; kişi/kurum/platform ilişkileri; anlatı-fiziksel olay; hacim değişimi; çoklu kaynak teyidi; kaynak/pencere/algoritma/güven/çelişki/eksik veri/analist notu | P0 | XL | No |
| F-025 | A, B | A §14; B §3.2.20 | Reporting & Export | 16 OSIRIS rapor tipi; PDF/DOCX/XLSX/CSV/JSON/GeoJSON/STIX; zaman/kullanıcı/kaynak/model/güven/sınıflandırma/kısıt/sürüm; yetki ve audit; SPYS filtre/sıra/görsel/conditional formatting/background/preview/archive/real-time; kullanıcı-cihaz-zaman-sınıflandırma-sayfa-sürüm filigranı | P0 | XL | Yes - ADR-007 |
| F-026 | A, B | A §15; B §3.1.8-9, §3.2.19 | System Integrations | REST/WebSocket/Kafka/SFTP/file/CSV/XLSX/JSON/XML/GeoJSON/STIX/TAXII/e-imza/AD-LDAP/SIEM/bildirim; SPYS/MYS/KAM-BAKS planlama etkisi-kaynak-görev-risk-karar aktarımı; dedup/integrity/version/idempotency/retry/DLQ/log; kurum ortak servis adapterleri | P0 | XL | Yes - ADR-003 |
| F-027 | A, B | A §16; B §3.1.8, §3.2.4, §3.2.12-16 | Identity, Auth & Authorization | Kurum IAM üzerinden OIDC/OAuth2/JWT/MFA/AD-LDAP; yerel kimlik otoritesi yok; configurable timeout; failed-login lockout kurum IAM politikasına delege; RBAC/ABAC, classification/field/record/tenant masking, critical/two-person/export controls; IP/device/service identity | P0 | XL | Yes - ADR-002 |
| F-028 | A, B | A §16; B §3.1.10.8, §3.2.12-14 | Encryption & Secret Management | TLS 1.3; mümkün yerde mTLS; AES-256-GCM/onaylı algoritma; DB/object encryption; rotation; HSM/KMS/OpenBao adapteri; secret kod/config dışında ve runtime injection; hassas alan encryption/masking | P0 | H | Yes - ADR-004 |
| F-029 | A, B | A §16; B §3.2.4.1, §3.2.6.14-15, §3.2.19 | Audit Trail & Chain of Custody | Kullanıcı/IP/cihaz/zaman/veri/fonksiyon/sonuç; UTC saklama ve GMT+3 gösterim; SIEM; değişmez/hash-zincirli kayıt; en az 5 yıl; günlük-haftalık-aylık-yıllık rapor; evidence hash/provenance | P0 | XL | No |
| F-030 | A, B | A §17; B §3.2.8.4, §3.2.15, §3.2.17-18 | DevSecOps Pipeline (20-stage) | 20 aşamalı lint-test-type-secret-SAST-SCA-license-SBOM-image-IaC-integration-contract-DAST-performance-sign-staging-smoke-approval-prod-rollback; Jenkins/GitLab uyumu; paralel iş akışları; pinning; offline signed update; reversible migration; blue-green/canary; release test raporu | P0 | XL | Yes - ADR-005 |
| F-031 | A, B | A §18; B §3.2.19.2 | High Availability & Disaster Recovery | ≥99.9%; SPOF yok; horizontal/vertical scale; probes/restart/replica; DB/object/broker dayanıklılığı; backup doğrulama; DR plan ve tatbikat; servis bazlı RPO/RTO; fault/chaos senaryoları; kesintisiz kaynak değişimi | P0 | XL | No |
| F-032 | A, B | A §19; B §3.2.19 | Observability | OpenTelemetry, Prometheus, Grafana, Loki, Alertmanager, Syslog/CEF/SIEM; ingestion/throughput/queue/latency/error/inference/resources/storage/query/users/alert/data-quality/connector/map/archive metrics; anomaly/threshold/disk growth alerts ve operasyon paneli | P0 | H | No |
| F-033 | A, B | A §20; B §3.2.3 | UI / Visual Design System | Koyu lacivert-camgöbeği-ölçülü altın; okunabilir ve oyun/hacker olmayan komuta merkezi; 16:9/multimonitor/full-screen/responsive/tablet; erişilebilir kontrast/klavye; tutarlı component design; Türkçe varsayılan/İngilizce ikinci dil; rol bazlı ekran ve yardım; F/Q klavye | P1 | H | Yes - ADR-001 |
| F-034 | B | §3.3.2 | SPYS - HİP Module | Plan kodu/proje tanım/uygunluk; referans tablolarla dedup; temel bilgi ve arz dosyası; PTD diff renkleri; HİAD dinamik şablon; 2. Sorgu puan/havuz; öncelik grubu; nihai rapor | P0 | XL | Deferred formats |
| F-035 | B | §3.3.3 | SPYS - SHP Module | HİP’ten uygun projeler; 20 yıllık yıllara sari planlama/uygunluk; ARGE, Modernizasyon, Harekâtı İdame, Altyapı, İnsan Gücü, Kuvvet Yapısı alt modülleri ve veri devri | P0 | XL | No |
| F-036 | B | §3.3.4 | SPYS - OYTEP Module | SHP uygun projeler; 10 yıllık miktar/kaynak/tedarik modeli ve uygunluk; altı alt modül; HİP/SHP veri devri; Millî Bütçe, SSDF, Dış Finansman, TSKGV, Özel Ödenek, TÜKA; program ve dış finansman tabloları | P0 | XL | Deferred formats |
| F-037 | B | §3.3.5 | SPYS - ARGE Projects | Planlama/programlama; ARGE Planı; SHP PTD, istatistik raporu, ÖYE; OYTEP PİTD ve program; yapılandırılabilir doküman şablonları | P1 | H | Deferred formats |
| F-038 | B | §3.3.6 | SPYS - Modernisation Projects | Demirbaş sistem/malzeme kapsamı; hazırlık formu; SHP plan ve istatistik; Paket Proje Planları-1; OYTEP program; yapılandırılabilir şablonlar | P1 | H | Deferred formats |
| F-039 | B | §3.3.7 | SPYS - Sustainment Projects | İşletme/bakım/idame, hizmet, kabiliyet, sefer stoku; bilgi formu; SHP ve OYTEP için iki alt modül; sefer stoklarında üç tablo; rapor | P1 | H | Deferred formats |
| F-040 | B | §3.3.8 | SPYS - Infrastructure Projects | Modernizasyon/yeniden yapılanma/acil ihtiyaç kaynaklı altyapı-yapı-bakım-onarım; SHP plan/rapor; OYTEP program; yapılandırılabilir şablon | P1 | M | Deferred formats |
| F-041 | B | §3.3.9 | SPYS - Workforce Projects | Nitelik/nicelik ve yıllara sari kadro; statü/sınıf/ihtisas; SHP kurulacak-lağvedilecek-azaltılacak birlik planı; OYTEP personel/kaynak programı | P1 | H | Deferred formats |
| F-042 | B | §3.3.10 | SPYS - Force Structure Projects | TBS numarası bazlı tablolar; hedef yapı; birlik/sistem kategorileri; Modernizasyon/Harekâtı İdame/Altyapı/İnsan Gücü tutarlılık bağları; SHP planı ve OYTEP programı | P1 | XL | Deferred formats |
| F-043 | B | §3.3.11 | SPYS - Urgent Operational Requirements | TMH/uluslararası/plansız/mücbir ihtiyaçların HİP-SHP-OYTEP dışında acil değerlendirmesi; PTD; işlem akışı | P1 | H | Deferred formats |
| F-044 | B | §3.3.12 | SPYS - HARDES | Düşük maliyetli hızlı tedarik ve ürün geliştirme; HARDES/Yenilikçi Sistem ayrımı; Proje Bilgi Kartı ve düzenleme; iki takip çizelgesi | P1 | H | Deferred formats |
| F-045 | B | §3.3.13 | SPYS - ARMERKOM | Kısa sürede ürüne dönüşen prototip, acil saha, çığır açan ARGE/inovasyon projeleri; takip çizelgesi | P1 | M | Deferred format |
| F-046 | B | §3.3.14 | SPYS - Budgeting Activities | OYTEP bütçe yılı kaynak tahsisi; modernizasyon bütçe süreci; takip/rapor ekranı; tahmini tutar; bütçe kalemi/proje/yıllara sari yüzdeler | P0 | H | Deferred format |
| F-047 | B | §3.3.15 | SPYS - Life Cycle | Mevcut sistem ömür devri; HİP-SHP-OYTEP envantere giriş planı; kuvvet yapısı için yıllara sari ana sistem; bütün savunma planlama çatısı; analizle genişletilebilir kurallar | P1 | H | Requires institution analysis |
| F-048 | B | §3.3.16 | SPYS - Project Coordination, Management & Tracking | Modernizasyon/ARGE/idame/altyapı koordinasyonu; bilgi kartı; emir; TİD; status; phase/milestone; OÇK/İDKK/SSİK; teşkilat; query; versioned documents; subprojects/search; Garanti/BKS; contacts; deliveries/change/delay; DEMAT/DEMAM/DEMAV ve 3-ay sarı/1-ay kırmızı sorumlu bildirimi | P0 | XL | Deferred formats |
| F-049 | B | §3.3.17 | SPYS - Periodic Listing | 10-20 yıllık planın 3 yılda yenilenmesi; onaylı/yeni dönem; önceki dönemi değişmez arşiv; yeni döneme kopya ve aktivasyon; HİP/SHP/OYTEP tarihsel erişim/rapor | P1 | H | Requires institution analysis |
| F-050 | B | §3.1.10.6 | SPYS - Currency Operations | TL/USD/EUR; dönüşüm; decimal-safe tutar; kur kaynağı/tarihi ve yuvarlama politikası konfigürasyonu | P0 | M | Yes - ADR-008 |
| F-051 | B | §3.1.25.2, §3.2.3.11, §3.2.18.10 | SPYS - Poka-Yoke UI | Akıllı önleyici kontroller; geçiş kapıları; server-side zorunluluk; yıldız işareti; range/reference/regex; yönlendirici düzeltme; kritik işlem onayı ve açık geri bildirim | P0 | H | No |
| F-052 | B | §3.2.3.12, §3.2.6.4-6, §3.2.7 | SPYS - Notification Management | E-posta ve in-app; servis tetikleme; iz kaydı; kanal ve tür bazlı mute; veri alanı değişikliklerine rol/kullanıcı aboneliği; sistem/DEMAT uyarıları | P1 | H | No |
| F-053 | B | §3.2.20 | SPYS - Reporting Engine | Kriter/filtre/sıra/görsel; Excel/PDF/CSV; conditional formatting; kullanıcı-cihaz-zaman-gizlilik-sayfa/toplam-sürüm filigranı; background; ayrık pre-production/OLAP okuma; preview/print/export; RBAC; report audit; real-time; archive; mali/adet istatistik | P0 | XL | Yes - ADR-007 |
| F-054 | B | §3.2.5, §3.2.18.4, §3.2.20.1.14, §3.3.17 | SPYS - Data Archiving & Period Management | Yetkili arşivleme; arşivde değişmezlik; tarih derinliği sorgusu; geçmiş rapor; dönem kapanış/kopya/aktivasyon; retention ve legal hold | P0 | H | No |
| F-055 | B | §3.2.4.1, §3.2.6.14-15, §3.2.19 | SPYS - Log Management | SIEM; user/security/technical logs; kullanıcı kimliği-tip-zaman-sonuç artı IP/cihaz; UTC storage/GMT+3 display; 5 yıl ve güvenli archive; immutability; disk doluluk/büyüme alert; periyodik rapor | P0 | H | No |
| F-056 | B | §3.1.13 | SPYS - TÜBİTAK BİLGEM/A Penetration Compliance | A-sınıfı yetkin bağımsız kaynak kod/sızma testi; açıklıkların kabulden önce kapanması; doğrulama denetimi; garanti döneminde düzeltme ve kanıt paketi | P0 | M | No |
| F-057 | B | §3.2.8.4, §3.2.15, §3.2.17-18 | SPYS - CI/CD Pipeline | Jenkins/GitLab; version-controlled workflow/scripts; otomatik trigger; paralel işler; secure config/secrets; işlem audit; static analysis/release tests/image scan; SOLID/review; promotion gate; rollback; dokümantasyon | P0 | H | Yes - ADR-005 |
| F-058 | B | §3.1.8, §3.2.3.16-18, §3.2.4, §3.2.12-16 | SPYS - User Management & RBAC | Kurum IAM tek otorite; role/group/permission screen variants; responsibility scope; JWT; service identities; timeout/lockout; function-key shortcuts; F/Q; TS EN ISO 9241-151 | P0 | H | Yes - ADR-002 |
| F-059 | B | §3.2.6, §3.2.18.10 | SPYS - Data Validation Rules | Integrity; range/consistency/reference; correction options; dictionary; configurable mandatory/optional; regex; numeric min/max; minimal free text; autocomplete/default; autocorrect suggestion; clear error; server enforcement | P0 | H | No |
| F-060 | B | §3.1.23, §3.2.6.3, §3.3.2, §3.3.5-16 | SPYS - Document Management | PDF/Word/Excel/JPG/PNG+ upload; type-size-magic-byte validation; data-field link; automatic versioning; author/date; PTD/HİAD/TİD/PİTD/Proje Emri/Yönetim Teşkilatı ve diğer configurable templates; diff; access/download audit | P0 | XL | Deferred formats |

## Alan bazında atomik alt gereksinim sayıları

Bu sayılar yukarıdaki satırların hücrelerinde birleştirilmiş, kabul testinde ayrı doğrulanacak alt gereksinimlerin toplamıdır.

| Domain ID | Count | Domain ID | Count | Domain ID | Count |
|---|---:|---|---:|---|---:|
| F-001 | 75 | F-021 | 38 | F-041 | 6 |
| F-002 | 30 | F-022 | 54 | F-042 | 8 |
| F-003 | 15 | F-023 | 11 | F-043 | 3 |
| F-004 | 14 | F-024 | 21 | F-044 | 6 |
| F-005 | 11 | F-025 | 32 | F-045 | 2 |
| F-006 | 10 | F-026 | 26 | F-046 | 6 |
| F-007 | 9 | F-027 | 24 | F-047 | 4 |
| F-008 | 9 | F-028 | 12 | F-048 | 25 |
| F-009 | 14 | F-029 | 16 | F-049 | 6 |
| F-010 | 9 | F-030 | 29 | F-050 | 5 |
| F-011 | 16 | F-031 | 19 | F-051 | 9 |
| F-012 | 11 | F-032 | 18 | F-052 | 7 |
| F-013 | 10 | F-033 | 22 | F-053 | 18 |
| F-014 | 11 | F-034 | 12 | F-054 | 7 |
| F-015 | 32 | F-035 | 9 | F-055 | 11 |
| F-016 | 28 | F-036 | 12 | F-056 | 4 |
| F-017 | 22 | F-037 | 8 | F-057 | 15 |
| F-018 | 16 | F-038 | 7 | F-058 | 11 |
| F-019 | 14 | F-039 | 9 | F-059 | 13 |
| F-020 | 15 | F-040 | 5 | F-060 | 14 |

Toplam: **60 özellik alanı, 935 atomik alt gereksinim**.

## Çapraz doküman çelişkileri ve ADR adayları

| ADR | Conflict | Resolution options | Uygulanacak güvenli varsayılan |
|---|---|---|---|
| ADR-001 | SPYS §3.2.3.14 Angular ister; hedef depo Next.js 16.2.6/React 19’dur. | (A) Ayrı Angular micro-frontend; (B) aynı UX/sözleşmeleri veren Next.js modülü ve Kurum onayı | **KARAR BEKLİYOR. SPYS UI kodu yazılmaz.** Her iki seçenek belgelenir. |
| ADR-002 | OSIRIS geniş kimlik/RBAC altyapısı ister; SPYS §3.1.8 ayrı IAM/yetkilendirme uygulamasını yasaklar. | Kurum IAM’e federasyon; yalnız claim-policy adapteri; yerel kullanıcı parolası yok | Kurum IAM tek identity authority; uygulama sadece claims-to-policy enforcement yapar. |
| ADR-003 | OSIRIS açık kaynak internet adapterlerini öngörür; SPYS §3.1.7 TSK ağı ile Genel Ağ arasında hiçbir erişime izin vermez. | Fiziksel/mantıksal ayrık ürün profili; onaylı offline transfer; tek yönlü kontrollü ingest zone | SPYS profili tamamen air-gapped; public connectorlar bu profilde build-time ve runtime kapalı. |
| ADR-004 | SPYS §3.1.10.8 RSA 256/MD5/AES 256/DES/SNOW seçeneklerini sayar; OSIRIS modern TLS 1.3/AES-256 ister. | Legacy algoritmalar; modern onaylı suite; HSM tabanlı kurum profili | MD5/DES şifreleme olarak reddedilir; AES-256-GCM + TLS 1.3, kurum onaylı HSM policy. |
| ADR-005 | OSIRIS 20-stage DevSecOps ister; SPYS Jenkins veya GitLab CI ve paralel iş akışı ister. | Jenkinsfile; GitLab CI; CI-agnostic reusable scripts | Kontroller CI-agnostic, GitLab/Jenkins adapterleri; 20 aşama minimum. |
| ADR-006 | OSIRIS polyglot PostGIS/OpenSearch/OLAP/graph/object stores ister; SPYS PostgreSQL uyumu ve AKKV ister. | Tek PostgreSQL; SPYS PostgreSQL SoR + OSIRIS adjunct stores; tümü açık kaynak/on-prem | SPYS transaction SoR PostgreSQL; diğer depolar yalnız ayrık OSIRIS/analytics rolleri. |
| ADR-007 | OSIRIS kendi reporting servisini; SPYS kurum ortak raporlama altyapısını ve gerektiğinde ayrı rapor DB’sini ister. | Kurum servisine adapter; yerel fallback; read replica/OLAP | Port-adapter yaklaşımı; SPYS’de kurum servisi öncelikli, yerel motor yalnız onaylı fallback. |
| ADR-008 | SPYS “Dolar” der; ISO kodu, kur kaynağı ve rounding tanımsızdır. | USD varsayımı; kurum tanım tablosu; farklı dolar türü seçimi | ISO 4217 kodu config; varsayılan `USD`, kurum onayı olmadan canlı kur entegrasyonu yok. |
| ADR-009 | SPYS UTC veya GMT+3 log kaydı der; OSIRIS iki gösterimi destekler. | GMT+3 storage; UTC storage; çift alan | UTC immutable storage, `Europe/Istanbul` türetilmiş display; offset ve zone audit çıktısında yer alır. |
| ADR-010 | OSIRIS dört ayrık ortam ister; SPYS en az pre-production ve production ister. | İki ortam; dört ortam | Daha yüksek izolasyon: dev/test/training/prod; SPYS acceptance pre-production ayrı DB/keys ile karşılanır. |

## İhale dokümanına ertelenmiş gereksinimler

PDF’de “ihale dokümanında belirtildiği şekilde/formatta” ifadesi taşıyan **82** madde vardır. Tamamı `REQUIRES_CLARIFICATION` durumundadır. Bu maddeler için iş mantığı uydurulmayacak; aşağıdaki ortak konfigürasyon sözleşmesi kullanılacaktır:

```text
tenderRequirements.<clause>.status = REQUIRES_CLARIFICATION
tenderRequirements.<clause>.templateId = null
tenderRequirements.<clause>.templateVersion = null
tenderRequirements.<clause>.institutionApprovalRef = null
tenderRequirements.<clause>.effectiveFrom = null
```

Madde listesi:

```text
3.1.1, 3.1.2, 3.1.3, 3.1.4, 3.1.6, 3.1.9.3, 3.1.12, 3.1.14,
3.1.19, 3.1.20, 3.1.22.1, 3.1.24, 3.1.25.4, 3.1.27.4, 3.1.27.5,
3.1.28, 3.1.29, 3.1.30, 3.1.31, 3.1.34, 3.2.2.3, 3.2.8.1, 3.2.9.2,
3.2.10, 3.2.11, 3.2.12.10, 3.2.18.9, 3.2.19.1.1.5, 3.2.19.1.1.7,
3.2.19.2.9, 3.2.19.2.11, 3.2.19.2.12, 3.2.20.1.15, 3.3.1.1,
3.3.2.2, 3.3.2.3, 3.3.2.4, 3.3.2.6, 3.3.2.7, 3.3.2.8, 3.3.2.9,
3.3.4.4, 3.3.4.6, 3.3.5.2, 3.3.5.3.1, 3.3.5.3.2, 3.3.5.3.3,
3.3.5.4.1, 3.3.5.4.2, 3.3.6.2.1, 3.3.6.2.2, 3.3.6.2.3, 3.3.6.2.4,
3.3.6.3.1, 3.3.7.2, 3.3.7.3.2, 3.3.7.3.3, 3.3.7.4.2, 3.3.7.4.3,
3.3.8.2.1, 3.3.8.3.1, 3.3.9.2, 3.3.9.3.2, 3.3.9.4.2, 3.3.10.2,
3.3.10.3.3, 3.3.10.4.3, 3.3.11.2, 3.3.11.2.1, 3.3.12.4, 3.3.12.6,
3.3.13.2, 3.3.14.3, 3.3.16.2, 3.3.16.5, 3.3.16.6, 3.3.16.8,
3.3.16.9, 3.3.16.10, 3.3.16.12, 3.3.16.20, 3.4.1
```

`3.1.1` ayrıca hizmet yeri (`3.1.1.1`) ve yüklenici özelliklerini (`3.1.1.2`) kapsar. Bu iki alt madde parent kayıt üzerinden ayrı kabul ölçütü olarak izlenecektir.

## Step 1 çıkış kapısı

- [x] Her iki kaynak bütünüyle okundu.
- [x] 60 birleşik alan sabit kimlikle kaydedildi.
- [x] Alt gereksinimler alan bazında sayıldı.
- [x] Çapraz doküman çelişkileri ADR adaylarına dönüştürüldü.
- [x] İhale dokümanına ertelenmiş 82 madde işaretlendi.
- [x] ADR-001 onayı gelmeden SPYS kullanıcı arayüzü kodlanmayacağı kayda geçirildi.
