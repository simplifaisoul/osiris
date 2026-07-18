# ADR-004: Cryptographic Suite

- Status: ACCEPTED
- Date: 2026-07-18

## Decision

TLS 1.3 is required at ingress and mTLS is required between services where institution infrastructure supports it. Stored sensitive data uses AES-256-GCM or an Institution-approved equivalent. Keys are injected at runtime from OpenBao/KMS/HSM-backed files and never committed or placed directly in ordinary environment variables.

SPYS §3.1.10.8 references RSA 256, MD5, AES 256, DES and SNOW. MD5 and DES are not accepted as encryption. MD5 may only identify a legacy non-security checksum when an explicit compatibility record exists; it may never establish integrity or authenticity.

