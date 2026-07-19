# KAM Multi‑INT + SPYS — Complete Kubernetes Guide for Beginners

> **Who this guide is for.** You know what a terminal is. You can copy and paste
> commands. You have never used Kubernetes, and words like *RBAC*, *Secret* and
> *namespace* mean nothing to you yet. That is completely fine. By the end of
> this guide you will understand every one of them, and you will be able to
> deploy and operate the KAM Multi‑INT + SPYS platform.
>
> **A promise about language.** You will not see the words *"simply"* or *"just"*
> in this guide. Nothing here is simple the first time. We go slowly, we explain
> every command, and we tell you what success and failure look like.

---

## How to read this guide

Every command in this guide comes with three things, always in the same order:

1. **What it does** — one or two plain‑English sentences.
2. **✅ What success looks like** — the output you should see.
3. **⚠️ A common error and the fix** — what goes wrong most often, and how to
   recover.

When you see a box like this:

> ✅ **Checkpoint.** Run `kubectl get pods -n kam`. You should see a line that ends
> in `Running`. If you do, you are ready for the next section.

…stop and actually run the command. Checkpoints are how you catch a small
mistake before it becomes a confusing one three steps later.

**A note on scope and honesty.** This platform is being built in phases. Some
services described in the specification exist **today** (the `foundation-api` and
the `osiris-web` front end). Many others — ingestion, fusion, analytics, AI,
media‑processing, alerting, reporting, archive — are **planned for later phases**
and do not exist as running code yet. Throughout the guide, anything you can run
today is marked **[LIVE TODAY]**, and anything that is a forward‑looking template
is marked **[PLANNED — Phase N]**. We never pretend a planned service is real,
because deploying a manifest for a service that does not exist only produces
confusing errors.

---

# Chapter 0 — Before You Start

## 0.1 What is Kubernetes, and why does this project need it?

Imagine a large hotel.

- **Guests** arrive and need rooms. Some need one room, some need ten.
- A **hotel manager** decides which room each guest goes to, moves guests when a
  room floods, and hires a replacement cleaner the moment one calls in sick.
- Guests never worry about *which* physical room they are in — they only know
  their needs are met.

**Kubernetes is the hotel manager.** Your *guests* are the small programs that
make up the KAM platform (the API, the web front end, the database, and later
the ingestion and analytics services). Kubernetes decides which machine each
program runs on, restarts a program that crashes, and starts more copies when
the platform gets busy — all without you watching over it by hand.

Why does *this* project need a hotel manager instead of running everything on
one server by hand?

- **It is many programs, not one.** KAM is a *Multi‑INT* platform: a front end,
  an API, a database with geographic extensions, ingestion workers, an
  analytics engine, and more. Coordinating them by hand is error‑prone.
- **It must stay up.** The specification requires **≥ 99.9 % availability**
  (OSIRIS §18). If one copy of a service dies at 3 a.m., something must restart
  it automatically. That "something" is Kubernetes.
- **It must scale.** When a crisis produces a flood of data, the platform needs
  more workers for a few hours and then fewer again. Kubernetes does this
  automatically.
- **It must be secure and isolated.** Different environments (development,
  testing, production) and — for the SPYS profile — a fully offline, *air‑gapped*
  network must not leak into each other. Kubernetes gives us the walls to
  enforce that.

## 0.2 What you need installed before Chapter 1

You need three tools. Here is what each one is, in plain English:

| Tool | What it is (analogy) | Do you always need it? |
|---|---|---|
| **kubectl** | The *remote control* you point at the hotel to give orders ("show me the guests", "add a room"). Pronounced "cube‑control" or "cube‑cuttle". | **Yes, always.** |
| **Helm** | A *recipe book*: instead of placing 40 orders one by one, you follow one recipe that places them all correctly. | Yes, for Chapter 9 onward. |
| **Docker** | A *shipping‑container factory*: it packs a program plus everything it needs into one sealed box (an *image*) that runs the same everywhere. | Only if you **build** images yourself. If someone hands you pre‑built images, you can skip it. |

### Install on macOS

```bash
# Homebrew is a "software installer for macOS". If you do not have it, install it
# first from https://brew.sh — then run the three lines below.
brew install kubectl   # installs the Kubernetes remote control
brew install helm      # installs the recipe-book tool
brew install --cask docker  # installs Docker Desktop (the container factory)
```

### Install on Ubuntu / Debian Linux

```bash
# 1) kubectl — download the official binary and move it into your PATH.
curl -LO "https://dl.k8s.io/release/$(curl -L -s https://dl.k8s.io/release/stable.txt)/bin/linux/amd64/kubectl"
sudo install -o root -g root -m 0755 kubectl /usr/local/bin/kubectl

# 2) Helm — the official install script.
curl https://raw.githubusercontent.com/helm/helm/main/scripts/get-helm-3 | bash

# 3) Docker Engine — the official convenience script.
curl -fsSL https://get.docker.com | sh
```

### Install on Windows (PowerShell, run as Administrator)

```powershell
# winget is the built-in Windows package installer.
winget install -e --id Kubernetes.kubectl   # the remote control
winget install -e --id Helm.Helm            # the recipe book
winget install -e --id Docker.DockerDesktop # the container factory
```

## 0.3 How to verify your tools are working

Run each command below. The exact version numbers will differ — that is normal.
What matters is that a version prints and no error appears.

```bash
kubectl version --client
```

- **What it does:** asks the remote control to report its own version.
- ✅ **Success looks like:**
  ```
  Client Version: v1.31.0
  Kustomize Version: v5.4.2
  ```
- ⚠️ **Common error:** `command not found: kubectl`. This means the tool did not
  install onto your PATH. Re‑run the install step for your operating system,
  then close and reopen your terminal so it picks up the new program.

```bash
helm version
```

- **What it does:** asks the recipe‑book tool to report its version.
- ✅ **Success looks like:** `version.BuildInfo{Version:"v3.15.0", ...}`
- ⚠️ **Common error:** `command not found: helm` → re‑run the Helm install step.

```bash
docker version
```

- **What it does:** asks the container factory to report its version.
- ✅ **Success looks like:** two blocks, `Client:` and `Server:`, each with a
  version.
- ⚠️ **Common error:** `Cannot connect to the Docker daemon`. Docker is installed
  but not *running*. Open Docker Desktop (macOS/Windows) or run
  `sudo systemctl start docker` (Linux), wait ten seconds, and try again. If you
  are not building images yourself, you can ignore this error entirely.

> ✅ **Checkpoint.** All three commands printed a version (Docker may be skipped
> if you will not build images). You are ready for Chapter 1.

---

# Chapter 1 — Project Structure Overview

## 1.1 The monorepo layout

A *monorepo* means "one git repository that holds many services". Instead of ten
repositories you have one folder tree. Here is the KAM layout, with each part
explained in one plain sentence:

```
osiris/
├── src/                     # [LIVE TODAY] The existing Next.js web app (map, panels)
├── apps/web/                # [PLANNED] The web app's future home after restructuring
├── services/
│   ├── api/                 # [LIVE TODAY] The FastAPI "foundation API": security, audit,
│   │                        #   the common data model, SPYS planning schema
│   ├── ingestion/           # [PLANNED — Phase 2] Pulls data from ≥60 external sources
│   ├── fusion/              # [PLANNED — Phase 4] Correlates data across domains
│   ├── analytics/           # [PLANNED — Phase 4/5] GNSS/CTI/financial/space analysis
│   ├── ai/                  # [PLANNED — Phase 4] Speech-to-text, translation, vision
│   ├── media-processing/    # [PLANNED — Phase 4] Transcode, OCR, keyframes
│   ├── alerting/            # [PLANNED — Phase 5] Early-warning alerts (≤3 min SLA)
│   ├── reporting/           # [PLANNED — Phase 3/6] PDF/DOCX/XLSX report generation
│   └── archive/             # [PLANNED — Phase 5] Long-term evidence storage
├── packages/contracts/      # [LIVE TODAY] Shared TypeScript types (the "shared dictionary")
├── infra/
│   ├── docker/              # [LIVE TODAY] docker-compose overlays for local runs
│   ├── kubernetes/          # [LIVE TODAY] The manifests this guide deploys
│   └── observability/       # [LIVE TODAY] OpenTelemetry collector config
└── docs/                    # [LIVE TODAY] ADRs, requirements, deployment guides
```

## 1.2 What each service does, in one sentence

| Service | One plain sentence | Status |
|---|---|---|
| **web** (`osiris-web`) | Shows the map and all the panels an analyst looks at. | LIVE TODAY |
| **api** (`foundation-api`) | Checks who you are, records every action, and stores the core data safely. | LIVE TODAY |
| **ingestion** | Fetches data from flights, ships, satellites, news, and dozens more sources. | PLANNED — Phase 2 |
| **fusion** | Joins clues from different sources into one picture ("this ship + this news = this event"). | PLANNED — Phase 4 |
| **analytics** | Turns raw data into probabilities and trends (e.g. *probable* GNSS accuracy degradation). | PLANNED — Phase 4/5 |
| **ai** | Transcribes audio, translates 17 languages, reads text in images. | PLANNED — Phase 4 |
| **media-processing** | Makes small previews and searchable versions of big video/image files. | PLANNED — Phase 4 |
| **alerting** | Sends a warning within three minutes when something important happens. | PLANNED — Phase 5 |
| **reporting** | Produces watermarked PDF/Excel/Word reports. | PLANNED — Phase 3/6 |
| **archive** | Keeps evidence unchanged for at least five years. | PLANNED — Phase 5/6 |

## 1.3 How a service becomes a Pod and a Deployment

Two new words. Both have simple analogies.

**A Pod is a single running worker.** If a service is a *job role* ("data
ingestion clerk"), a Pod is *one specific person doing that job right now*. A Pod
wraps one (or a few tightly‑related) containers — remember, a container is the
sealed box Docker builds.

**A Deployment is a standing instruction that says "always keep N of these
workers on duty".** It is like a manager's note pinned to the wall: *"I always
need 2 ingestion clerks. If one goes home sick, hire another immediately."* You
do not create Pods by hand; you tell the Deployment how many you want, and
Kubernetes keeps that many Pods alive for you.

```
   Deployment "foundation-api"  (the standing instruction: "keep 2 alive")
        │
        ├── Pod foundation-api-7d9c...   ← worker #1 (Running)
        └── Pod foundation-api-4f2a...   ← worker #2 (Running)
             │
             └── container "api"  ← the sealed box: FastAPI + its dependencies
```

If worker #1 crashes, the Deployment notices "I only have 1, I need 2" and
starts a fresh Pod automatically. You did nothing. That is the hotel manager at
work.

> ✅ **Checkpoint.** You can now explain, in your own words: *a Deployment keeps a
> chosen number of Pods running; a Pod is one running copy of a service; a
> container is the sealed box inside the Pod.* If you can, move on.

---

# Chapter 2 — Namespaces

## 2.1 What a namespace is

**A namespace is a floor in an office building.** The building is your Kubernetes
cluster. Each floor is walled off from the others. Two people named "Alex" can
work on different floors without confusion, because "Alex on floor 3" and "Alex
on floor 7" are clearly different. In Kubernetes, two Secrets named
`kam-foundation-secrets` can exist on different floors (namespaces) without
clashing.

## 2.2 Why this project uses separate namespaces

The specification (ADR‑010) calls for **four separate environments** so that a
mistake in one cannot damage another:

| Namespace | Floor analogy | Purpose |
|---|---|---|
| `kam-dev` | The workshop floor | Developers try things; breakage is fine. |
| `kam-test` | The inspection floor | Automated tests run against a clean copy. |
| `kam-training` | The classroom floor | Operators practice without touching real data. |
| `kam-prod` | The live operations floor | The real, guarded system. |

There is also a special forward‑looking profile, **`kam-spys-airgap`**, for the
SPYS deployment that must never touch the public internet (ADR‑003).

> **Today's reality.** The manifests in `infra/kubernetes/base` currently ship a
> single namespace called `kam`. The four‑namespace model above is the target
> described in the roadmap. This chapter teaches you to create all of them so you
> are ready; the base deployment in later chapters uses `kam`.

## 2.3 How to create each namespace

```bash
# "kubectl create namespace" builds a new, empty floor with the given name.
kubectl create namespace kam-dev
kubectl create namespace kam-test
kubectl create namespace kam-training
kubectl create namespace kam-prod
```

- **What it does:** creates four walled‑off areas in your cluster.
- ✅ **Success looks like:** one line per command:
  ```
  namespace/kam-dev created
  ```
- ⚠️ **Common error:** `AlreadyExists`. The floor is already there — this is
  harmless. If you want to be sure it is configured correctly, describe it (next
  section) instead of recreating it.

There is one important extra setting for the real namespace: a security label
that tells Kubernetes "only allow hardened, non‑root Pods on this floor".

```bash
# This label enforces the "restricted" Pod Security Standard on the namespace,
# which blocks Pods that try to run as root or grab extra privileges.
kubectl label namespace kam-prod pod-security.kubernetes.io/enforce=restricted
```

- ✅ **Success looks like:** `namespace/kam-prod labeled`
- ⚠️ **Common error:** later, a Deployment is rejected with `violates PodSecurity
  "restricted"`. That is this label doing its job — it means a Pod tried to run
  as root. The fix is in the Pod's manifest (Chapter 7), not here.

## 2.4 How to verify they exist

```bash
# "get namespaces" lists every floor in the building.
kubectl get namespaces
```

- ✅ **Success looks like:**
  ```
  NAME             STATUS   AGE
  kam-dev          Active   30s
  kam-test         Active   28s
  kam-training     Active   26s
  kam-prod         Active   24s
  default          Active   5d
  kube-system      Active   5d
  ```
- ⚠️ **Common error:** your new namespaces are missing. You likely created them
  in a different cluster than the one you are looking at now. See Chapter 0's
  cluster check and Chapter 14, problem 1.

> ✅ **Checkpoint.** `kubectl get namespaces` lists `kam-dev`, `kam-test`,
> `kam-training`, and `kam-prod` as `Active`.

---

# Chapter 3 — Managing Secrets

## 3.1 Why we never put passwords in code

Writing a database password directly into your source code is like **writing
your house key's cut pattern on the front door**. Anyone who can see the door
(and source code is seen by many people, and often copied into logs, backups,
and git history forever) can make a copy of the key. Once a secret is in git
history, it is effectively public — you must treat it as leaked and change it.

The rule for this project is absolute: **secrets live outside code and config,
and are injected at runtime** (OSIRIS §16). The API even reads its database
password from a *file* mounted into the container, never from a value baked into
the image.

## 3.2 What a Kubernetes Secret is

**A Secret is a sealed envelope that the hotel keeps at reception.** A room
service worker can be *handed* the envelope when they need it, but the envelope
is not left lying on the front desk for anyone to read. In Kubernetes, a Secret
is an object that holds sensitive values and is given to a Pod only when that Pod
is explicitly allowed to have it.

> **An honest caveat every beginner must hear.** A default Kubernetes Secret is a
> *sealed envelope*, not a *bank vault*. Its contents are only **base64‑encoded**
> (a reversible format, not encryption) unless you turn on "encryption at rest"
> in the cluster. For real production use, this project uses an external secret
> manager (**OpenBao**, Section 3.9). Native Secrets are acceptable for a
> lab/training namespace only.

## 3.3 Creating the secrets this project needs

The API expects one Secret named **`kam-foundation-secrets`** containing several
keys. Below, create each category. Replace every `REPLACE_ME` with a real value —
and **never** paste a real value into a chat, ticket, or commit.

### Database passwords (PostgreSQL, Redis)

```bash
# "create secret generic" makes a sealed envelope from key=value pairs.
# --from-literal puts a value in directly (fine for a lab).
kubectl create secret generic kam-foundation-secrets \
  --namespace kam-prod \
  --from-literal=postgres-password='REPLACE_ME_STRONG_DB_PASSWORD' \
  --from-literal=redis-password='REPLACE_ME_STRONG_REDIS_PASSWORD'
```

- **What it does:** creates the envelope `kam-foundation-secrets` on the
  `kam-prod` floor, containing the database and cache passwords.
- ✅ **Success looks like:** `secret/kam-foundation-secrets created`
- ⚠️ **Common error:** `AlreadyExists`. The envelope exists. To add more keys to
  it without deleting it, use the "apply/patch" approach shown in Section 3.5.

### API keys for connectors (OpenSky, AISStream, etc.)  [PLANNED — Phase 2]

The ingestion connectors are a Phase 2 feature. When they arrive, their keys go
into a **separate** envelope so a leak of one does not expose the others:

```bash
# Reading a key from a file is safer than typing it on the command line,
# because command lines are saved in your shell history.
kubectl create secret generic kam-connector-keys \
  --namespace kam-prod \
  --from-file=opensky-token=./secrets/opensky.token \
  --from-file=aisstream-key=./secrets/aisstream.key
```

- ✅ **Success looks like:** `secret/kam-connector-keys created`
- ⚠️ **Note:** if a connector has **no** key, the platform must render it as
  `CONFIGURATION_REQUIRED`, not as a live‑but‑broken source. Do not invent a
  placeholder key to make a red light turn green.

### JWT signing keys and the audit key

The API does **not** sign its own login tokens — the Institution's IAM does that
(ADR‑002). What the API needs is:

- the IAM's **issuer URL** and **JWKS URL** (public information, but stored as a
  Secret so it is managed in one place), and
- a private **audit HMAC key** used to make the audit log tamper‑evident.

```bash
kubectl create secret generic kam-foundation-secrets \
  --namespace kam-prod \
  --from-literal=oidc-issuer='https://institution-iam.internal/realms/kam' \
  --from-literal=oidc-jwks-url='https://institution-iam.internal/realms/kam/protocol/openid-connect/certs' \
  --from-file=audit-hmac-key=./secrets/audit-hmac.key \
  --from-literal=postgres-password='REPLACE_ME_STRONG_DB_PASSWORD'
```

> To generate a strong audit key file locally:
> ```bash
> # "openssl rand -hex 32" prints 32 random bytes as text: a strong secret key.
> openssl rand -hex 32 > ./secrets/audit-hmac.key
> ```

### Object storage credentials (MinIO / Ceph)  [PLANNED — Phase 2/5]

```bash
kubectl create secret generic kam-object-store \
  --namespace kam-prod \
  --from-literal=access-key='REPLACE_ME' \
  --from-literal=secret-key='REPLACE_ME'
```

### SIEM integration token  [PLANNED — Phase 6]

```bash
kubectl create secret generic kam-siem \
  --namespace kam-prod \
  --from-literal=cef-token='REPLACE_ME'
```

## 3.4 How to reference a secret in a deployment manifest

You never copy the secret value into the Deployment. You *point* at it. Here is
the exact pattern the real `foundation-api` Deployment uses:

```yaml
env:
  - name: OIDC_ISSUER                     # the environment variable the app reads
    valueFrom:
      secretKeyRef:
        name: kam-foundation-secrets      # which sealed envelope
        key: oidc-issuer                  # which item inside it
volumeMounts:
  - name: audit-key                       # mount a secret as a file...
    mountPath: /run/secrets               # ...at this path inside the container
    readOnly: true
volumes:
  - name: audit-key
    secret:
      secretName: kam-foundation-secrets
      items:
        - { key: audit-hmac-key, path: audit_hmac_key, mode: 256 }
        - { key: postgres-password, path: postgres_password, mode: 256 }
```

The app then reads `/run/secrets/postgres_password` as a file. The password is
never an environment variable and never in the image. `mode: 256` is octal `0400`
— "readable only by the file's owner".

## 3.5 How to rotate a secret without downtime

*Rotating* means replacing a secret with a new value (for example, after someone
leaves the team). The goal is to do it **without** the service going dark.

```bash
# Step 1: overwrite the envelope with the new value. "apply" updates in place.
kubectl create secret generic kam-foundation-secrets \
  --namespace kam-prod \
  --from-literal=postgres-password='THE_NEW_PASSWORD' \
  --dry-run=client -o yaml | kubectl apply -f -
```

- **What it does:** the `--dry-run=client -o yaml | kubectl apply -f -` trick
  builds the updated envelope and applies it, replacing the old value.
- Then trigger a **rolling restart** so Pods pick up the new value one at a time,
  keeping the service available throughout:

```bash
# "rollout restart" replaces Pods gradually: it starts a new one, waits for it
# to be healthy, then removes an old one — so you never drop to zero.
kubectl rollout restart deployment/foundation-api -n kam-prod
```

- ✅ **Success looks like:** `deployment.apps/foundation-api restarted`, followed
  (see Chapter 7) by new Pods becoming `Running` and `1/1 Ready` before old ones
  disappear.
- ⚠️ **Important ordering:** for a database password you must change it in the
  database **and** in the Secret in a coordinated way. A safe pattern is: add the
  new password to Postgres as an additional valid credential, rotate the Secret,
  restart, then remove the old credential. Rotating the Secret before the
  database accepts the new password will cause `CrashLoopBackOff` (Chapter 14,
  problem 2).

## 3.6 What NOT to do — common beginner mistakes

- ❌ **Do not** put a real value in a YAML file and commit it. Even in a private
  repo, it lives in history forever.
- ❌ **Do not** paste secrets into `kubectl` on a shared machine — the command is
  saved in shell history. Prefer `--from-file`.
- ❌ **Do not** log the secret to check it ("just printing it once"). Logs are
  collected centrally and kept for years.
- ❌ **Do not** reuse the same value across `kam-dev` and `kam-prod`. A leak in
  the workshop must not open the live floor.
- ❌ **Do not** email or Slack a secret. If you must hand one off, use the
  secret manager's sharing feature.

## 3.7 Introduction to OpenBao / external secret managers

**OpenBao** (a community fork of HashiCorp Vault) is a dedicated *bank vault* for
secrets, separate from Kubernetes. Instead of the reception desk holding sealed
envelopes, there is a real vault with a guard, an access log, automatic key
rotation, and the ability to hand out *short‑lived* credentials that expire on
their own.

Use an external secret manager instead of native Secrets when **any** of these
are true (all of which apply to KAM production):

- You need an **audit trail** of who read which secret and when (OSIRIS §16).
- You need **automatic rotation** of database and signing keys.
- You need secrets **encrypted with a hardware key (HSM/KMS)** at rest (ADR‑004).
- Multiple clusters or the SPYS air‑gapped profile must share a controlled
  source of truth.

The connection points already exist in the configuration (`OPENBAO_ADDR`,
`OPENBAO_ROLE` in `.env.example`). The typical pattern is the *External Secrets
Operator*, which reads from OpenBao and materializes a native Kubernetes Secret
that your Pods consume — so your Deployment manifests do not change.

> ✅ **Checkpoint.** Run:
> ```bash
> kubectl get secret kam-foundation-secrets -n kam-prod \
>   -o jsonpath='{.data}' | tr ',' '\n'
> ```
> You should see key *names* like `postgres-password` and `audit-hmac-key`. You
> will see scrambled (base64) values, never plaintext, and that is expected.

---

# Chapter 4 — ConfigMaps

## 4.1 A ConfigMap vs a Secret

- **A ConfigMap is a public notice board** in the office lobby: the timezone, the
  name of the database host, feature flags. Anyone may read it; nothing here is
  sensitive.
- **A Secret is the locked safe** behind reception: passwords and keys.

Same idea — both hold settings your app reads — but one is public and one is
guarded. The rule of thumb: *if leaking it would cause harm, it is a Secret;
otherwise it is a ConfigMap.*

## 4.2 Which settings go where

| Setting | ConfigMap or Secret? | Why |
|---|---|---|
| `DEFAULT_TIMEZONE=Europe/Istanbul` | ConfigMap | Public; display setting (GMT+3). |
| `CURRENCY_BASE=TRY`, `CURRENCY_ALLOWED=TRY,USD,EUR` | ConfigMap | Business rule, not sensitive. |
| `AUTH_REQUIRED=true` | ConfigMap | A flag, not a credential. |
| `DEMAT_YELLOW_DAYS=92`, `DEMAT_RED_DAYS=31` | ConfigMap | Notification thresholds. |
| `postgres-password` | **Secret** | Leaking it opens the database. |
| `audit-hmac-key` | **Secret** | Leaking it lets someone forge audit logs. |
| `oidc-jwks-url` | Either | Public URL, but kept in the Secret here for single‑source management. |

## 4.3 How to create and update a ConfigMap

```bash
# Create the notice board with several public settings.
kubectl create configmap kam-foundation-config \
  --namespace kam-prod \
  --from-literal=DEFAULT_TIMEZONE=Europe/Istanbul \
  --from-literal=CLASSIFICATION_DEFAULT=UNCLASSIFIED \
  --from-literal=CURRENCY_BASE=TRY \
  --from-literal=CURRENCY_ALLOWED=TRY,USD,EUR \
  --from-literal=CURRENCY_SCALE=4 \
  --from-literal=DEMAT_YELLOW_DAYS=92 \
  --from-literal=DEMAT_RED_DAYS=31 \
  --from-literal=AUTH_REQUIRED=true \
  --from-literal=DEPLOYMENT_PROFILE=OSIRIS_CONNECTED
```

- ✅ **Success looks like:** `configmap/kam-foundation-config created`
- ⚠️ **Common error:** `AlreadyExists` → update it instead of recreating:

```bash
# Edit one value and re-apply, without deleting the whole board.
kubectl create configmap kam-foundation-config \
  --namespace kam-prod \
  --from-literal=DEMAT_YELLOW_DAYS=92 \
  --dry-run=client -o yaml | kubectl apply -f -
```

> **Important:** changing a ConfigMap does **not** automatically restart the Pods
> using it. After an update, run
> `kubectl rollout restart deployment/foundation-api -n kam-prod` so the change
> takes effect. Forgetting this is the number‑one reason "my config change did
> nothing".

> ✅ **Checkpoint.**
> `kubectl get configmap kam-foundation-config -n kam-prod -o yaml`
> should show your keys under `data:` in plain text (that is fine — it is a
> notice board, not a safe).

---

# Chapter 5 — RBAC (Role‑Based Access Control)

## 5.1 What RBAC is, in plain English

Picture a hospital. A **doctor**, a **nurse**, and a **receptionist** each carry a
different **access badge**. The doctor's badge opens the medicine cabinet; the
receptionist's does not. Nobody argues at each door — the badge decides.

**RBAC is that badge system for Kubernetes.** It answers: *"Is this identity
allowed to perform this action on this kind of object?"* — for example, *"May the
ingestion service read Secrets in the `kam-prod` namespace?"*

## 5.2 Key terms, each with an analogy

| Term | Analogy | Plain meaning |
|---|---|---|
| **ServiceAccount** | The **ID card a service carries** | The identity a Pod uses when it talks to Kubernetes. |
| **Role** | A **list of allowed actions**, valid on one floor | "May read ConfigMaps and Secrets in namespace X." |
| **ClusterRole** | The same list, but **building‑wide** | Permissions across all namespaces / cluster‑level objects. |
| **RoleBinding** | **Handing an ID card holder a permission list** | "Give ServiceAccount `ingestion` this Role, here on floor `kam-prod`." |
| **ClusterRoleBinding** | The building‑wide version of the above | Grant a ClusterRole across the whole cluster. |

**ClusterRole vs Role = building‑wide vs floor‑only access.** Prefer Role
(floor‑only) whenever you can; a badge that opens every door in the building is a
bigger risk if it is lost.

## 5.3 The principle of least privilege

**Give each service the fewest permissions it needs, and nothing more.** A
data‑ingestion Pod does not need to delete Deployments, so its badge must not
open that door. If that Pod is ever compromised, the damage is limited to what
its tiny badge allows. This is a hard requirement (OSIRIS §16, SPYS §3.2.12–16).

Most KAM services actually need **very few** Kubernetes permissions, because they
talk to the *database* and *each other*, not to the Kubernetes API. The safest
default is: **no permissions at all**, plus `automountServiceAccountToken:
false` (do not even hand the Pod an ID card it will not use). The real
`foundation-api` Deployment already sets exactly that.

## 5.4 Which services need which permissions

| Service | Needs to call the Kubernetes API? | Badge (Role) it should carry |
|---|---|---|
| `foundation-api` | No | A ServiceAccount with **no** Role; token not mounted. |
| `web` (`osiris-web`) | No | Same — no Kubernetes permissions. |
| `ingestion` [Phase 2] | Read its own config/secret only | Role: `get` on the named ConfigMap/Secret. |
| `fusion`, `analytics`, `ai`, `media-processing` [Phase 4] | No | No Role; DB + message queue only. |
| `alerting` [Phase 5] | No | No Role. |
| `reporting` [Phase 3/6] | No | No Role; reads DB replica + object store. |

## 5.5 Manifest examples

### The safest default: an identity that carries no badge  [LIVE TODAY]

```yaml
apiVersion: v1
kind: ServiceAccount
metadata:
  name: foundation-api      # the ID card
  namespace: kam-prod
---
# In the Deployment, refuse to even mount the token:
#   serviceAccountName: foundation-api
#   automountServiceAccountToken: false
# Result: the Pod has an identity for auditing but zero Kubernetes powers.
```

### A minimal read‑only Role for ingestion  [PLANNED — Phase 2]

```yaml
apiVersion: v1
kind: ServiceAccount
metadata:
  name: ingestion
  namespace: kam-prod
---
apiVersion: rbac.authorization.k8s.io/v1
kind: Role                          # a list of allowed actions on THIS floor only
metadata:
  name: ingestion-read-own-config
  namespace: kam-prod
rules:
  - apiGroups: [""]                 # "" is the core API group (ConfigMaps, Secrets)
    resources: ["configmaps", "secrets"]
    resourceNames: ["kam-connector-keys", "kam-foundation-config"]  # only these two
    verbs: ["get"]                  # read one by name; cannot list or edit
---
apiVersion: rbac.authorization.k8s.io/v1
kind: RoleBinding                   # hand the badge-holder the list
metadata:
  name: ingestion-read-own-config
  namespace: kam-prod
subjects:
  - kind: ServiceAccount
    name: ingestion
    namespace: kam-prod
roleRef:
  kind: Role
  name: ingestion-read-own-config
  apiGroup: rbac.authorization.k8s.io
```

Notice `resourceNames` — the badge opens exactly two named doors, not "all
Secrets". That is least privilege made concrete.

## 5.6 How to verify RBAC is working

Kubernetes has a built‑in "can I do this?" tester. Use it to *prove* the badge
grants exactly what you intend — no more, no less.

```bash
# "auth can-i" asks: could this identity perform this action? --as impersonates it.
kubectl auth can-i get secret/kam-connector-keys \
  --namespace kam-prod \
  --as=system:serviceaccount:kam-prod:ingestion
```

- ✅ **Success looks like:** `yes`
- Now prove it *cannot* do something it should not:

```bash
kubectl auth can-i delete deployments \
  --namespace kam-prod \
  --as=system:serviceaccount:kam-prod:ingestion
```

- ✅ **Success looks like:** `no` — the badge correctly does not open that door.
- ⚠️ **Common error:** you get `yes` for the delete test. That means the badge is
  too powerful. Find the offending Role/RoleBinding and tighten the `verbs` and
  `resources`.

## 5.7 Debugging an "access denied" error, step by step

When a Pod's log shows `Forbidden`, work through this in order:

1. **Read the full message.** Kubernetes tells you the missing permission, e.g.
   `cannot get resource "secrets" in API group "" in the namespace "kam-prod"`.
2. **Find the identity.** Which ServiceAccount does the Pod use?
   ```bash
   kubectl get pod <pod-name> -n kam-prod -o jsonpath='{.spec.serviceAccountName}'
   ```
3. **Ask can‑i for the exact action** using `--as` (Section 5.6). Confirm it says
   `no`.
4. **List the badges that identity holds:**
   ```bash
   # Show every RoleBinding on this floor and who it grants to.
   kubectl get rolebindings -n kam-prod -o wide
   ```
5. **Fix the smallest thing.** Add the one missing `verb` or `resourceName` to the
   Role — never grant `*` (all verbs) to make the error go away. Re‑run can‑i to
   confirm `yes`, and re‑run the "should be no" test to confirm you did not grant
   too much.

> ✅ **Checkpoint.** You can make `kubectl auth can-i` print both a `yes` (for an
> allowed action) and a `no` (for a forbidden one) for the same ServiceAccount.

---

# Chapter 6 — ABAC (Attribute‑Based Access Control)

## 6.1 What ABAC is, and how it differs from RBAC

- **RBAC** = *"Only doctors may enter the surgery room."* The badge (role) alone
  decides.
- **ABAC** = *"Only a doctor who is **on shift**, **assigned to this patient**,
  and it is **daytime** may enter."* The decision uses several **attributes**
  together.

**ABAC (Attribute‑Based Access Control) makes decisions from attributes of the
user, the data, and the context** — not from a role name alone. In KAM this is
enforced **inside the application** (the `foundation-api`), because the questions
are about *data*, not about *Kubernetes objects*.

## 6.2 When to use ABAC vs RBAC in this project

| Question | Handled by | Where |
|---|---|---|
| "May the ingestion Pod read this Secret?" | **RBAC** | Kubernetes |
| "May this analyst see a `SECRET`‑classified record?" | **ABAC** | Application (`security/policy.py`) |
| "May this user export data outside their own tenant?" | **ABAC** | Application |
| "Is it within this user's allowed session/time window?" | **ABAC** | Application |

Rule of thumb: **RBAC guards the infrastructure; ABAC guards the data inside it.**

## 6.3 How ABAC is implemented in KAM

The foundation API already carries a policy engine (`services/api/app/security/
policy.py`, proven by `test_policy.py`) that evaluates attributes on every
request:

- **Data classification labels** (from the OSIRIS Common Object Model). A record
  tagged `SECRET` is withheld unless the caller's clearance attribute is `SECRET`
  or higher. The API returns `403 FORBIDDEN` otherwise.
- **Tenant separation.** Each record carries a `tenant` attribute. A caller from
  tenant A cannot read tenant B's records, even with the same role.
- **Field‑level and record‑level restrictions.** Some *fields* (e.g. a source's
  raw identity) are masked even when the record is visible — "you may see the
  event, not the informant".
- **Export controls.** Producing a report or bulk export checks additional
  attributes (classification ceiling, two‑person rule for critical exports).

Because these are attributes evaluated in code, you can express rules RBAC never
could, such as: *"visible only to the owning tenant, only for `CONFIDENTIAL` and
below, and never in an export."*

## 6.4 Practical manifest examples

ABAC decisions live in the application, but two Kubernetes pieces support them:

**(a) Feed the classification default via ConfigMap** so the app knows the
baseline label to apply:

```yaml
# part of kam-foundation-config
data:
  CLASSIFICATION_DEFAULT: "UNCLASSIFIED"   # records default to the lowest label
  DEFAULT_TIMEZONE: "Europe/Istanbul"      # attributes like "is it daytime" use this
```

**(b) Enforce tenant isolation at the network layer too** (defence in depth), so
that even a bug in the app cannot let a Pod reach another tenant's database. This
is a NetworkPolicy (Chapter 10) — RBAC and ABAC on their own are never the only
wall.

> **Design note.** Security must live on **both** the front end and the back end.
> The web app may hide a button, but the API re‑checks every attribute on every
> call. A hidden button is a convenience; the API's `403` is the real control.

> ✅ **Checkpoint.** You can state the difference: *RBAC uses the role; ABAC also
> uses attributes like classification, tenant, and time — and in KAM it is
> enforced in the API, not in Kubernetes.*

---

# Chapter 7 — Deployments & Services

## 7.1 What a Deployment is

**A Deployment is a job posting that says "I always need N people doing this
task".** You do not hire each worker by hand; you post "I need 2 API workers",
and Kubernetes keeps 2 healthy Pods running, replacing any that fail.

## 7.2 What a Service is

**A Service is a reception desk that always knows where to find any worker.**
Pods come and go (a crashed Pod is replaced by a new one with a new address). If
the web app had to memorise each Pod's address, it would break constantly.
Instead it asks the *reception desk* — a Service with a stable name like
`foundation-api` — and the desk routes the call to a healthy Pod. The caller
never learns or cares which Pod answered.

```
   osiris-web Pod ──"call foundation-api"──▶ [ Service: foundation-api ]
                                                     │ routes to a healthy Pod
                                          ┌──────────┴──────────┐
                                     api Pod #1            api Pod #2
```

## 7.3 The real foundation‑api Deployment, line by line  [LIVE TODAY]

This is the actual manifest from `infra/kubernetes/base/api-deployment.yaml`,
annotated:

```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: foundation-api
  namespace: kam
spec:
  replicas: 2                       # "always keep 2 workers on duty"
  selector:
    matchLabels: { app: foundation-api }   # which Pods this Deployment owns
  template:
    metadata:
      labels: { app: foundation-api }      # the label stamped on each Pod
    spec:
      serviceAccountName: foundation-api   # the ID card (Chapter 5)
      automountServiceAccountToken: false  # do not hand it Kubernetes powers
      securityContext:
        seccompProfile: { type: RuntimeDefault }  # restrict risky syscalls
      containers:
        - name: api
          image: registry.invalid/kam/foundation-api:0.1.0  # the sealed box to run
          ports: [{ name: http, containerPort: 8000 }]      # the app listens here
          envFrom: [{ configMapRef: { name: kam-foundation-config } }]  # notice board
          env:
            - name: OIDC_ISSUER            # one sensitive value, from the safe
              valueFrom: { secretKeyRef: { name: kam-foundation-secrets, key: oidc-issuer } }
          volumeMounts:
            - { name: audit-key, mountPath: /run/secrets, readOnly: true }
          resources:
            requests: { cpu: 200m, memory: 256Mi }   # what it reserves (see 7.5)
            limits:   { cpu: "1",  memory: 1Gi }      # its hard ceiling
          securityContext:
            allowPrivilegeEscalation: false   # cannot gain root mid-run
            readOnlyRootFilesystem: true      # cannot write to its own image
            runAsNonRoot: true                # refuses to run as root
            runAsUser: 10001                  # runs as an unprivileged user id
            capabilities: { drop: ["ALL"] }   # gives up every Linux superpower
          livenessProbe:                      # "are you alive?" (see 7.4)
            httpGet: { path: /health, port: http }
            periodSeconds: 15
          readinessProbe:                     # "are you ready for traffic?"
            httpGet: { path: /ready, port: http }
            periodSeconds: 10
```

The matching **Service** gives it a stable reception‑desk name:

```yaml
apiVersion: v1
kind: Service
metadata:
  name: foundation-api
  namespace: kam
spec:
  selector: { app: foundation-api }   # send traffic to Pods with this label
  ports:
    - { name: http, port: 8000, targetPort: http }
```

## 7.4 Health checks: /health and /ready

Two probes, two different questions:

- **livenessProbe → `/health`** asks *"Are you alive?"* If it fails repeatedly,
  Kubernetes concludes the Pod is stuck and **restarts** it. `/health` checks only
  that the process itself is running.
- **readinessProbe → `/ready`** asks *"Are you ready to serve requests?"* If it
  fails, Kubernetes stops sending traffic to that Pod **without** killing it —
  useful while the Pod is still connecting to the database or IAM. In KAM,
  `/ready` reports the health of the database, the audit key, and the Institution
  IAM separately, and returns HTTP `503` if any dependency is down.

The analogy: **liveness** is "is the receptionist breathing?"; **readiness** is
"is the receptionist ready to take calls, or still setting up their desk?"

## 7.5 Resource requests and limits

- A **request** is *"reserve a table for 4"* — Kubernetes guarantees the Pod at
  least this much CPU/memory and uses it to decide which node has room.
- A **limit** is the hard ceiling — *"the restaurant can seat you at a 6‑top if
  it is free, but never more."* Exceed the memory limit and the Pod is killed
  (`OOMKilled`, Chapter 14 problem 9).

`requests: cpu 200m` means "0.2 of one CPU core reserved". `limits: memory 1Gi`
means "never use more than 1 gibibyte, or be terminated". Requests too high waste
capacity; limits too low cause crashes. Start from the real manifest's values and
adjust using observed usage (Chapter 12).

## 7.6 Deployment manifests for each project service

- `foundation-api` and `osiris-web` — **[LIVE TODAY]**, in
  `infra/kubernetes/base/`.
- `ingestion`, `fusion`, `analytics`, `ai`, `media-processing`, `alerting`,
  `reporting`, `archive` — **[PLANNED]**. Each will follow the *same shape* as
  `foundation-api` above: 2+ replicas, a no‑power ServiceAccount, the hardened
  `securityContext`, resource requests/limits, and `/health` + `/ready` probes.
  Do **not** deploy a manifest for one of these until its image exists, or you
  will get `ImagePullBackOff` (Chapter 14, problem 7).

> ✅ **Checkpoint.**
> `kubectl get deployment foundation-api -n kam` shows `READY 2/2`.
> `kubectl get service foundation-api -n kam` shows a `ClusterIP` and port `8000`.

---

# Chapter 8 — Persistent Storage

## 8.1 Why a database cannot live inside a Pod

A Pod is like **a whiteboard that gets wiped every night.** Pods are designed to
be disposable — Kubernetes deletes and recreates them freely. Anything written to
a Pod's own disk vanishes when the Pod is replaced. A database that lost all its
data every time it restarted would be useless. So the data must live *outside*
the Pod, on storage that survives.

## 8.2 PersistentVolume and PersistentVolumeClaim

- A **PersistentVolume (PV)** is *an actual filing cabinet* that exists in the
  building independently of any worker.
- A **PersistentVolumeClaim (PVC)** is *a request slip*: "I need a 20 GB cabinet."
  Kubernetes matches your slip to a real cabinet and reserves it for your Pod.

Your Pod references the *claim*, not the physical disk — so if the Pod is
replaced, the new Pod attaches to the same cabinet and the data is all still
there.

```yaml
apiVersion: v1
kind: PersistentVolumeClaim
metadata:
  name: postgres-data
  namespace: kam
spec:
  accessModes: ["ReadWriteOnce"]   # one node mounts it read-write at a time
  resources:
    requests:
      storage: 20Gi                # "I need a 20 GB cabinet"
  storageClassName: standard       # which kind of disk (cluster-specific)
```

## 8.3 Storage for each data system

| System | What it stores | Storage need | Status |
|---|---|---|---|
| **PostgreSQL + PostGIS** | The system of record: entities, planning, audit; PostGIS adds map geometry. | A PVC, backed up nightly. | LIVE TODAY (foundation) |
| **Redis** | Fast temporary cache and queues. | Small PVC, or memory‑only if it is purely a cache. | PLANNED — Phase 2 |
| **MinIO / Ceph** | Big files: raw captures, media, reports (object storage). | Large PVCs or a dedicated storage cluster. | PLANNED — Phase 2/5 |
| **OpenSearch** | The search index for full‑text/semantic search. | Multiple PVCs (one per node). | PLANNED — Phase 5 |
| **Apache Kafka** | The pipeline that moves events between services. | A PVC per broker, sized for retention. | PLANNED — Phase 2 |

> **StatefulSet, not Deployment, for databases.** Databases use a *StatefulSet* —
> the cousin of a Deployment that gives each Pod a **stable name and its own
> cabinet** (`postgres-0`, `postgres-1`), so replica 0 always reattaches to
> replica 0's data. That distinction matters once you run more than one database
> Pod.

## 8.4 Backup verification commands

A backup you have never restored is not a backup — it is a hope. Verify it.

```bash
# Take a logical backup of the database from inside its Pod.
# "pg_dump" exports the whole database as a file you can restore elsewhere.
kubectl exec -n kam postgres-0 -- \
  pg_dump -U kam_app kam > kam-backup-$(printf '%(%Y%m%d)T').sql
```

- ✅ **Success looks like:** a `.sql` file of non‑trivial size (kilobytes or more).
- ⚠️ **Common error:** `0 bytes` file or `permission denied` → the user name is
  wrong, or the Pod name is not `postgres-0`. Check with
  `kubectl get pods -n kam`.

Then **prove the backup restores** into a throwaway database (never into
production):

```bash
# Create a scratch database and load the backup into it to confirm it is valid.
kubectl exec -n kam postgres-0 -- createdb -U kam_app restore_check
kubectl exec -i -n kam postgres-0 -- psql -U kam_app restore_check < kam-backup-*.sql
```

- ✅ **Success looks like:** a stream of `CREATE TABLE` / `COPY` lines and no
  `ERROR:` lines.

> ✅ **Checkpoint.** You have a `.sql` backup file **and** you have loaded it into
> a scratch database with no errors. Only now is the backup trustworthy.

---

# Chapter 9 — Helm Charts

## 9.1 What Helm is

**Helm is a recipe book for Kubernetes.** Deploying KAM by hand means applying
many manifests in the right order with the right values. A Helm *chart* is a
single recipe that installs them all correctly, and lets you change a few
ingredients (image tag, replica count, hostnames) per environment without editing
the underlying manifests.

## 9.2 How this project's chart is structured  [PLANNED — Phase 6]

The chart lives (will live) under `infra/helm/kam-multi-int/`:

```
infra/helm/kam-multi-int/
├── Chart.yaml            # the recipe's name and version
├── values.yaml           # default ingredients (image tags, replicas, resources)
├── values-dev.yaml       # overrides for the workshop floor
├── values-staging.yaml   # overrides for pre-production
├── values-prod.yaml      # overrides for the live floor
└── templates/            # the manifests, with {{ placeholders }} for values
    ├── api-deployment.yaml
    ├── api-service.yaml
    ├── web-deployment.yaml
    ├── configmap.yaml
    ├── network-policies.yaml
    └── ...
```

> **Today:** the repository ships plain Kustomize manifests
> (`infra/kubernetes/base` + `overlays/production`). Kustomize is a lighter
> alternative to Helm that patches YAML without templating. The Helm chart is the
> Phase 6 packaging target. You can deploy today with Kustomize (Chapter 12 of
> the existing quick‑start guide) and adopt Helm later.

## 9.3 Installing the full platform with one command

```bash
# "helm install" runs the recipe: NAME is what you call this installation,
# CHART is the recipe folder, -n is the namespace, -f picks the environment file.
helm install kam ./infra/helm/kam-multi-int \
  --namespace kam-prod \
  --create-namespace \
  -f ./infra/helm/kam-multi-int/values-prod.yaml
```

- ✅ **Success looks like:** `STATUS: deployed` and a `REVISION: 1` line.
- ⚠️ **Common error:** `cannot re-use a name that is still in use` → an install
  named `kam` already exists. Use `helm upgrade` (next section) instead of
  `install`.

## 9.4 Customising values per environment

You do not copy the chart per environment; you supply a different values file:

```bash
# Dev: fewer replicas, relaxed resources.
helm install kam ./infra/helm/kam-multi-int -n kam-dev -f values-dev.yaml
# Prod: more replicas, strict resources, real hostnames.
helm install kam ./infra/helm/kam-multi-int -n kam-prod -f values-prod.yaml
```

A `values-dev.yaml` might contain nothing more than:

```yaml
api:
  replicas: 1            # one worker is enough in the workshop
web:
  replicas: 1
resources:
  requests: { cpu: 100m, memory: 128Mi }   # smaller reservations
```

## 9.5 Upgrade and rollback a release

```bash
# Upgrade: apply the recipe again, e.g. after bumping the image tag in values.
helm upgrade kam ./infra/helm/kam-multi-int -n kam-prod -f values-prod.yaml
```

- ✅ **Success looks like:** `STATUS: deployed`, `REVISION: 2`.

```bash
# See the history of this installation.
helm history kam -n kam-prod
# Roll back to the previous, known-good revision if the new one misbehaves.
helm rollback kam 1 -n kam-prod
```

- ✅ **Success looks like:** `Rollback was a success! Happy Helming!`
- ⚠️ **Common error:** `release: not found` → wrong name or wrong namespace.
  Confirm with `helm list -n kam-prod`.

> ✅ **Checkpoint.** `helm list -n kam-prod` shows one release named `kam` with
> status `deployed`.

---

# Chapter 10 — Networking & Ingress

## 10.1 What Ingress is

**Ingress is the building's front door that routes visitors to the right floor.**
Outside users type one address (e.g. `https://kam.internal`); the Ingress
receives them, checks the path or hostname, and forwards each to the correct
internal Service. Without Ingress, every Service would need its own external
address — chaotic and hard to secure.

```
  Analyst's browser ──▶ https://kam.internal
                              │  [ Ingress: the front door ]
                    ┌─────────┴─────────┐
             /  → osiris-web        /api → foundation-api
```

```yaml
apiVersion: networking.k8s.io/v1
kind: Ingress
metadata:
  name: kam
  namespace: kam-prod
  annotations:
    nginx.ingress.kubernetes.io/ssl-redirect: "true"   # force HTTPS
spec:
  tls:
    - hosts: ["kam.internal"]
      secretName: kam-tls          # the certificate lives in a Secret
  rules:
    - host: kam.internal
      http:
        paths:
          - path: /api
            pathType: Prefix
            backend: { service: { name: foundation-api, port: { number: 8000 } } }
          - path: /
            pathType: Prefix
            backend: { service: { name: osiris-web, port: { number: 3000 } } }
```

## 10.2 TLS termination

**TLS** is the lock that turns `http` into `https` — it encrypts traffic so
nobody between the browser and the server can read it. **Termination** means the
Ingress is where that lock is opened: the Ingress holds the certificate (in the
`kam-tls` Secret) and decrypts incoming traffic, then forwards it inward. The
specification requires **TLS 1.3** at the Institution's ingress (ADR‑004).

The certificate is stored as a special Secret:

```bash
# Create a TLS secret from a certificate file and its private key.
kubectl create secret tls kam-tls \
  --namespace kam-prod \
  --cert=./certs/kam.crt \
  --key=./certs/kam.key
```

- ⚠️ **Common error:** browsers warn "certificate expired". Certificates have an
  expiry date; see Chapter 14, problem 10.

## 10.3 Internal service communication (mTLS)

Normal TLS proves the *server's* identity to the *client*. **mTLS (mutual TLS)**
proves **both** identities to each other — like two people **each showing ID
before talking**, not one side only. In KAM, mTLS between services means a rogue Pod
cannot impersonate `foundation-api` even from inside the cluster. This is
typically provided by a *service mesh* (e.g. Linkerd/Istio) or the Institution's
PKI sidecar (ADR‑004), so your application code does not change.

## 10.4 NetworkPolicies: who may talk to whom

**A NetworkPolicy is a rule about which Pods may open a connection to which other
Pods** — like an office rule that says "only the mailroom may enter the archive".
KAM starts from **default‑deny**: nothing may talk to anything until explicitly
allowed. This is the real policy from `infra/kubernetes/base/network-policies.yaml`:

```yaml
apiVersion: networking.k8s.io/v1
kind: NetworkPolicy
metadata:
  name: default-deny
  namespace: kam
spec:
  podSelector: {}                 # applies to EVERY Pod on this floor
  policyTypes: [Ingress, Egress]  # block both incoming and outgoing by default
```

Then narrow allowances are added, for example "the API may receive traffic only
from the web app, and may reach only DNS, Postgres, and the IAM":

```yaml
apiVersion: networking.k8s.io/v1
kind: NetworkPolicy
metadata:
  name: foundation-api-allow
  namespace: kam
spec:
  podSelector: { matchLabels: { app: foundation-api } }
  policyTypes: [Ingress, Egress]
  ingress:
    - from: [{ podSelector: { matchLabels: { app: osiris-web } } }]  # only the web app
      ports: [{ protocol: TCP, port: 8000 }]
  egress:
    - to: [{ podSelector: { matchLabels: { app: postgres } } }]       # only the database
      ports: [{ protocol: TCP, port: 5432 }]
    - to: [{ namespaceSelector: { matchLabels: { kubernetes.io/metadata.name: institution-iam } } }]
      ports: [{ protocol: TCP, port: 443 }]                           # only the IAM
```

> **Air‑gapped SPYS profile (ADR‑003).** In the `kam-spys-airgap` deployment, the
> egress rules contain **no** internet destinations at all, and the public
> connectors are disabled at build time and run time. The default‑deny policy is
> what makes "this system physically cannot phone home" enforceable, not merely a
> promise.

> ✅ **Checkpoint.**
> `kubectl get networkpolicy -n kam` lists `default-deny` and the per‑service
> allow rules. If `default-deny` is missing, every Pod is wide open — add it first.

---

# Chapter 11 — High Availability & Scaling

## 11.1 What "high availability" means

**High availability means the desk is never unmanned.** Put *two* receptionists
at the desk; if one steps away, the other keeps serving. In Kubernetes terms:
run **more than one Pod** of each critical service, spread across **different
machines**, so the loss of any single Pod or machine does not take the service
down. The KAM target is **≥ 99.9 %** uptime (OSIRIS §18) — about 43 minutes of
allowed downtime per month.

## 11.2 Setting replica counts per service

```bash
# "scale" changes how many Pods a Deployment keeps running.
kubectl scale deployment foundation-api --replicas=3 -n kam-prod
```

- ✅ **Success looks like:** `deployment.apps/foundation-api scaled`, then
  `kubectl get deployment foundation-api -n kam-prod` shows `READY 3/3`.

A **PodDisruptionBudget (PDB)** protects availability during maintenance — it
tells Kubernetes "never voluntarily take down so many Pods that fewer than N
remain". The repo already ships `infra/kubernetes/base/api-pdb.yaml`:

```yaml
apiVersion: policy/v1
kind: PodDisruptionBudget
metadata: { name: foundation-api, namespace: kam }
spec:
  minAvailable: 1                              # keep at least 1 during drains
  selector: { matchLabels: { app: foundation-api } }
```

## 11.3 HorizontalPodAutoscaler: auto‑scaling

**A HorizontalPodAutoscaler (HPA) hires and lays off workers based on how busy
they are** — more Pods when CPU is high, fewer when it is quiet. The repo ships
`infra/kubernetes/base/api-hpa.yaml`:

```yaml
apiVersion: autoscaling/v2
kind: HorizontalPodAutoscaler
metadata: { name: foundation-api, namespace: kam }
spec:
  scaleTargetRef: { apiVersion: apps/v1, kind: Deployment, name: foundation-api }
  minReplicas: 2                    # never fewer than 2 (availability floor)
  maxReplicas: 8                    # never more than 8 (cost ceiling)
  metrics:
    - type: Resource
      resource:
        name: cpu
        target: { type: Utilization, averageUtilization: 70 }  # aim for 70% CPU
```

- **What it does:** if average CPU across the API Pods rises above 70 %, the HPA
  adds Pods (up to 8); when it falls, it removes them (down to 2).

```bash
# Watch the autoscaler's live decisions.
kubectl get hpa -n kam-prod -w
```

- ✅ **Success looks like:** a row showing `TARGETS 35%/70%`, `REPLICAS 2`.
- ⚠️ **Common error:** `TARGETS <unknown>/70%`. The HPA cannot read CPU because
  the **metrics‑server** add‑on is not installed. Install it, or the HPA is
  blind.

## 11.4 What happens when a Pod crashes (self‑healing)

You can watch the hotel manager at work. Delete a Pod and see it come back:

```bash
# Delete one API Pod on purpose to simulate a crash.
kubectl delete pod <one-foundation-api-pod> -n kam-prod
# Immediately list Pods and watch a replacement appear.
kubectl get pods -n kam-prod -w
```

- ✅ **Success looks like:** the deleted Pod shows `Terminating`, and within
  seconds a brand‑new Pod appears in `ContainerCreating` → `Running`. Your
  replica count returns to its target with no action from you. **That is
  self‑healing.**

> ✅ **Checkpoint.** After deleting a Pod, `kubectl get deployment foundation-api
> -n kam-prod` returns to `READY 2/2` (or 3/3) on its own.

---

# Chapter 12 — Observability

## 12.1 What observability means

**Observability is the hospital's vital‑signs monitor.** You want to know the
patient's heart rate is dropping *before* they crash, not after. For KAM it means
three streams of information:

- **Metrics** — numbers over time (requests per second, CPU, queue depth).
- **Logs** — the text each service writes about what it is doing.
- **Traces** — the path a single request took through several services.

## 12.2 Deploying Prometheus, Grafana, and Loki

- **Prometheus** = the *machine that reads the vital signs* (collects metrics).
- **Grafana** = the *screen on the wall that draws the graphs* (dashboards).
- **Loki** = the *filing system for logs* so you can search them.

The quickest correct way to install all three is the community Helm chart:

```bash
# Add the chart repository (the recipe source) and update the local index.
helm repo add prometheus-community https://prometheus-community.github.io/helm-charts
helm repo update
# Install the full metrics + dashboards stack into a dedicated namespace.
helm install monitoring prometheus-community/kube-prometheus-stack \
  --namespace monitoring --create-namespace
```

- ✅ **Success looks like:** `STATUS: deployed`, then several `Running` Pods in
  the `monitoring` namespace after a minute or two.
- ⚠️ **Common error:** Pods stuck `Pending` → the cluster lacks CPU/memory for the
  stack, or storage is unavailable (Chapter 14, problems 1 and 5).

KAM already emits telemetry to an **OpenTelemetry Collector**
(`infra/observability/otel-collector.yaml`, and `OTEL_EXPORTER_OTLP_ENDPOINT` in
config), which forwards metrics and traces to Prometheus. The `foundation-api`
exposes Prometheus metrics when `PROMETHEUS_METRICS_ENABLED=true`.

## 12.3 How to view logs for any service

```bash
# "logs" prints what a Pod has written. --tail limits to recent lines.
kubectl logs deployment/foundation-api -n kam-prod --tail=100
# Add -f to "follow" — stream new lines live as they appear.
kubectl logs deployment/foundation-api -n kam-prod -f
```

- ✅ **Success looks like:** structured log lines (JSON), each with a timestamp.
- ⚠️ **Common error:** `previous terminated container ... not found` when you add
  `--previous`. That flag only works if the Pod has crashed at least once; on a
  healthy Pod there is no "previous" instance.

## 12.4 Setting up the alerts defined in the OSIRIS spec

**Alertmanager** (installed with the stack above) sends a notification when a
metric crosses a line. The OSIRIS spec (§19) calls for alerts such as: ingestion
queue backing up, error rate rising, disk filling, and the early‑warning **≤ 3‑
minute** alert SLA (§10, F‑017). A rule looks like:

```yaml
groups:
  - name: kam-availability
    rules:
      - alert: ApiHighErrorRate
        expr: rate(http_requests_total{status=~"5.."}[5m]) > 0.05  # >5% errors
        for: 10m                                                    # sustained 10 min
        labels: { severity: critical }
        annotations:
          summary: "foundation-api error rate above 5% for 10 minutes"
```

> **Design requirement.** A **critical early‑warning alert may never be closed by
> the AI** (F‑017) — only a human may acknowledge it. Wire Alertmanager to email
> and to the SIEM, never to an automated silencer.

> ✅ **Checkpoint.** Port‑forward Grafana and open it:
> ```bash
> kubectl port-forward -n monitoring svc/monitoring-grafana 3000:80
> ```
> Then browse to `http://localhost:3000`. You should see the login page and, after
> logging in, dashboards listing your cluster's CPU and memory.

---

# Chapter 13 — Deploying to Air‑Gapped / Offline Environments

## 13.1 What "air‑gapped" means and why KAM supports it

**Air‑gapped means there is a literal gap of air between this network and the
internet** — no cable, no Wi‑Fi, no route out. The SPYS profile requires this
(ADR‑003, SPYS §3.1.7): the system must run with **zero** connection to the
public internet. That changes how you deploy, because you cannot download
anything at deploy time — everything must be carried in.

## 13.2 Packaging all images for offline transfer

On an **internet‑connected** build machine, pull every image and save them to a
single file:

```bash
# Pull each image you will need (foundation-api, web, postgres, etc.).
docker pull registry.invalid/kam/foundation-api:0.1.0
docker pull postgres:16
# "docker save" writes one or more images to a single tar archive you can carry.
docker save \
  registry.invalid/kam/foundation-api:0.1.0 \
  postgres:16 \
  -o kam-images-0.1.0.tar
```

- ✅ **Success looks like:** a `kam-images-0.1.0.tar` file, typically hundreds of
  megabytes to a few gigabytes.

Then compute a checksum so the offline side can verify nothing was altered in
transit:

```bash
# A checksum is a fingerprint of the file. If one byte changes, the fingerprint changes.
shasum -a 256 kam-images-0.1.0.tar > kam-images-0.1.0.tar.sha256
```

Copy both files onto approved removable media, following your organisation's
transfer procedure.

## 13.3 Loading images on the isolated network

On the **air‑gapped** side, first verify the fingerprint, then load:

```bash
# Verify the file is byte-for-byte the one that was exported.
shasum -a 256 -c kam-images-0.1.0.tar.sha256
```

- ✅ **Success looks like:** `kam-images-0.1.0.tar: OK`
- ⚠️ **If it says `FAILED`:** the file was corrupted or altered. Do **not** load
  it. Re‑transfer from the source.

```bash
# "docker load" imports the images from the tar back into a local registry/daemon.
docker load -i kam-images-0.1.0.tar
```

Then push them into the **internal** registry that the air‑gapped cluster uses,
and set the image references in your manifests/values to that internal registry.

## 13.4 Offline update package creation and verification

Updates follow the same discipline, plus a **signature**. Sign the package on the
build side (`cosign`), verify the signature on the offline side before applying,
and keep the previous version staged so you can roll back (Chapter 9.5) if the
new one fails its smoke test. Never apply an unsigned or unverified bundle to the
SPYS profile — the pipeline requirement (F‑030) is explicit that a broken or
unsigned release must be rejected and rolled back automatically.

> ✅ **Checkpoint.** On the offline side, `shasum -a 256 -c` prints `OK` **and**
> `docker images` lists the KAM images. Only then proceed to deploy.

---

# Chapter 14 — Common Problems & How to Fix Them

For each, the pattern is the same: **look, understand, then act** — never restart
blindly.

### 1. Pod stuck in `Pending`

- **Look:** `kubectl describe pod <name> -n kam` → read the `Events:` at the
  bottom.
- **Understand:** `Pending` means Kubernetes cannot place the Pod. Usual causes:
  no node has enough CPU/memory (`Insufficient cpu`), or a PVC is unbound
  (`pod has unbound immediate PersistentVolumeClaims`).
- **Fix:** free/add cluster capacity, lower the Pod's `requests`, or fix the PVC
  (problem 5).

### 2. Pod in `CrashLoopBackOff`

- **Look:** `kubectl logs <name> -n kam --previous` → the error from the crash.
- **Understand:** the container starts, fails, and Kubernetes keeps restarting it
  with growing delay. Usual causes: a missing/wrong secret value, database
  unreachable, or a bad config.
- **Fix:** correct the underlying cause (often problem 4), then the loop clears on
  its own or after a `rollout restart`.

### 3. A Service cannot reach another Service

- **Look:** from inside a Pod,
  `kubectl exec -it <web-pod> -n kam -- wget -qO- http://foundation-api:8000/health`.
- **Understand:** either the target Service name/port is wrong, or a
  NetworkPolicy is blocking the connection.
- **Fix:** confirm the Service exists (`kubectl get svc -n kam`); confirm a
  NetworkPolicy allows this exact source→target→port (Chapter 10). Default‑deny
  blocks everything you did not explicitly allow.

### 4. Secret value is wrong or missing

- **Look:** `kubectl describe pod <name> -n kam` → an event like
  `secret "kam-foundation-secrets" not found` or `couldn't find key oidc-issuer`.
- **Understand:** the Deployment points at a Secret/key that does not exist.
- **Fix:** create the Secret with the exact name and keys (Chapter 3). Key names
  must match **exactly** — `oidc-issuer` ≠ `oidc_issuer`.

### 5. PersistentVolumeClaim not bound

- **Look:** `kubectl get pvc -n kam` → `STATUS Pending`.
- **Understand:** no PersistentVolume matches the claim (wrong `storageClassName`,
  or the cluster has no dynamic provisioner).
- **Fix:** set a `storageClassName` your cluster offers
  (`kubectl get storageclass`), or have an admin provision a PV.

### 6. Deployment rollout is stuck

- **Look:** `kubectl rollout status deployment/foundation-api -n kam`.
- **Understand:** new Pods are not becoming Ready, so the old ones are kept
  (this is safe — no downtime). Usually the new Pods are failing readiness
  (problem 8's readiness variants) or crashing (problem 2).
- **Fix:** diagnose the new Pods; if the new image is bad,
  `kubectl rollout undo deployment/foundation-api -n kam` returns to the last
  working version.

### 7. `ImagePullBackOff`

- **Look:** `kubectl describe pod <name> -n kam` → `Failed to pull image ...`.
- **Understand:** the cluster cannot fetch the image — wrong name/tag, missing
  registry login, or (very common here) **the image does not exist yet** because
  the service is a PLANNED phase.
- **Fix:** correct the tag; add a registry pull Secret (Chapter 3); or do not
  deploy a service whose image has not been built.

### 8. RBAC `Forbidden`

- **Look:** the Pod log names the missing permission.
- **Understand:** the ServiceAccount's Role does not allow that action.
- **Fix:** follow Chapter 5.7 exactly. Add the **one** missing verb/resource;
  re‑verify with `kubectl auth can-i`. Do not grant `*`.

### 9. `OOMKilled` (out of memory)

- **Look:** `kubectl describe pod <name> -n kam` → `Last State: Terminated,
  Reason: OOMKilled`.
- **Understand:** the container exceeded its memory **limit** and was killed
  (Chapter 7.5).
- **Fix:** raise the memory `limit` if the usage is legitimate, or fix the memory
  leak. Check real usage with `kubectl top pod <name> -n kam` (needs
  metrics‑server).

### 10. Certificate expiry causing TLS errors

- **Look:** the browser says "certificate expired", or
  `kubectl get secret kam-tls -n kam-prod -o jsonpath='{.data.tls\.crt}' | base64
  -d | openssl x509 -noout -enddate` shows a past date.
- **Understand:** every TLS certificate has an expiry; an expired one breaks
  HTTPS.
- **Fix:** issue a new certificate and update the `kam-tls` Secret (Chapter 10.2),
  then restart the Ingress controller if needed. Better: automate renewal with
  `cert-manager` so this never surprises you.

---

# Chapter 15 — Security Checklist Before Going Live

Run through **every** item before each production deployment. It maps to OSIRIS
§16 and SPYS §3.2.12–§3.2.16. Do not tick a box you have not personally verified.

1. **No secrets in code or images.** `git log -p` shows no keys; the image has no
   baked‑in credentials; all secrets come from Secrets/OpenBao at runtime.
2. **Authentication enforced.** `AUTH_REQUIRED=true`; every protected API route
   returns `401` without a valid token. Verified, not assumed.
3. **Institution IAM is the only identity authority** (ADR‑002). No local
   password table exists. Login lockout and session timeout are delegated to the
   IAM.
4. **MFA required** where the IAM enforces it; requests without the MFA claim get
   `403 MFA_REQUIRED`.
5. **RBAC least privilege.** Every ServiceAccount passes a "can‑i delete/modify"
   test with `no`. No wildcard (`*`) verbs. Tokens not mounted where unused.
6. **ABAC enforced server‑side.** Classification, tenant, field/record masking,
   and export controls are re‑checked in the API — never only in the UI.
7. **TLS 1.3 at ingress; mTLS internally** where a mesh/PKI is present (ADR‑004).
   No plaintext HTTP reaches a Pod.
8. **Default‑deny NetworkPolicy in place** in every namespace; only the required
   flows are opened. For SPYS, **zero** internet egress.
9. **Encryption at rest** for the database and object storage; keys from
   HSM/KMS/OpenBao; approved algorithms only (AES‑256‑GCM). MD5/DES are rejected.
10. **Audit trail is on and tamper‑evident.** Every create/update/approve/delete/
    export writes a hash‑chained record with user, IP, device, timestamp, and
    result; retained ≥ 5 years; forwarded to SIEM.
11. **Time discipline.** Storage in UTC, display in `Europe/Istanbul` (GMT+3),
    per ADR‑009.
12. **Synthetic data is labelled.** Every demo/seed record carries
    `is_synthetic=true` and a visible `SENTETİK`/SYNTHETIC marker in both UI and
    records. No real personal/operational data in seeds.
13. **Connectors without keys show `CONFIGURATION_REQUIRED`**, never a fake‑live
    state.
14. **No unsafe guidance language.** GNSS output says *probable accuracy
    degradation/anomaly*, never *confirmed jamming*. No definitive bot/troll
    verdicts.
15. **Pod hardening.** `runAsNonRoot`, `readOnlyRootFilesystem`,
    `allowPrivilegeEscalation: false`, `capabilities: drop [ALL]`, seccomp
    `RuntimeDefault`, and the namespace `restricted` label — all present.
16. **Resource limits set** on every container, so one Pod cannot starve the node.
17. **Health and readiness probes** defined for every service; `/ready` reports
    real dependency health.
18. **Backups verified by restore** (Chapter 8.4), not merely taken. DR RPO/RTO
    measured.
19. **Images signed and scanned;** SBOM produced; critical vulnerabilities block
    promotion (F‑030). Floating `latest` tags are forbidden — pin digests.
20. **Independent security test passed** (TÜBİTAK BİLGEM A‑class or equivalent,
    SPYS §3.1.13); all findings closed before acceptance.

> ✅ **Final checkpoint.** If any item above is not personally verified as done,
> the deployment is **not** ready for production. An unchecked box is a decision
> to accept a known risk — make that decision consciously, in writing, or fix it.

---

# Appendix A — Glossary

Every term, one plain sentence with an everyday analogy.

| Term | Plain meaning (analogy) |
|---|---|
| **Cluster** | The whole building of machines Kubernetes manages. |
| **Node** | One machine (one floor's worth of rooms) in the cluster. |
| **kubectl** | The remote control you point at the cluster. |
| **Pod** | One running copy of a service — a single worker on duty. |
| **Container** | The sealed box (image) a worker runs inside. |
| **Image** | The shipping container Docker packs: program + everything it needs. |
| **Deployment** | A standing order: "always keep N workers on duty." |
| **ReplicaSet** | The Deployment's helper that actually keeps the count of Pods. |
| **StatefulSet** | Like a Deployment, but each worker keeps its own filing cabinet and stable name (for databases). |
| **Service** | The reception desk with a stable name that finds a healthy Pod. |
| **Namespace** | A floor in the building; walls off one environment from another. |
| **ConfigMap** | The public notice board of non‑secret settings. |
| **Secret** | The sealed envelope / locked safe for passwords and keys. |
| **Volume / PersistentVolume** | A filing cabinet that survives when a Pod is replaced. |
| **PersistentVolumeClaim** | A request slip for a filing cabinet of a given size. |
| **Ingress** | The building's front door that routes visitors to the right floor. |
| **NetworkPolicy** | A rule about which Pods may talk to which; KAM defaults to "deny all". |
| **ServiceAccount** | The ID card a service carries. |
| **Role** | A list of allowed actions, valid on one floor. |
| **ClusterRole** | The same list, but building‑wide. |
| **RoleBinding** | Handing an ID‑card holder a list of allowed actions. |
| **RBAC** | The badge system: your role decides what doors open. |
| **ABAC** | Access decided by attributes (role **and** classification, tenant, time). |
| **HPA (HorizontalPodAutoscaler)** | Hires/lays off workers based on how busy they are. |
| **PDB (PodDisruptionBudget)** | "Never take down so many that the desk goes unmanned." |
| **livenessProbe** | "Are you alive?" — fail and Kubernetes restarts the Pod. |
| **readinessProbe** | "Are you ready for calls?" — fail and traffic is withheld. |
| **request / limit** | Reserved amount / hard ceiling of CPU and memory. |
| **Helm** | A recipe book that installs many manifests as one release. |
| **Kustomize** | A lighter way to patch YAML per environment, without templating. |
| **TLS** | The lock that makes traffic `https`; TLS 1.3 is the required version. |
| **mTLS** | Both sides show ID before talking. |
| **OpenBao / Vault** | A real bank vault for secrets, with an access log and rotation. |
| **SIEM** | The central security log collector, kept for years. |
| **Air‑gapped** | A network with a literal gap of air to the internet — no route out. |
| **OOMKilled** | A container killed for exceeding its memory limit. |
| **CrashLoopBackOff** | A Pod that keeps crashing and being restarted with growing delay. |
| **ImagePullBackOff** | Kubernetes cannot fetch the image (wrong name, no login, or it does not exist). |
| **SBOM** | A "list of ingredients" for a build: every component and version inside it. |
| **DEMAT/DEMAM/DEMAV** | SPYS delivery‑tracking stages; drive the 92‑day (yellow) / 31‑day (red) notifications. |

---

# Appendix B — Quick Reference Card

The 20 kubectl commands you will use most on this project. Replace `-n kam` with
your target namespace.

```bash
# 1. List all Pods and their status.
kubectl get pods -n kam
# 2. Full detail + recent events for one Pod (your #1 debugging tool).
kubectl describe pod <pod> -n kam
# 3. Print a Pod/Deployment's recent logs.
kubectl logs deployment/foundation-api -n kam --tail=100
# 4. Stream logs live.
kubectl logs deployment/foundation-api -n kam -f
# 5. Logs from the previous (crashed) container instance.
kubectl logs <pod> -n kam --previous
# 6. List Deployments and how many Pods are Ready.
kubectl get deployment -n kam
# 7. List Services (the reception desks) and their ports.
kubectl get svc -n kam
# 8. Watch a rollout finish.
kubectl rollout status deployment/foundation-api -n kam
# 9. Undo a bad rollout (back to the last working version).
kubectl rollout undo deployment/foundation-api -n kam
# 10. Restart Pods gradually (e.g. after a config/secret change).
kubectl rollout restart deployment/foundation-api -n kam
# 11. Change replica count.
kubectl scale deployment foundation-api --replicas=3 -n kam
# 12. List namespaces (the floors).
kubectl get namespaces
# 13. Show a ConfigMap's contents.
kubectl get configmap kam-foundation-config -n kam -o yaml
# 14. Show a Secret's KEY NAMES (values are base64, never plaintext).
kubectl get secret kam-foundation-secrets -n kam -o jsonpath='{.data}'
# 15. Check PersistentVolumeClaims are Bound.
kubectl get pvc -n kam
# 16. See the autoscaler's current decision.
kubectl get hpa -n kam
# 17. Ask "can this identity do this?" (RBAC test).
kubectl auth can-i get secrets -n kam --as=system:serviceaccount:kam:ingestion
# 18. See live CPU/memory per Pod (needs metrics-server).
kubectl top pod -n kam
# 19. Run a command inside a Pod (e.g. a quick connectivity test).
kubectl exec -it <pod> -n kam -- sh
# 20. Preview manifests without applying them (dry run).
kubectl apply -k infra/kubernetes/base --dry-run=server
```

> **Keep this card next to your keyboard.** When something breaks, commands 1, 2,
> and 3 (`get pods`, `describe pod`, `logs`) answer 90 % of "what is wrong?" before
> you change anything.

---

## Where to go next

- For a fast, hands‑on deploy of *today's* foundation (api + web), see the
  companion quick‑start: `docs/deployment/KAM-KUBERNETES-BEGINNER-GUIDE.md`.
- For the architectural decisions referenced above (IAM, network separation,
  crypto, frontend), see `docs/adr/`.
- For what is built vs. planned, see
  `docs/requirements/requirements-traceability-matrix.md`.

*Take it one chapter at a time. You do not need to memorise Kubernetes — you need
to understand what each command does before you run it, and this guide is here
whenever you forget. You have got this.*
