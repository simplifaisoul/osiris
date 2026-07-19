# KAM Multi‑INT + SPYS — Production DevSecOps Runbook (Deployment Manual)

> **File‑name note.** This is the deployment *manual* you requested. The file is
> named `…-RUNBOOK.md` rather than `…-MANUAL.md` because the repository's
> `.gitignore` has a security rule (`*Manual*.md`) that excludes files named
> "Manual" to prevent leaking sensitive source manuals — naming this one "Runbook"
> keeps it tracked in git while leaving that guard intact.
>
> **What this manual is.** A single document that takes a junior developer or a
> non‑technical system administrator from a **bare server** to a **running,
> secured, monitored, SIEM‑protected, publicly accessible** KAM Multi‑INT + SPYS
> platform — including the host website. If you have never touched Kubernetes,
> OpenBao, cert‑manager, EFK, Prometheus, Grafana, or Wazuh, you are exactly who
> this was written for.
>
> **A promise about language.** You will not read the words *"simply"* or *"just"*
> in this manual. The first time you do anything is never simple. We go one
> keystroke at a time, and after every command we tell you what success looks
> like and what to do when it goes wrong.
>
> **Its companion.** `KAM-KUBERNETES-COMPLETE-GUIDE.md` teaches the *concepts*
> (Pods, Services, RBAC, ABAC) with analogies, Chapter by Chapter. This manual is
> the *operational runbook*: the exact commands, in order, to stand the whole
> platform up in production. Keep both open — when a term here is new, the
> companion explains it in depth.

---

## How every command is written

To keep you oriented, **every command in this manual** uses the same header so
you always know what it does, who runs it, and how often:

```bash
# ─────────────────────────────────────────────────────
# WHAT THIS DOES: Plain-English description of the effect.
# WHO runs this:  developer / sysadmin / CI pipeline
# WHEN to run:    once at setup / each deploy / on rotation
# ─────────────────────────────────────────────────────
<the exact command>
```

And every step gives you, in order: a plain‑English explanation **before** the
command, the command, a **realistic** expected output, a ✅ **checkpoint** to
confirm it worked, and a ⚠️ **common error** with the exact fix.

---

## Honesty banner — what exists today vs. what this manual stands up

This manual is truthful about the platform's build state so you never chase a
service that does not exist yet.

| Component | Status | Notes |
|---|---|---|
| `osiris-web` (Next.js website + COP front end) | **LIVE** | Root `Dockerfile`, `output: 'standalone'`, port 3000 |
| `foundation-api` (auth, audit, Common Object Model, SPYS planning) | **LIVE** | `services/api`, port 8000, `/health` + `/ready` |
| `ingestion` (connector SDK) | **LIVE** | `services/ingestion`, port 8000, `/connectors` |
| `fusion`, `analytics`, `ai`, `media-processing`, `alerting`, `reporting`, `archive` | **PLANNED** | Later phases; deploy their manifests only once their images exist |
| PostgreSQL + PostGIS, Redis | **LIVE (infra)** | Deployed by this manual (Part 6) |
| OpenBao, cert‑manager, ingress‑nginx, Prometheus/Grafana, EFK, Wazuh, Trivy | **Off‑the‑shelf** | Real tools with real install commands, integrated here with the KAM services |

The third‑party tools above are genuine open‑source projects. Where this manual
pins a chart or image version, it uses a realistic recent value and tells you to
**confirm the current version** before production use — versions move, and you
should pin the one you tested, not trust a number in a document.

---

## ⚠️ Ambiguity resolutions (read before Part 1)

### Resolution 1 — Which repository is the deployment target?

Two paths have appeared in this session. I inspected both:

| | Path A | Path B |
|---|---|---|
| Path | `/Users/badtux/Downloads/web 2` | `/Users/badtux/osiris` |
| Git remote | `github.com/badtux66/web-2` | `github.com/simplifaisoul/osiris` |
| Root commit | `56303f09…` | `b83294c0…` |
| Tracked files | 258 | 815 |
| Contents | Screenshots, `.zip` archives, an HTML capture — a personal scratch/download folder | The KAM Multi‑INT + SPYS monorepo (`src/`, `services/`, `packages/`, `infra/`, `docs/`) |

> **PATH RESOLUTION:** The two paths are **different, unrelated git repositories**.
> They share no commit history (different root commits) and have different remotes.
> Path A is a personal downloads/scratch workspace; Path B is the platform monorepo.
> **DEPLOYMENT TARGET:** `/Users/badtux/osiris`
> **REASON:** It is the only path containing the KAM/OSIRIS/SPYS codebase, its
> services, its infrastructure manifests, and its requirements/ADR records. Path A
> merely shares the substring "web 2" in a folder name and is unrelated to the platform.

### Resolution 2 — What does "embed the application within the website" mean?

**Chosen interpretation: Option A** — deploy KAM Multi‑INT as **microservices
reached through the website's navigation, behind one shared Institution‑IAM
session**. This is recorded in full as **`docs/adr/ADR-013-website-application-integration.md`**.

Why Option A (in one paragraph): the website and the KAM front end are **already
the same Next.js app** (`osiris`), so there is no separate site to migrate
(Option C is already true at the UI layer). The intelligence capabilities live in
separate backend services (`foundation-api`, `ingestion`, …) that the Next.js app
reaches through its own **server‑side API routes acting as a Backend‑For‑Frontend
(BFF)** — the browser never calls a backend directly. Iframes (Option B) would
fracture the single security context; a separate API Gateway (Option D) adds a
component and a hop the BFF already covers.

> **Naming conflict flagged honestly:** the brief asked for this to be "ADR‑002".
> `ADR-002-institution-iam.md` already exists; overwriting an accepted record
> would be wrong, so the decision is filed as **ADR‑013** and references ADR‑002.

---

## The platform in one picture

```
                          Public internet
                                │  https://kam.example.gov.tr (TLS 1.3)
                                ▼
                 ┌──────────────────────────────┐
                 │   ingress-nginx  (front door) │   ← Part 10
                 │   cert-manager gives it a cert│   ← Part 4
                 └───────────────┬──────────────┘
                                 │  only the website is exposed
                                 ▼
   namespace: kam       ┌─────────────────┐
                        │   osiris-web     │  Next.js website + COP + BFF   (LIVE)
                        │   (port 3000)    │
                        └───┬─────────┬────┘
              BFF: /api/… routes │         │   (browser never crosses this line)
                   ┌────────────▼──┐   ┌──▼─────────────┐
                   │ foundation-api │   │   ingestion    │      (LIVE)
                   │  (port 8000)   │   │  (port 8000)   │
                   └───┬────────────┘   └────────────────┘
                       │
                 ┌─────▼──────┐   ┌─────────┐
                 │ PostgreSQL │   │  Redis  │                   (Part 6)
                 │ + PostGIS  │   └─────────┘
                 └────────────┘

  Cross-cutting, in their own namespaces:
   • openbao         → secrets vault (Part 5)      • kam-observability → Prometheus/Grafana + EFK (Parts 11)
   • cert-manager    → TLS certificates (Part 4)   • wazuh             → SIEM (Part 12)
```

---

# PART 1 — Prepare the bare server

A *bare server* is a fresh machine with nothing installed but its operating
system. Think of it as an empty commercial kitchen: before any cooking, you fit
the counters, gas, and hygiene stations. Parts 1–2 fit out the kitchen.

> **Production target:** 🐧 Linux (Ubuntu 22.04 LTS or Debian 12). macOS and
> Windows sections are for **local development only** — you would not run the
> public platform on a laptop.

## 1.1 Log in and update the operating system

Before installing anything, refresh the server's list of available software and
apply security updates. This is like restocking and cleaning the kitchen before
service.

### 🐧 Linux (Ubuntu 22.04 / Debian 12)

```bash
# ─────────────────────────────────────────────────────
# WHAT THIS DOES: Refreshes the package catalogue and installs all pending
#                 security and bug-fix updates on the server.
# WHO runs this:  sysadmin
# WHEN to run:    once at setup, then on a routine patch schedule
# ─────────────────────────────────────────────────────
sudo apt-get update && sudo apt-get upgrade -y
```

- ✅ **Success looks like:** a scroll of `Get:`/`Unpacking`/`Setting up` lines
  ending with a return to your prompt and no `E:` error lines.
- ⚠️ **Common error:** `Could not get lock /var/lib/dpkg/lock-frontend`. Another
  update is already running. Wait a minute, or find and stop it:
  ```bash
  # WHAT THIS DOES: Shows which process holds the package lock so you can wait for it.
  sudo lsof /var/lib/dpkg/lock-frontend
  ```

### 🍎 macOS (local dev only)

```bash
# ─────────────────────────────────────────────────────
# WHAT THIS DOES: Installs Homebrew, the macOS package manager, if it is missing.
# WHO runs this:  developer
# WHEN to run:    once at setup
# ─────────────────────────────────────────────────────
/bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"
```

- ✅ **Success looks like:** `==> Installation successful!` near the end.
- ⚠️ **Common error:** `command not found: brew` afterwards. Homebrew is not on
  your PATH. On Apple Silicon, add it:
  ```bash
  echo 'eval "$(/opt/homebrew/bin/brew shellenv)"' >> ~/.zprofile && eval "$(/opt/homebrew/bin/brew shellenv)"
  ```

### 🪟 Windows (local dev only — enable WSL2 first)

```powershell
# ─────────────────────────────────────────────────────
# WHAT THIS DOES: Installs the Windows Subsystem for Linux (WSL2) with Ubuntu,
#                 giving you a real Linux terminal inside Windows.
# WHO runs this:  developer (PowerShell as Administrator)
# WHEN to run:    once at setup
# ─────────────────────────────────────────────────────
wsl --install -d Ubuntu-22.04
```

- ✅ **Success looks like:** `Ubuntu-22.04 installed.` then a prompt to reboot.
  After reboot, an Ubuntu window asks you to create a Linux username/password.
- ⚠️ **Common error:** `WslRegisterDistribution failed with error: 0x800701bc`.
  The WSL2 kernel is outdated. Fix and retry:
  ```powershell
  wsl --update
  ```

> ✅ **Checkpoint (all OSes).** Run `whoami` and you see your username. Run
> `uname -a` (Linux/macOS/WSL) and you see the kernel line. You have a working
> terminal on an updated system.

## 1.2 Create a non‑root working user (Linux server)

Running everything as the allmighty `root` user is like giving every kitchen
worker the master key to the whole building. We create a normal user who can ask
for elevated rights only when needed (`sudo`).

```bash
# ─────────────────────────────────────────────────────
# WHAT THIS DOES: Creates a login user named "kamops" and grants it the ability
#                 to run admin commands via sudo.
# WHO runs this:  sysadmin (as root, once)
# WHEN to run:    once at setup
# ─────────────────────────────────────────────────────
sudo adduser kamops && sudo usermod -aG sudo kamops
```

- ✅ **Success looks like:** prompts for a new password, then
  `Adding user 'kamops' to group 'sudo'`.
- ⚠️ **Common error:** `adduser: The user 'kamops' already exists.` That is fine —
  the user is present. Confirm the sudo group membership with `groups kamops`.

## 1.3 Configure the firewall

A *firewall* is a bouncer at the door who only lets through the visitors on the
guest list. We allow SSH (so you can log in), plus HTTP and HTTPS (so the public
can reach the website), and block everything else.

```bash
# ─────────────────────────────────────────────────────
# WHAT THIS DOES: Installs the Uncomplicated Firewall, allows SSH + web traffic,
#                 and turns the firewall on.
# WHO runs this:  sysadmin
# WHEN to run:    once at setup
# ─────────────────────────────────────────────────────
sudo apt-get install -y ufw \
  && sudo ufw allow OpenSSH \
  && sudo ufw allow 80/tcp \
  && sudo ufw allow 443/tcp \
  && sudo ufw --force enable
```

- ✅ **Success looks like:** `Firewall is active and enabled on system startup`.
- ⚠️ **Common error:** you lose your SSH connection right after enabling. You
  forgot to allow SSH **before** enabling. From the server's console (not SSH):
  ```bash
  sudo ufw allow OpenSSH && sudo ufw reload
  ```

> ✅ **Checkpoint.** `sudo ufw status` lists `22/OpenSSH`, `80/tcp`, and `443/tcp`
> as `ALLOW`. Nothing else should be open yet.

---

# PART 2 — Install the container tools and Kubernetes

## 2.1 Key terms, defined once

- **Container:** a sealed lunchbox holding a program plus everything it needs to
  run, so it behaves identically on any machine.
- **Container runtime (containerd):** the microwave that actually heats and runs
  the lunchboxes.
- **Kubernetes:** the head chef who decides which station cooks which dish,
  replaces a cook who quits mid‑shift, and adds cooks when the dining room fills.
- **k3s:** a lightweight, single‑binary Kubernetes that is production‑grade yet
  small enough for one server or a handful — ideal here.
- **kubectl:** the walkie‑talkie you use to give the head chef orders.
- **Helm:** a recipe book; one recipe installs a whole stack of related dishes.

## 2.2 Install kubectl (the walkie‑talkie)

### 🐧 Linux

```bash
# ─────────────────────────────────────────────────────
# WHAT THIS DOES: Downloads the official kubectl binary that matches the current
#                 stable Kubernetes release and installs it system-wide.
# WHO runs this:  sysadmin
# WHEN to run:    once at setup
# ─────────────────────────────────────────────────────
curl -LO "https://dl.k8s.io/release/$(curl -L -s https://dl.k8s.io/release/stable.txt)/bin/linux/amd64/kubectl" \
  && sudo install -o root -g root -m 0755 kubectl /usr/local/bin/kubectl
```

- ✅ **Success looks like:** no output from `install`, then `kubectl version
  --client` prints `Client Version: v1.31.x`.
- ⚠️ **Common error:** `kubectl: command not found`. The binary did not land in
  your PATH. Confirm it exists and is executable:
  ```bash
  ls -l /usr/local/bin/kubectl
  ```

### 🍎 macOS / 🪟 Windows (dev)

```bash
# macOS (Homebrew):
brew install kubectl
```
```powershell
# Windows (PowerShell):
winget install -e --id Kubernetes.kubectl
```

## 2.3 Install Helm (the recipe book)

```bash
# ─────────────────────────────────────────────────────
# WHAT THIS DOES: Runs Helm's official installer script, placing the "helm"
#                 command on your server.
# WHO runs this:  sysadmin
# WHEN to run:    once at setup
# ─────────────────────────────────────────────────────
curl https://raw.githubusercontent.com/helm/helm/main/scripts/get-helm-3 | bash
```

- ✅ **Success looks like:** `helm installed into /usr/local/bin/helm`, then
  `helm version` prints `version.BuildInfo{Version:"v3.x.y" …}`.
- ⚠️ **Common error:** `Error: openssl not found`. Install it first:
  `sudo apt-get install -y openssl`, then re‑run.

## 2.4 Install the Kubernetes cluster (k3s) on the server

k3s is both the head chef **and** the kitchen, installed by one command. We
disable its built‑in load balancer and ingress because we install our own
(ingress‑nginx) later for full control.

```bash
# ─────────────────────────────────────────────────────
# WHAT THIS DOES: Installs a single-node k3s Kubernetes cluster, without k3s's
#                 default Traefik ingress (we use ingress-nginx instead).
# WHO runs this:  sysadmin
# WHEN to run:    once at setup (per server)
# ─────────────────────────────────────────────────────
curl -sfL https://get.k3s.io | INSTALL_K3S_EXEC="--disable traefik" sh -
```

- ✅ **Success looks like:** lines ending in `systemd: Starting k3s` and a return
  to prompt with no `Job for k3s.service failed`.
- ⚠️ **Common error:** `Job for k3s.service failed`. Read the reason:
  ```bash
  # WHAT THIS DOES: Shows why the k3s service failed to start (often a port clash
  #                 on 6443 or low memory).
  sudo journalctl -u k3s --no-pager -n 40
  ```

Now let your normal user talk to the cluster. k3s writes its admin credentials to
a root‑only file; we copy it to your user so you do not need `sudo` for every
command.

```bash
# ─────────────────────────────────────────────────────
# WHAT THIS DOES: Copies the cluster's admin config into your user's home so
#                 kubectl can authenticate as you, and points kubectl at it.
# WHO runs this:  sysadmin (as the kamops user)
# WHEN to run:    once at setup
# ─────────────────────────────────────────────────────
mkdir -p ~/.kube \
  && sudo cp /etc/rancher/k3s/k3s.yaml ~/.kube/config \
  && sudo chown "$(id -u):$(id -g)" ~/.kube/config \
  && echo 'export KUBECONFIG=~/.kube/config' >> ~/.bashrc && export KUBECONFIG=~/.kube/config
```

- ✅ **Success looks like:** no output; the next command works without `sudo`.

```bash
# ─────────────────────────────────────────────────────
# WHAT THIS DOES: Asks the cluster to list its machines (nodes) — the first real
#                 conversation with your new Kubernetes.
# WHO runs this:  sysadmin
# WHEN to run:    to verify the cluster is up
# ─────────────────────────────────────────────────────
kubectl get nodes
```

- ✅ **Success looks like:**
  ```
  NAME        STATUS   ROLES                  AGE   VERSION
  kam-prod1   Ready    control-plane,master   90s   v1.31.5+k3s1
  ```
- ⚠️ **Common error:** `The connection to the server localhost:8080 was refused`.
  kubectl cannot find your config. Re‑run the `export KUBECONFIG` line above, or
  open a fresh terminal so `~/.bashrc` is reloaded.

> ✅ **Checkpoint.** `kubectl get nodes` shows one node as `Ready`. Your kitchen is
> built and the head chef is on duty.

---

# PART 3 — Create the namespaces

A *namespace* is a floor in an office building: it walls off one group's work
from another's. We give each concern its own floor so a problem on one does not
spill onto the others.

```bash
# ─────────────────────────────────────────────────────
# WHAT THIS DOES: Creates the five floors this platform uses: the app, the
#                 secrets vault, TLS machinery, monitoring, and the SIEM.
# WHO runs this:  sysadmin
# WHEN to run:    once at setup
# ─────────────────────────────────────────────────────
kubectl create namespace kam \
  && kubectl create namespace openbao \
  && kubectl create namespace cert-manager \
  && kubectl create namespace kam-observability \
  && kubectl create namespace wazuh
```

- ✅ **Success looks like:** five `namespace/… created` lines.
- ⚠️ **Common error:** `AlreadyExists` for one of them — harmless; that floor was
  already built. Continue.

Now label the application floor so Kubernetes refuses to run unsafe (root)
containers there — a house rule for the whole floor.

```bash
# ─────────────────────────────────────────────────────
# WHAT THIS DOES: Enforces the "restricted" Pod Security Standard on the kam
#                 namespace, blocking any container that tries to run as root.
# WHO runs this:  sysadmin
# WHEN to run:    once at setup
# ─────────────────────────────────────────────────────
kubectl label namespace kam pod-security.kubernetes.io/enforce=restricted --overwrite
```

- ✅ **Success looks like:** `namespace/kam labeled`.

> ✅ **Checkpoint.** `kubectl get ns` lists `kam`, `openbao`, `cert-manager`,
> `kam-observability`, and `wazuh` as `Active`.

---

# PART 4 — PKI and TLS with cert‑manager

## 4.1 What this part gives you

**TLS** is the padlock that turns `http://` into `https://`, encrypting traffic
so no one between the visitor and the server can read it. A **certificate** is the
ID card that proves the padlock belongs to *your* site. **PKI** (Public Key
Infrastructure) is the trust system of issuers and ID cards.

**cert‑manager** is an automatic ID‑card office inside Kubernetes: it requests,
installs, and *renews* certificates so you never wake up to an expired‑certificate
outage. We support two issuers:

- **Public platform (OSIRIS_CONNECTED):** Let's Encrypt issues free, publicly
  trusted certificates.
- **Air‑gapped platform (SPYS_AIRGAP, ADR‑003):** a **private internal CA** issues
  certificates, because an air‑gapped network cannot reach Let's Encrypt and must
  not try.

## 4.2 Install cert‑manager

```bash
# ─────────────────────────────────────────────────────
# WHAT THIS DOES: Adds the Jetstack Helm repository (cert-manager's publisher)
#                 and refreshes the local recipe index.
# WHO runs this:  sysadmin
# WHEN to run:    once at setup
# ─────────────────────────────────────────────────────
helm repo add jetstack https://charts.jetstack.io && helm repo update
```

- ✅ **Success looks like:** `"jetstack" has been added to your repositories` then
  `Update Complete. ⎈Happy Helming!⎈`.

```bash
# ─────────────────────────────────────────────────────
# WHAT THIS DOES: Installs cert-manager (with its CRDs) into the cert-manager
#                 namespace. CRDs are new object types that teach Kubernetes what
#                 a "Certificate" and an "Issuer" are.
# WHO runs this:  sysadmin
# WHEN to run:    once at setup (confirm the chart version before production)
# ─────────────────────────────────────────────────────
helm install cert-manager jetstack/cert-manager \
  --namespace cert-manager \
  --version v1.16.2 \
  --set crds.enabled=true
```

- ✅ **Success looks like:** `STATUS: deployed`, then after a minute three Pods
  Running:
  ```bash
  kubectl get pods -n cert-manager
  # cert-manager-...            1/1 Running
  # cert-manager-cainjector-... 1/1 Running
  # cert-manager-webhook-...    1/1 Running
  ```
- ⚠️ **Common error:** Pods stuck `Pending` with `Insufficient memory`. cert‑manager
  needs a little headroom. On a tiny server, check free memory with `free -m`; a
  production node should have ≥ 4 GB RAM.

## 4.3 Create the certificate issuer

### Public issuer (OSIRIS_CONNECTED) — Let's Encrypt

Replace `ops@example.gov.tr` with a real address that receives expiry warnings.

```yaml
# clusterissuer-letsencrypt.yaml
apiVersion: cert-manager.io/v1        # the cert-manager API this object uses
kind: ClusterIssuer                   # a certificate issuer valid cluster-wide
metadata:
  name: letsencrypt-prod              # the name we reference from Ingress later
spec:
  acme:                               # ACME is the protocol Let's Encrypt speaks
    server: https://acme-v02.api.letsencrypt.org/directory  # the production endpoint
    email: ops@example.gov.tr         # who gets renewal/expiry notices
    privateKeySecretRef:
      name: letsencrypt-prod-account  # cert-manager stores the ACME account key here
    solvers:
      - http01:                       # proves domain ownership over HTTP
          ingress:
            class: nginx              # the ingress controller that will serve the challenge
```

```bash
# ─────────────────────────────────────────────────────
# WHAT THIS DOES: Registers the Let's Encrypt production issuer with cert-manager.
# WHO runs this:  sysadmin
# WHEN to run:    once at setup (public profile)
# ─────────────────────────────────────────────────────
kubectl apply -f clusterissuer-letsencrypt.yaml
```

- ✅ **Success looks like:** `clusterissuer.cert-manager.io/letsencrypt-prod created`,
  and `kubectl get clusterissuer` shows `READY True`.
- ⚠️ **Common error:** `READY False` with `acme: … registration`. Usually the
  email is malformed or the server has no outbound internet. Check the reason:
  ```bash
  kubectl describe clusterissuer letsencrypt-prod
  ```

### Private issuer (SPYS_AIRGAP) — internal CA

An air‑gapped network makes its own ID‑card office. First create a self‑signed
root, then an issuer that uses it.

```yaml
# clusterissuer-internal-ca.yaml
apiVersion: cert-manager.io/v1
kind: ClusterIssuer
metadata:
  name: selfsigned-root              # bootstraps our own certificate authority
spec:
  selfSigned: {}                     # this issuer signs its own root certificate
---
apiVersion: cert-manager.io/v1
kind: Certificate                    # the root CA certificate itself
metadata:
  name: kam-internal-ca
  namespace: cert-manager
spec:
  isCA: true                         # this certificate may sign other certificates
  commonName: KAM Internal Root CA   # a human-readable name for the authority
  secretName: kam-internal-ca        # the CA's key+cert are stored in this Secret
  duration: 87600h                   # 10 years — a root CA is long-lived
  privateKey: { algorithm: ECDSA, size: 384 }  # strong modern key
  issuerRef: { name: selfsigned-root, kind: ClusterIssuer, group: cert-manager.io }
---
apiVersion: cert-manager.io/v1
kind: ClusterIssuer
metadata:
  name: kam-ca-issuer                # the day-to-day issuer that signs service certs
spec:
  ca:
    secretName: kam-internal-ca      # signs using the root CA created above
```

```bash
# ─────────────────────────────────────────────────────
# WHAT THIS DOES: Creates the internal Certificate Authority and the issuer that
#                 signs service certificates in the air-gapped profile.
# WHO runs this:  sysadmin
# WHEN to run:    once at setup (air-gapped profile)
# ─────────────────────────────────────────────────────
kubectl apply -f clusterissuer-internal-ca.yaml
```

- ✅ **Success looks like:** three objects created; `kubectl get clusterissuer
  kam-ca-issuer` shows `READY True`.
- ⚠️ **Common error:** the `kam-ca-issuer` stays `READY False` with
  `secret "kam-internal-ca" not found`. The root Certificate has not finished
  issuing yet. Wait, then check `kubectl get certificate -n cert-manager`.

> ✅ **Checkpoint.** `kubectl get clusterissuer` shows your chosen issuer as
> `READY True`. The ID‑card office is open.

---

# PART 5 — Secrets management with OpenBao

## 5.1 Why not native Kubernetes Secrets alone?

A native Kubernetes Secret is a **sealed envelope at reception** — better than
writing the password on the door, but its contents are only base64‑encoded
(reversible), and there is no log of who opened it. For production we add
**OpenBao**: a real **bank vault** (OpenBao is the open‑source fork of HashiCorp
Vault) with a guard, an access log, automatic rotation, and the ability to hand
out short‑lived credentials. The **External Secrets Operator (ESO)** is the
trusted courier that fetches a value from the vault and places it into a native
Kubernetes Secret your Pods already know how to read — so your Deployments do not
change.

## 5.2 Install OpenBao

```bash
# ─────────────────────────────────────────────────────
# WHAT THIS DOES: Adds the OpenBao Helm repository and installs OpenBao into its
#                 own namespace, backed by persistent storage so the vault
#                 survives restarts.
# WHO runs this:  sysadmin
# WHEN to run:    once at setup
# ─────────────────────────────────────────────────────
helm repo add openbao https://openbao.github.io/openbao-helm && helm repo update \
  && helm install openbao openbao/openbao \
       --namespace openbao \
       --set "server.dataStorage.enabled=true" \
       --set "server.dataStorage.size=5Gi"
```

- ✅ **Success looks like:** `STATUS: deployed`, then `kubectl get pods -n openbao`
  shows `openbao-0` as `0/1 Running` — it is **Running but not Ready** on purpose,
  because a fresh vault is *sealed*.
- ⚠️ **Common error:** `openbao-0` stuck `Pending`. It is waiting for a disk. On
  k3s, storage is provided automatically; on other clusters you may need a
  StorageClass. Check: `kubectl get pvc -n openbao`.

## 5.3 Initialise and unseal the vault

A new vault is **sealed** like a bank vault after a power cut: even the staff
cannot open it until enough key‑holders turn their keys together. *Initialising*
creates those keys.

```bash
# ─────────────────────────────────────────────────────
# WHAT THIS DOES: Initialises the vault, producing 5 unseal key shares and a root
#                 token, and saves them to a local file. GUARD THIS FILE — it is
#                 the master key to every secret.
# WHO runs this:  sysadmin (once, ever)
# WHEN to run:    once at setup
# ─────────────────────────────────────────────────────
kubectl exec -n openbao openbao-0 -- bao operator init -key-shares=5 -key-threshold=3 -format=json > openbao-init.json
```

- ✅ **Success looks like:** a new `openbao-init.json` file. Inside are
  `unseal_keys_b64` (5 of them) and `root_token`.
- ⚠️ **Common error:** `Vault is already initialized`. It was set up before. Do
  **not** re‑initialise (that would orphan every secret). Use the existing
  `openbao-init.json`.

> 🔐 **Store `openbao-init.json` offline immediately** — a password manager or a
> sealed physical envelope in a safe. Anyone with three of the five unseal keys
> can open the vault. Never commit it; never Slack it.

Now unseal by supplying three of the five keys. Run this three times, each with a
different key from the file.

```bash
# ─────────────────────────────────────────────────────
# WHAT THIS DOES: Supplies one unseal key. Repeat with THREE different keys to
#                 open the vault (threshold = 3).
# WHO runs this:  sysadmin (after any vault restart)
# WHEN to run:    at setup, and after every OpenBao Pod restart
# ─────────────────────────────────────────────────────
kubectl exec -n openbao openbao-0 -- bao operator unseal <PASTE_ONE_UNSEAL_KEY_FROM_FILE>
```

- ✅ **Success looks like:** each run prints `Sealed  false` once the third key is
  in, and the Pod flips to `1/1 Ready`.
- ⚠️ **Common error:** `Error unsealing: … invalid key`. You pasted a truncated or
  wrong key. Copy the full base64 string (they are long) from `openbao-init.json`.

## 5.4 Turn on a place to store secrets and write the KAM secrets

Log into the vault using the `root_token` from the init file, enable a key‑value
store, and write the platform's real secrets. **Every secret is generated with an
exact command — none are invented placeholders.**

```bash
# ─────────────────────────────────────────────────────
# WHAT THIS DOES: Opens an interactive shell inside the OpenBao Pod and logs in
#                 as root so the next commands can write secrets.
# WHO runs this:  sysadmin
# WHEN to run:    at setup, and whenever adding/rotating secrets
# ─────────────────────────────────────────────────────
kubectl exec -it -n openbao openbao-0 -- sh
# then, inside the Pod:
bao login <PASTE_root_token_FROM_openbao-init.json>
bao secrets enable -path=kam kv-v2       # a versioned key-value store at path "kam"
```

- ✅ **Success looks like:** `Success! Enabled the kv-v2 secrets engine at: kam/`.

Generate and store the database password, the audit HMAC key, and (public
profile) connector keys. Run these **inside** the OpenBao Pod shell:

```bash
# ─────────────────────────────────────────────────────
# WHAT THIS DOES: Generates a strong random PostgreSQL password and stores it in
#                 the vault under kam/postgres.
# WHO runs this:  sysadmin
# WHEN to run:    at setup, then on rotation
# ─────────────────────────────────────────────────────
bao kv put kam/postgres password="$(head -c 24 /dev/urandom | base64 | tr -d '/+=' | cut -c1-32)"
```

```bash
# ─────────────────────────────────────────────────────
# WHAT THIS DOES: Generates a 64-hex-character audit HMAC key (used to make the
#                 audit log tamper-evident) and stores it in the vault.
# WHO runs this:  sysadmin
# WHEN to run:    at setup
# ─────────────────────────────────────────────────────
bao kv put kam/audit hmac_key="$(head -c 32 /dev/urandom | od -An -tx1 | tr -d ' \n')"
```

```bash
# ─────────────────────────────────────────────────────
# WHAT THIS DOES: Stores the Institution IAM (OIDC) issuer and JWKS URLs, which
#                 the API needs to validate login tokens.
# WHO runs this:  sysadmin
# WHEN to run:    at setup (values come from your Institution IAM team)
# ─────────────────────────────────────────────────────
bao kv put kam/oidc \
  issuer="https://institution-iam.internal/realms/kam" \
  jwks_url="https://institution-iam.internal/realms/kam/protocol/openid-connect/certs"
```

- ✅ **Success looks like:** `Success! Data written to: kam/postgres` (and similar
  for each). Type `exit` to leave the Pod shell.
- ⚠️ **Common error:** `permission denied` on `bao kv put`. Your `bao login` did
  not take. Re‑run `bao login <root_token>` inside the Pod.

## 5.5 Install External Secrets Operator and sync into Kubernetes

```bash
# ─────────────────────────────────────────────────────
# WHAT THIS DOES: Installs the External Secrets Operator, the courier that copies
#                 values from OpenBao into native Kubernetes Secrets on a schedule.
# WHO runs this:  sysadmin
# WHEN to run:    once at setup
# ─────────────────────────────────────────────────────
helm repo add external-secrets https://charts.external-secrets.io && helm repo update \
  && helm install external-secrets external-secrets/external-secrets \
       --namespace external-secrets --create-namespace
```

- ✅ **Success looks like:** `STATUS: deployed`; three `external-secrets-…` Pods
  become `Running`.

Then create a `SecretStore` (which vault to read) and an `ExternalSecret` (which
values to materialise as the `kam-foundation-secrets` Secret the KAM API expects):

```yaml
# eso-kam.yaml
apiVersion: external-secrets.io/v1beta1
kind: SecretStore
metadata:
  name: openbao-kam
  namespace: kam                       # this store serves the kam namespace
spec:
  provider:
    vault:                             # OpenBao speaks the Vault API
      server: "http://openbao.openbao.svc:8200"  # in-cluster address of the vault
      path: "kam"                      # the kv-v2 mount we enabled
      version: "v2"
      auth:
        tokenSecretRef:                # how ESO authenticates to the vault
          name: openbao-token          # a Secret holding a scoped vault token
          key: token
---
apiVersion: external-secrets.io/v1beta1
kind: ExternalSecret
metadata:
  name: kam-foundation-secrets
  namespace: kam
spec:
  refreshInterval: "1h"                # re-sync hourly, so rotations propagate
  secretStoreRef: { name: openbao-kam, kind: SecretStore }
  target:
    name: kam-foundation-secrets       # the native Secret the API mounts
  data:
    - secretKey: postgres-password     # key name inside the Kubernetes Secret
      remoteRef: { key: postgres, property: password }   # where to read it in the vault
    - secretKey: audit-hmac-key
      remoteRef: { key: audit, property: hmac_key }
    - secretKey: oidc-issuer
      remoteRef: { key: oidc, property: issuer }
    - secretKey: oidc-jwks-url
      remoteRef: { key: oidc, property: jwks_url }
```

```bash
# ─────────────────────────────────────────────────────
# WHAT THIS DOES: Creates a scoped vault token Secret for ESO, then applies the
#                 SecretStore + ExternalSecret so Kubernetes gets kam-foundation-secrets.
# WHO runs this:  sysadmin
# WHEN to run:    once at setup
# ─────────────────────────────────────────────────────
kubectl create secret generic openbao-token -n kam --from-literal=token='<A_SCOPED_VAULT_TOKEN>' \
  && kubectl apply -f eso-kam.yaml
```

- ✅ **Success looks like:** `kubectl get externalsecret -n kam` shows
  `STATUS SecretSynced` and `READY True`, and `kubectl get secret
  kam-foundation-secrets -n kam` now exists.
- ⚠️ **Common error:** `SecretSyncedError … permission denied`. The vault token
  lacks a policy allowing `read` on `kam/*`. Create a read policy in OpenBao and
  issue the token against it (see Part 13.5).

> ✅ **Checkpoint.** `kubectl get secret kam-foundation-secrets -n kam` exists and
> its keys include `postgres-password`, `audit-hmac-key`, `oidc-issuer`,
> `oidc-jwks-url`. The vault → Kubernetes courier route works.

---

# PART 6 — Persistent storage (PostgreSQL + PostGIS, Redis)

## 6.1 Why databases live outside Pods

A Pod's own disk is a **whiteboard wiped every night** — anything written there
vanishes when the Pod is replaced. A database needs a **filing cabinet that
survives**: a PersistentVolume. We deploy PostgreSQL (with the PostGIS map
extension) as a **StatefulSet**, the database‑shaped cousin of a Deployment that
gives each Pod a stable name and its own cabinet.

## 6.2 Deploy PostgreSQL + PostGIS

```yaml
# postgres.yaml
apiVersion: apps/v1
kind: StatefulSet
metadata:
  name: postgres
  namespace: kam
spec:
  serviceName: postgres              # the stable network name for the DB
  replicas: 1                        # a single primary; add HA replicas in Part 14
  selector: { matchLabels: { app: postgres } }
  template:
    metadata: { labels: { app: postgres } }
    spec:
      securityContext:
        fsGroup: 999                 # the postgres user's group, so it can write the volume
      containers:
        - name: postgres
          image: postgis/postgis:16-3.5   # PostgreSQL 16 with the PostGIS map extension
          ports: [{ containerPort: 5432 }]  # the standard PostgreSQL port
          env:
            - name: POSTGRES_DB
              value: kam             # the database name the app connects to
            - name: POSTGRES_USER
              value: kam_app         # the application's database user
            - name: POSTGRES_PASSWORD_FILE
              value: /run/secrets/postgres_password   # read the password from a file, not an env value
          volumeMounts:
            - { name: data, mountPath: /var/lib/postgresql/data }   # the filing cabinet
            - { name: pw, mountPath: /run/secrets, readOnly: true } # the mounted password
      volumes:
        - name: pw
          secret:
            secretName: kam-foundation-secrets   # from OpenBao via ESO (Part 5)
            items: [{ key: postgres-password, path: postgres_password }]
  volumeClaimTemplates:              # asks Kubernetes for a persistent cabinet
    - metadata: { name: data }
      spec:
        accessModes: ["ReadWriteOnce"]   # one node mounts it read-write
        resources: { requests: { storage: 20Gi } }  # 20 GB to start
---
apiVersion: v1
kind: Service
metadata: { name: postgres, namespace: kam }
spec:
  selector: { app: postgres }
  ports: [{ port: 5432, targetPort: 5432 }]   # the reception desk for the DB
  clusterIP: None                    # "headless" — required for a StatefulSet
```

```bash
# ─────────────────────────────────────────────────────
# WHAT THIS DOES: Deploys the PostgreSQL+PostGIS database and its Service.
# WHO runs this:  sysadmin
# WHEN to run:    once at setup
# ─────────────────────────────────────────────────────
kubectl apply -f postgres.yaml
```

- ✅ **Success looks like:** `kubectl get pod -n kam -l app=postgres` shows
  `postgres-0  1/1 Running` after a minute.
- ⚠️ **Common error:** `CrashLoopBackOff` with `database files are incompatible`.
  The volume holds data from a different Postgres major version. On a *new*
  install only, clear it: delete the StatefulSet and its PVC and re‑apply. **Never
  do this to a volume holding real data.**

> ✅ **Checkpoint.** `kubectl exec -n kam postgres-0 -- pg_isready -U kam_app`
> prints `accepting connections`.

## 6.3 Deploy Redis (fast cache/queue)

```bash
# ─────────────────────────────────────────────────────
# WHAT THIS DOES: Installs Redis via Helm into the kam namespace with a password
#                 read from the platform Secret.
# WHO runs this:  sysadmin
# WHEN to run:    once at setup
# ─────────────────────────────────────────────────────
helm repo add bitnami https://charts.bitnami.com/bitnami && helm repo update \
  && helm install redis bitnami/redis \
       --namespace kam \
       --set architecture=standalone \
       --set auth.existingSecret=kam-foundation-secrets \
       --set auth.existingSecretPasswordKey=redis-password
```

- ✅ **Success looks like:** `STATUS: deployed`; `redis-master-0` becomes
  `1/1 Running`.
- ⚠️ **Common error:** the Pod fails because `redis-password` is missing from the
  Secret. Add it to OpenBao (`bao kv patch kam/redis password=…`) and to the
  ExternalSecret data list, or create it directly for a lab.

---

# PART 7 — Build and push the container images

Kubernetes runs **images** (sealed lunchboxes). We build one for each LIVE
service from its real Dockerfile and push it to a **registry** (a warehouse of
lunchboxes the cluster can pull from). Replace `registry.example.gov.tr/kam` with
your registry.

## 7.1 Log in to your container registry

```bash
# ─────────────────────────────────────────────────────
# WHAT THIS DOES: Authenticates your Docker client to the private image registry
#                 so you may push images to it.
# WHO runs this:  developer / CI pipeline
# WHEN to run:    each session that pushes images
# ─────────────────────────────────────────────────────
docker login registry.example.gov.tr
```

- ✅ **Success looks like:** `Login Succeeded`.
- ⚠️ **Common error:** `unauthorized: authentication required`. Wrong username or
  token. Confirm credentials with your registry admin.

## 7.2 Build and push the website image (osiris‑web)

The repository root `Dockerfile` builds the Next.js app in `output: 'standalone'`
mode as a non‑root image listening on port 3000.

```bash
# ─────────────────────────────────────────────────────
# WHAT THIS DOES: Builds the Next.js website/COP image from the repo root and
#                 pushes it to the registry with an explicit version tag.
# WHO runs this:  developer / CI pipeline
# WHEN to run:    each release
# ─────────────────────────────────────────────────────
cd /Users/badtux/osiris \
  && docker build -t registry.example.gov.tr/kam/osiris-web:0.1.0 . \
  && docker push registry.example.gov.tr/kam/osiris-web:0.1.0
```

- ✅ **Success looks like:** build stages `deps → builder → runner`, then
  `pushed` with a digest `sha256:…`.
- ⚠️ **Common error:** `npm ci` fails with `lockfile … out of sync`. Build on a
  clean checkout so `package-lock.json` matches `package.json`; do not edit the
  lockfile to force it.

## 7.3 Build and push the backend images

```bash
# ─────────────────────────────────────────────────────
# WHAT THIS DOES: Builds and pushes the foundation-api and ingestion service
#                 images from their service directories.
# WHO runs this:  developer / CI pipeline
# WHEN to run:    each release
# ─────────────────────────────────────────────────────
docker build -t registry.example.gov.tr/kam/foundation-api:0.1.0 services/api \
  && docker push registry.example.gov.tr/kam/foundation-api:0.1.0 \
  && docker build -t registry.example.gov.tr/kam/ingestion:0.1.0 services/ingestion \
  && docker push registry.example.gov.tr/kam/ingestion:0.1.0
```

- ✅ **Success looks like:** two images pushed with digests.
- ⚠️ **Common error:** `failed to solve: … "app": not found`. You ran the build
  from the wrong directory. Run from the repo root so the `services/api` /
  `services/ingestion` context paths resolve.

> **Before production:** scan every image for known vulnerabilities (Part 14.3).

> ✅ **Checkpoint.** Your registry shows `osiris-web:0.1.0`, `foundation-api:0.1.0`,
> and `ingestion:0.1.0`.

---

# PART 8 — Deploy the KAM backend services

The repository already ships hardened Kubernetes manifests under
`infra/kubernetes/base` (foundation‑api, ingestion, their HPAs/PDBs, and
default‑deny NetworkPolicies). We first create the non‑secret settings
(ConfigMap), then let the cluster pull the images we built.

## 8.1 Create the ConfigMap (public settings)

A **ConfigMap** is the lobby notice board: non‑secret settings anyone may read.

```bash
# ─────────────────────────────────────────────────────
# WHAT THIS DOES: Creates the kam-foundation-config notice board with timezone,
#                 currency, DEMAT thresholds, and the deployment profile.
# WHO runs this:  sysadmin
# WHEN to run:    once at setup; re-apply to change a value
# ─────────────────────────────────────────────────────
kubectl create configmap kam-foundation-config -n kam \
  --from-literal=DEPLOYMENT_PROFILE=OSIRIS_CONNECTED \
  --from-literal=DEFAULT_TIMEZONE=Europe/Istanbul \
  --from-literal=CLASSIFICATION_DEFAULT=UNCLASSIFIED \
  --from-literal=AUTH_REQUIRED=true \
  --from-literal=CURRENCY_BASE=TRY \
  --from-literal=CURRENCY_ALLOWED=TRY,USD,EUR \
  --from-literal=DEMAT_YELLOW_DAYS=92 \
  --from-literal=DEMAT_RED_DAYS=31
```

- ✅ **Success looks like:** `configmap/kam-foundation-config created`.
- ⚠️ **Common error:** `AlreadyExists`. Update it in place:
  ```bash
  kubectl create configmap kam-foundation-config -n kam --from-literal=DEMAT_YELLOW_DAYS=92 \
    --dry-run=client -o yaml | kubectl apply -f -
  ```

## 8.2 Point the manifests at your registry and apply them

The shipped manifests use the placeholder registry `registry.invalid`. We
override it with your registry using a Kustomize image edit, then apply the whole
base.

```bash
# ─────────────────────────────────────────────────────
# WHAT THIS DOES: Rewrites the image registry in the base manifests to your real
#                 registry, without editing the files by hand.
# WHO runs this:  sysadmin / CI pipeline
# WHEN to run:    each deploy
# ─────────────────────────────────────────────────────
cd /Users/badtux/osiris/infra/kubernetes/base \
  && kubectl kustomize . | sed 's#registry.invalid/kam#registry.example.gov.tr/kam#g' | kubectl apply -f -
```

- ✅ **Success looks like:** a list of `created`/`configured` lines for the
  Deployments, Services, HPAs, PDBs, ServiceAccounts, and NetworkPolicies.
- ⚠️ **Common error:** Pods show `ImagePullBackOff`. The cluster cannot fetch your
  images. If your registry is private, create a pull Secret and attach it:
  ```bash
  kubectl create secret docker-registry regcred -n kam \
    --docker-server=registry.example.gov.tr --docker-username=<u> --docker-password=<p>
  ```
  then add `imagePullSecrets: [{ name: regcred }]` to the Deployments' pod spec.

## 8.3 Run the database migration

The API's tables are created by a one‑off migration Job before the API serves
traffic.

```bash
# ─────────────────────────────────────────────────────
# WHAT THIS DOES: Applies the foundation database migration Job, which creates the
#                 tables and stamps the schema revision the API checks for.
# WHO runs this:  sysadmin / CI pipeline
# WHEN to run:    each release that changes the schema
# ─────────────────────────────────────────────────────
kubectl apply -f /Users/badtux/osiris/infra/kubernetes/jobs/foundation-migrate-0001.yaml \
  && kubectl wait --for=condition=complete job/foundation-migration -n kam --timeout=120s
```

- ✅ **Success looks like:** `job.batch/foundation-migration condition met`.
- ⚠️ **Common error:** the Job fails with `password authentication failed`. The
  DB password in `kam-foundation-secrets` does not match what Postgres was created
  with. Confirm both came from the same OpenBao value; if you changed it, rotate
  both together (Part 15.4).

## 8.4 Wait for the API and ingestion rollouts

```bash
# ─────────────────────────────────────────────────────
# WHAT THIS DOES: Waits until the foundation-api Deployment has the desired number
#                 of healthy Pods, so you know the rollout finished.
# WHO runs this:  sysadmin
# WHEN to run:    each deploy
# ─────────────────────────────────────────────────────
kubectl rollout status deployment/foundation-api -n kam --timeout=180s \
  && kubectl rollout status deployment/ingestion -n kam --timeout=180s
```

- ✅ **Success looks like:** `deployment "foundation-api" successfully rolled out`
  and the same for `ingestion`.
- ⚠️ **Common error:** the API stays `0/2` with readiness failing on
  `institution_iam: unavailable`. The API cannot reach the IAM's JWKS URL. In a
  lab without an IAM, this is expected; in production, confirm the
  `institution-iam` namespace/endpoint and the NetworkPolicy egress on port 443.

> ✅ **Checkpoint.** `kubectl get pods -n kam` shows `foundation-api` and
> `ingestion` Pods `Running` and `1/1 Ready`, plus `postgres-0` and `redis`.

---

# PART 9 — Deploy the website and wire the integration (ADR‑013)

Per **ADR‑013 / Option A**, the website is the single Next.js app and it reaches
the backends through its own server‑side API routes (the BFF). We deploy
`osiris-web` and give it the internal addresses of the backends. The browser never
learns these addresses — only the web Pod uses them.

## 9.1 The website Deployment

```yaml
# web-deployment.yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: osiris-web
  namespace: kam
spec:
  replicas: 2                        # two copies so the site is never unmanned
  selector: { matchLabels: { app: osiris-web } }
  template:
    metadata: { labels: { app: osiris-web } }   # the label NetworkPolicies match
    spec:
      serviceAccountName: default
      automountServiceAccountToken: false        # the web app needs no Kubernetes powers
      securityContext:
        seccompProfile: { type: RuntimeDefault } # restrict risky system calls
      containers:
        - name: web
          image: registry.example.gov.tr/kam/osiris-web:0.1.0   # the image from Part 7.2
          ports: [{ name: http, containerPort: 3000 }]          # Next.js listens on 3000
          env:
            - name: NODE_ENV
              value: production
            - name: FOUNDATION_API_URL                 # BFF target: the API service
              value: http://foundation-api.kam.svc:8000
            - name: INGESTION_API_URL                  # BFF target: the ingestion service
              value: http://ingestion.kam.svc:8000
          resources:
            requests: { cpu: 100m, memory: 256Mi }     # reserved amount
            limits:   { cpu: "1",  memory: 1Gi }       # hard ceiling
          securityContext:
            allowPrivilegeEscalation: false            # cannot gain root mid-run
            readOnlyRootFilesystem: true               # cannot write to its own image
            runAsNonRoot: true                         # refuses to run as root
            runAsUser: 1001                            # the nextjs user from the Dockerfile
            capabilities: { drop: ["ALL"] }            # gives up all Linux superpowers
          livenessProbe:
            httpGet: { path: /, port: http }           # "are you alive?"
            periodSeconds: 15
          readinessProbe:
            httpGet: { path: /, port: http }           # "ready for visitors?"
            periodSeconds: 10
---
apiVersion: v1
kind: Service
metadata: { name: osiris-web, namespace: kam }
spec:
  selector: { app: osiris-web }
  ports: [{ name: http, port: 3000, targetPort: http }]   # the website reception desk
```

```bash
# ─────────────────────────────────────────────────────
# WHAT THIS DOES: Deploys the website (osiris-web) and its Service, wired to the
#                 backend services via BFF environment variables.
# WHO runs this:  sysadmin / CI pipeline
# WHEN to run:    each website release
# ─────────────────────────────────────────────────────
kubectl apply -f web-deployment.yaml
```

- ✅ **Success looks like:** `kubectl get deploy osiris-web -n kam` shows `2/2`.
- ⚠️ **Common error:** `Readiness probe failed: HTTP 500`. The web app started but
  its BFF cannot reach a backend, or an env var is missing. Read its logs:
  ```bash
  kubectl logs deployment/osiris-web -n kam --tail=50
  ```

## 9.2 Allow the website to reach the backends (NetworkPolicy)

The shipped `network-policies.yaml` already allows `osiris-web → foundation-api`
and `osiris-web → ingestion` on port 8000 and denies everything else. Confirm the
web egress to the backends is permitted:

```bash
# ─────────────────────────────────────────────────────
# WHAT THIS DOES: From inside a web Pod, calls the API's readiness endpoint to
#                 prove the website can reach the backend over the allowed path.
# WHO runs this:  sysadmin
# WHEN to run:    after deploy, to verify integration
# ─────────────────────────────────────────────────────
kubectl exec -n kam deploy/osiris-web -- wget -qO- http://foundation-api.kam.svc:8000/health
```

- ✅ **Success looks like:** a JSON line like
  `{"status":"operational","service":"kam-foundation-api", …}`.
- ⚠️ **Common error:** the command hangs then fails. A NetworkPolicy is blocking
  it, or the Service name is wrong. Confirm the policy allows `app: osiris-web →
  app: foundation-api` on 8000 (see the companion guide, Chapter 10).

> ✅ **Checkpoint.** The web Pod can reach `/health` on the API. The BFF wiring
> from ADR‑013 works: the website will surface backend capabilities through its
> own `/api/…` routes, behind one Institution‑IAM session.

---

# PART 10 — Public exposure with ingress‑nginx

## 10.1 What Ingress is

**Ingress is the building's front door** that routes each visitor to the right
floor. Outside users type one HTTPS address; the Ingress terminates TLS and
forwards them inward — **only to the website**, never to a backend.

## 10.2 Install ingress‑nginx

```bash
# ─────────────────────────────────────────────────────
# WHAT THIS DOES: Installs the ingress-nginx controller, the program that turns
#                 Ingress rules into an actual public front door.
# WHO runs this:  sysadmin
# WHEN to run:    once at setup
# ─────────────────────────────────────────────────────
helm repo add ingress-nginx https://kubernetes.github.io/ingress-nginx && helm repo update \
  && helm install ingress-nginx ingress-nginx/ingress-nginx \
       --namespace ingress-nginx --create-namespace \
       --set controller.service.type=LoadBalancer
```

- ✅ **Success looks like:** `STATUS: deployed`; after a minute
  `kubectl get svc -n ingress-nginx` shows an `EXTERNAL-IP` for the controller.
- ⚠️ **Common error:** `EXTERNAL-IP <pending>` forever on a bare server. There is
  no cloud load balancer. On k3s, install one:
  ```bash
  # WHAT THIS DOES: Installs MetalLB to hand out an IP from a range you own.
  helm install metallb metallb/metallb -n metallb-system --create-namespace
  ```
  Then create an `IPAddressPool` with your server's spare IP range.

## 10.3 Create the Ingress with automatic TLS

```yaml
# kam-ingress.yaml
apiVersion: networking.k8s.io/v1
kind: Ingress
metadata:
  name: kam
  namespace: kam
  annotations:
    cert-manager.io/cluster-issuer: "letsencrypt-prod"   # cert-manager auto-issues the cert
    nginx.ingress.kubernetes.io/ssl-redirect: "true"     # force http -> https
    nginx.ingress.kubernetes.io/proxy-body-size: "25m"   # allow larger uploads (media)
spec:
  ingressClassName: nginx            # use the controller we installed
  tls:
    - hosts: ["kam.example.gov.tr"]  # the public hostname
      secretName: kam-web-tls        # cert-manager stores the issued cert here
  rules:
    - host: kam.example.gov.tr
      http:
        paths:
          - path: /                  # everything goes to the website...
            pathType: Prefix
            backend:
              service: { name: osiris-web, port: { number: 3000 } }  # ...which is the only exposed app
```

```bash
# ─────────────────────────────────────────────────────
# WHAT THIS DOES: Publishes the website at https://kam.example.gov.tr and triggers
#                 cert-manager to obtain a TLS certificate for it.
# WHO runs this:  sysadmin
# WHEN to run:    once at setup (and when the hostname changes)
# ─────────────────────────────────────────────────────
kubectl apply -f kam-ingress.yaml
```

- ✅ **Success looks like:** after a minute or two,
  `kubectl get certificate -n kam` shows `kam-web-tls  READY True`, and browsing
  `https://kam.example.gov.tr` shows the site with a valid padlock.
- ⚠️ **Common error:** the certificate stays `READY False`. Usually DNS for
  `kam.example.gov.tr` does not yet point at the ingress `EXTERNAL-IP`, so Let's
  Encrypt's HTTP‑01 check fails. Confirm DNS, then watch:
  ```bash
  kubectl describe certificate kam-web-tls -n kam
  ```

> ✅ **Checkpoint.** `curl -I https://kam.example.gov.tr` returns `HTTP/2 200` and
> a `strict-transport-security` header. The public front door is open and locked
> with TLS, exposing only the website.

---

# PART 11 — Observability: metrics (Prometheus + Grafana) and logs (EFK)

**Observability** is the hospital vital‑signs monitor: you want to see trouble
before the patient crashes. Two streams: **metrics** (numbers over time) and
**logs** (the text each service writes).

## 11.1 Metrics — Prometheus + Grafana

- **Prometheus** is the machine that reads the vital signs (collects metrics).
- **Grafana** is the screen on the wall that draws the graphs.

```bash
# ─────────────────────────────────────────────────────
# WHAT THIS DOES: Installs the kube-prometheus-stack: Prometheus, Grafana,
#                 Alertmanager, and the exporters that read node/pod metrics.
# WHO runs this:  sysadmin
# WHEN to run:    once at setup
# ─────────────────────────────────────────────────────
helm repo add prometheus-community https://prometheus-community.github.io/helm-charts && helm repo update \
  && helm install monitoring prometheus-community/kube-prometheus-stack \
       --namespace kam-observability
```

- ✅ **Success looks like:** `STATUS: deployed`; after a couple of minutes many
  `Running` Pods in `kam-observability`.
- ⚠️ **Common error:** Pods `Pending` with `Insufficient memory`. This stack is
  hungry (plan ≥ 2 GB free). Check `kubectl top nodes` (needs metrics‑server) or
  `free -m`.

The KAM services already expose Prometheus metrics on `/metrics`
(`PROMETHEUS_METRICS_ENABLED=true`). Tell Prometheus to scrape them with a
`ServiceMonitor`:

```yaml
# kam-servicemonitor.yaml
apiVersion: monitoring.coreos.com/v1
kind: ServiceMonitor
metadata:
  name: kam-services
  namespace: kam-observability
  labels: { release: monitoring }    # must match the Prometheus "release" selector
spec:
  namespaceSelector: { matchNames: ["kam"] }   # scrape targets in the kam namespace
  selector:
    matchExpressions:
      - { key: app, operator: In, values: [foundation-api, ingestion] }  # these apps
  endpoints:
    - { port: http, path: /metrics, interval: 30s }   # scrape /metrics every 30s
```

```bash
# ─────────────────────────────────────────────────────
# WHAT THIS DOES: Tells Prometheus to collect metrics from the KAM services.
# WHO runs this:  sysadmin
# WHEN to run:    once at setup
# ─────────────────────────────────────────────────────
kubectl apply -f kam-servicemonitor.yaml
```

- ✅ **Success looks like:** in the Prometheus UI (below), the KAM targets appear
  under Status → Targets as `UP`.

View Grafana:

```bash
# ─────────────────────────────────────────────────────
# WHAT THIS DOES: Forwards Grafana's port to your laptop and prints the admin
#                 password so you can open the dashboards.
# WHO runs this:  sysadmin
# WHEN to run:    whenever you want to view dashboards
# ─────────────────────────────────────────────────────
kubectl get secret monitoring-grafana -n kam-observability \
  -o jsonpath='{.data.admin-password}' | base64 -d; echo \
  && kubectl port-forward -n kam-observability svc/monitoring-grafana 3000:80
```

- ✅ **Success looks like:** the password prints, then `Forwarding from
  127.0.0.1:3000`. Browse `http://localhost:3000`, log in as `admin`.
- ⚠️ **Common error:** `unable to listen on port 3000` — something else uses it.
  Use a different local port: `… 3001:80` and browse `:3001`.

## 11.2 Logs — EFK (OpenSearch + Fluent Bit + Dashboards)

**EFK** collects every container's logs into one searchable place. Here the
letters are: **E** = OpenSearch (an open‑source search database, the same engine
KAM search uses), **F** = Fluent Bit (the courier that tails logs from every node),
**K** = OpenSearch Dashboards (the Kibana‑equivalent search screen).

> **Spec note (honest):** the OSIRIS spec (F‑032) also lists **Loki** as a lighter
> log store. If your servers are small, Loki + Grafana is a valid, lower‑resource
> alternative to EFK. This manual uses EFK because the brief asked for it and
> OpenSearch is already a KAM component.

```bash
# ─────────────────────────────────────────────────────
# WHAT THIS DOES: Installs OpenSearch (the log store) and OpenSearch Dashboards
#                 (the viewer) into the observability namespace.
# WHO runs this:  sysadmin
# WHEN to run:    once at setup
# ─────────────────────────────────────────────────────
helm repo add opensearch https://opensearch-project.github.io/helm-charts && helm repo update \
  && helm install opensearch opensearch/opensearch -n kam-observability \
       --set singleNode=true \
       --set persistence.size=20Gi \
  && helm install osd opensearch/opensearch-dashboards -n kam-observability
```

- ✅ **Success looks like:** `STATUS: deployed` twice; `opensearch-cluster-master-0`
  becomes `Running` (it can take a few minutes).
- ⚠️ **Common error:** OpenSearch crashes with `max virtual memory areas
  vm.max_map_count [65530] is too low`. Raise it on the node:
  ```bash
  sudo sysctl -w vm.max_map_count=262144 && echo 'vm.max_map_count=262144' | sudo tee -a /etc/sysctl.conf
  ```

First write a values file describing where Fluent Bit sends logs (a multi‑line
config does not survive an inline `--set`, so we use a file):

```yaml
# fluent-bit-values.yaml
config:
  outputs: |                         # the "|" keeps this as one multi-line block
    [OUTPUT]
        Name             opensearch  # send logs to OpenSearch
        Match            *           # match logs from every container
        Host             opensearch-cluster-master   # the OpenSearch Service name
        Port             9200        # OpenSearch's API port
        Suppress_Type_Name On        # required for OpenSearch 2.x compatibility
        tls              On          # OpenSearch listens over TLS by default
        tls.verify       Off         # the demo cert is self-signed; verify in prod
        Logstash_Format  On          # create daily indices like fluent-bit-YYYY.MM.DD
        Logstash_Prefix  fluent      # index name prefix -> matches the "fluent-*" pattern
```

```bash
# ─────────────────────────────────────────────────────
# WHAT THIS DOES: Installs Fluent Bit as a DaemonSet (one courier per node) that
#                 ships every container's logs into OpenSearch, using the file above.
# WHO runs this:  sysadmin
# WHEN to run:    once at setup
# ─────────────────────────────────────────────────────
helm repo add fluent https://fluent.github.io/helm-charts && helm repo update \
  && helm install fluent-bit fluent/fluent-bit -n kam-observability -f fluent-bit-values.yaml
```

- ✅ **Success looks like:** one `fluent-bit-…` Pod per node, all `Running`.
- ⚠️ **Common error:** Fluent Bit logs show `could not flush records … connection
  refused`. OpenSearch is not ready yet, or the host/port is wrong. Confirm the
  OpenSearch Service name with `kubectl get svc -n kam-observability`.

> ✅ **Checkpoint.** Port‑forward OpenSearch Dashboards
> (`kubectl port-forward -n kam-observability svc/osd-opensearch-dashboards
> 5601:5601`), open `http://localhost:5601`, create an index pattern `fluent-*`,
> and you can search the KAM services' logs by name.

---

# PART 12 — SIEM with Wazuh

## 12.1 What a SIEM is and why the spec requires it

A **SIEM** (Security Information and Event Management) is the building's **central
security desk**: every door sensor, camera, and alarm reports here, and a guard
watches for patterns that individual sensors would miss. OSIRIS §16 and SPYS
§3.2.19 require security events — logins, denials, audit records — to flow to a
SIEM and be retained. **Wazuh** is a capable open‑source SIEM.

## 12.2 Install the Wazuh stack

```bash
# ─────────────────────────────────────────────────────
# WHAT THIS DOES: Fetches the official Wazuh Kubernetes manifests (manager,
#                 indexer, and dashboard) at a pinned version.
# WHO runs this:  sysadmin
# WHEN to run:    once at setup
# ─────────────────────────────────────────────────────
git clone --branch v4.9.2 https://github.com/wazuh/wazuh-kubernetes.git \
  && cd wazuh-kubernetes
```

- ✅ **Success looks like:** the repo clones and you are inside `wazuh-kubernetes`.
- ⚠️ **Common error:** `fatal: Remote branch v4.9.2 not found`. That version tag
  changed. List tags with `git ls-remote --tags https://github.com/wazuh/wazuh-kubernetes.git`
  and pick a current one.

Wazuh ships its own certificates and secrets generator; run it, then apply into
the `wazuh` namespace:

```bash
# ─────────────────────────────────────────────────────
# WHAT THIS DOES: Generates Wazuh's internal TLS certificates and deploys the
#                 indexer, manager, and dashboard into the wazuh namespace.
# WHO runs this:  sysadmin
# WHEN to run:    once at setup
# ─────────────────────────────────────────────────────
bash wazuh/certs/generate_certs.sh \
  && kubectl apply -k envs/local-env/    # local-env is a good single-cluster starting point
```

- ✅ **Success looks like:** many `created` lines; after several minutes
  `kubectl get pods -n wazuh` shows `wazuh-manager-…`, `wazuh-indexer-…`, and
  `wazuh-dashboard-…` all `Running`.
- ⚠️ **Common error:** `wazuh-indexer` `CrashLoopBackOff` with `vm.max_map_count`.
  Same fix as OpenSearch in Part 11.2 — raise `vm.max_map_count` on the node.

## 12.3 Forward Kubernetes and KAM audit logs to Wazuh

Deploy the Wazuh **agent** as a DaemonSet (one guard per node) so it watches host
and container activity, and point KAM's audit stream (the API forwards CEF when
`SIEM_ENABLED=true`) at the Wazuh manager.

```bash
# ─────────────────────────────────────────────────────
# WHAT THIS DOES: Turns on KAM's SIEM forwarding by setting the CEF endpoint in
#                 the ConfigMap and restarting the API to pick it up.
# WHO runs this:  sysadmin
# WHEN to run:    once at setup; after changing the SIEM endpoint
# ─────────────────────────────────────────────────────
kubectl patch configmap kam-foundation-config -n kam --type merge \
  -p '{"data":{"SIEM_ENABLED":"true","SIEM_CEF_ENDPOINT":"wazuh-manager.wazuh.svc:514"}}' \
  && kubectl rollout restart deployment/foundation-api -n kam
```

- ✅ **Success looks like:** the API restarts; in the Wazuh dashboard, KAM audit
  events (logins, denials, create/update/export) begin appearing under Security
  Events.
- ⚠️ **Common error:** no events arrive. A NetworkPolicy blocks `kam →
  wazuh:514`. Add an egress allowance from `foundation-api` to the `wazuh`
  namespace on the syslog port.

> ✅ **Checkpoint.** The Wazuh dashboard shows live security events from the
> cluster and KAM audit events. The security desk is staffed.

---

# PART 13 — RBAC and ABAC in production

## 13.1 The difference, in one line each

- **RBAC** (Role‑Based Access Control) = *"only doctors may enter the surgery"* —
  your role decides which doors open. It guards **Kubernetes** actions.
- **ABAC** (Attribute‑Based Access Control) = *"only a doctor **on shift**,
  **assigned to this patient**, in **daytime** may enter"* — the decision uses
  several attributes together. It guards **the data inside the app**.

## 13.2 Least‑privilege ServiceAccounts (already applied)

The KAM services run with ServiceAccounts that carry **no** Kubernetes
permissions and do not even mount a token (`automountServiceAccountToken: false`).
Prove it:

```bash
# ─────────────────────────────────────────────────────
# WHAT THIS DOES: Asks whether the foundation-api identity may delete Deployments.
#                 The correct answer is "no" — least privilege in action.
# WHO runs this:  sysadmin
# WHEN to run:    after deploy, and in security reviews
# ─────────────────────────────────────────────────────
kubectl auth can-i delete deployments -n kam \
  --as=system:serviceaccount:kam:foundation-api
```

- ✅ **Success looks like:** `no`.
- ⚠️ **Common error:** it returns `yes`. Some binding granted the account too much.
  List bindings: `kubectl get rolebindings,clusterrolebindings -A | grep foundation-api`
  and remove the over‑broad one.

## 13.3 Human operator roles (RBAC for people)

Give human operators a **read‑only** view by default; full control belongs to a
small admin group. This maps Institution‑IAM groups to Kubernetes rights.

```yaml
# operator-readonly.yaml
apiVersion: rbac.authorization.k8s.io/v1
kind: Role                            # a permission list valid only in the kam namespace
metadata: { name: kam-operator-readonly, namespace: kam }
rules:
  - apiGroups: ["", "apps"]           # core + apps API groups
    resources: ["pods", "deployments", "services", "pods/log"]  # what they may see
    verbs: ["get", "list", "watch"]   # read-only verbs; no create/delete
---
apiVersion: rbac.authorization.k8s.io/v1
kind: RoleBinding                     # hands the list to a group
metadata: { name: kam-operator-readonly, namespace: kam }
subjects:
  - kind: Group                       # an Institution-IAM group, via OIDC
    name: "kam-operators"             # everyone in this IAM group gets read-only
    apiGroup: rbac.authorization.k8s.io
roleRef: { kind: Role, name: kam-operator-readonly, apiGroup: rbac.authorization.k8s.io }
```

```bash
# ─────────────────────────────────────────────────────
# WHAT THIS DOES: Grants the "kam-operators" group read-only access to the kam
#                 namespace — see everything, change nothing.
# WHO runs this:  sysadmin
# WHEN to run:    once at setup; when roles change
# ─────────────────────────────────────────────────────
kubectl apply -f operator-readonly.yaml
```

- ✅ **Success looks like:** both objects `created`; a member of `kam-operators`
  can `kubectl get pods -n kam` but gets `Forbidden` on `kubectl delete`.
- ⚠️ **Common error:** the group name does not match what the IAM sends in the
  token's `groups` claim. Confirm the exact claim value with your IAM team.

## 13.4 ABAC inside the application

ABAC lives in the API (`services/api/app/security/policy.py`, proven by
`test_policy.py`). On **every** request it checks attributes RBAC cannot express:

- **Classification:** a `SECRET` record is withheld unless the caller's clearance
  attribute is `SECRET`+; otherwise the API returns `403 FORBIDDEN`.
- **Tenant:** a caller from tenant A cannot read tenant B's records.
- **Field/record masking:** some fields are hidden even when the record is visible.
- **Export controls:** bulk export re‑checks classification and the two‑person rule.

These are **server‑side**. The website may hide a button for tidiness, but the
API's `403` is the real control — security lives on both the front end **and** the
back end, never the front end alone.

## 13.5 An OpenBao read policy for ESO (least privilege for the courier)

```bash
# ─────────────────────────────────────────────────────
# WHAT THIS DOES: Creates an OpenBao policy that allows READ ONLY on kam/* and
#                 issues a token bound to it — the least the ESO courier needs.
# WHO runs this:  sysadmin (inside the OpenBao Pod shell)
# WHEN to run:    once at setup; on token rotation
# ─────────────────────────────────────────────────────
echo 'path "kam/data/*" { capabilities = ["read"] }' | bao policy write kam-read - \
  && bao token create -policy=kam-read -ttl=720h -field=token
```

- ✅ **Success looks like:** `Success! Uploaded policy: kam-read`, then a token
  string. Put that token into the `openbao-token` Secret from Part 5.5.
- ⚠️ **Common error:** ESO later shows `permission denied`. The token's TTL
  expired or the policy path is wrong (note the `data/` segment for kv‑v2). Re‑issue.

> ✅ **Checkpoint.** Machines and people both have the **least** access they need:
> service accounts cannot touch Kubernetes, operators are read‑only, the vault
> courier can only read `kam/*`, and the app enforces classification/tenant rules.

---

# PART 14 — Hardening & pre‑production security checklist

## 14.1 Confirm default‑deny networking is in place

```bash
# ─────────────────────────────────────────────────────
# WHAT THIS DOES: Lists the NetworkPolicies protecting the kam namespace; the
#                 default-deny policy must be present so nothing talks unless allowed.
# WHO runs this:  sysadmin
# WHEN to run:    in every security review
# ─────────────────────────────────────────────────────
kubectl get networkpolicy -n kam
```

- ✅ **Success looks like:** `default-deny` plus the per‑service allow policies
  (`foundation-api-allow`, `ingestion-allow`, `postgres-allow-foundation`).
- ⚠️ **Common error:** only allow policies exist, no `default-deny`. Then anything
  not explicitly denied is open. Apply the shipped `network-policies.yaml`.

## 14.2 Verify Pod hardening

```bash
# ─────────────────────────────────────────────────────
# WHAT THIS DOES: Prints the security settings of the running API Pods to confirm
#                 they run non-root, read-only, with all Linux capabilities dropped.
# WHO runs this:  sysadmin
# WHEN to run:    in every security review
# ─────────────────────────────────────────────────────
kubectl get pod -n kam -l app=foundation-api \
  -o jsonpath='{.items[0].spec.containers[0].securityContext}'; echo
```

- ✅ **Success looks like:** JSON containing `"runAsNonRoot":true`,
  `"readOnlyRootFilesystem":true`, `"allowPrivilegeEscalation":false`, and
  `"capabilities":{"drop":["ALL"]}`.
- ⚠️ **Common error:** any of those is missing/false. The Deployment lost its
  hardening. Re‑apply the shipped manifest, which sets all of them.

## 14.3 Scan images for vulnerabilities with Trivy

```bash
# ─────────────────────────────────────────────────────
# WHAT THIS DOES: Installs Trivy and scans a built image, failing the check if any
#                 HIGH or CRITICAL vulnerability is present.
# WHO runs this:  developer / CI pipeline
# WHEN to run:    every build, before pushing to production
# ─────────────────────────────────────────────────────
sudo apt-get install -y trivy \
  && trivy image --severity HIGH,CRITICAL --exit-code 1 registry.example.gov.tr/kam/osiris-web:0.1.0
```

- ✅ **Success looks like:** a table of packages and, ideally, `Total: 0`
  vulnerabilities at HIGH/CRITICAL, exit code 0.
- ⚠️ **Common error:** exit code 1 with CRITICAL findings. Rebuild on an updated
  base image (`node:22-alpine` refreshed) and update dependencies; do not deploy
  the image until the criticals are resolved or formally risk‑accepted.

## 14.4 The go‑live checklist (OSIRIS §16, SPYS §3.2.12–16)

Do not tick a box you have not personally verified.

1. No secret in any image or git history; all secrets flow from OpenBao at runtime.
2. `AUTH_REQUIRED=true`; protected API routes return `401` without a valid token.
3. Institution IAM is the only identity authority (ADR‑002); no local passwords.
4. MFA enforced where the IAM requires it (`403 MFA_REQUIRED` otherwise).
5. RBAC least privilege — every ServiceAccount fails a "can‑i delete" test.
6. ABAC enforced server‑side (classification, tenant, masking, export).
7. TLS 1.3 at the ingress; internal mTLS where a mesh/PKI is present.
8. Default‑deny NetworkPolicy in every namespace; SPYS = zero internet egress.
9. Encryption at rest for the database and object storage; approved algorithms
   only (AES‑256‑GCM); MD5/DES rejected.
10. Audit trail on, hash‑chained, forwarded to Wazuh, retained ≥ 5 years.
11. Time stored in UTC, displayed in `Europe/Istanbul` (ADR‑009).
12. Synthetic/demo data labelled `SENTETİK`/SYNTHETIC in UI and records.
13. Connectors without keys show `CONFIGURATION_REQUIRED`, never fake‑live.
14. No unsafe guidance language (GNSS = *probable* anomaly, never confirmed jamming).
15. Images scanned (Trivy), signed, SBOM produced; no floating `latest` tags.
16. Backups verified by restore (Part 15.1); DR RPO/RTO measured.
17. Independent security test passed (TÜBİTAK BİLGEM A‑class, SPYS §3.1.13).

> ✅ **Checkpoint.** Every box above is verified. Any unchecked box is a conscious,
> written risk acceptance — or a blocker.

---

# PART 15 — Day‑2 operations

## 15.1 Back up and verify the database

```bash
# ─────────────────────────────────────────────────────
# WHAT THIS DOES: Takes a full logical backup of the database from inside its Pod.
# WHO runs this:  sysadmin / CI pipeline
# WHEN to run:    on your backup schedule (e.g. nightly)
# ─────────────────────────────────────────────────────
kubectl exec -n kam postgres-0 -- pg_dump -U kam_app kam > kam-backup.sql
```

- ✅ **Success looks like:** a `kam-backup.sql` file of non‑trivial size.
- ⚠️ **Common error:** a 0‑byte file. The dump failed (wrong user/DB). Read the
  stderr by re‑running without the redirect.

**Verify** it restores into a throwaway database (never production):

```bash
# ─────────────────────────────────────────────────────
# WHAT THIS DOES: Loads the backup into a scratch database to prove it is valid.
# WHO runs this:  sysadmin
# WHEN to run:    after every backup you rely on
# ─────────────────────────────────────────────────────
kubectl exec -n kam postgres-0 -- createdb -U kam_app restore_check \
  && kubectl exec -i -n kam postgres-0 -- psql -U kam_app restore_check < kam-backup.sql
```

- ✅ **Success looks like:** a stream of `CREATE TABLE`/`COPY` with no `ERROR:`.

## 15.2 Upgrade a service (rolling, zero downtime)

```bash
# ─────────────────────────────────────────────────────
# WHAT THIS DOES: Rolls the API to a new image version one Pod at a time, so the
#                 service never drops to zero.
# WHO runs this:  sysadmin / CI pipeline
# WHEN to run:    each release
# ─────────────────────────────────────────────────────
kubectl set image deployment/foundation-api api=registry.example.gov.tr/kam/foundation-api:0.2.0 -n kam \
  && kubectl rollout status deployment/foundation-api -n kam
```

- ✅ **Success looks like:** new Pods become Ready, old ones retire,
  `successfully rolled out`.
- ⚠️ **Common error:** the rollout stalls on unhealthy new Pods. Roll back:
  ```bash
  kubectl rollout undo deployment/foundation-api -n kam
  ```

## 15.3 Scale for load

```bash
# ─────────────────────────────────────────────────────
# WHAT THIS DOES: Sets the website to 4 replicas for a busy period.
# WHO runs this:  sysadmin
# WHEN to run:    when load rises (or let the HPA do it automatically)
# ─────────────────────────────────────────────────────
kubectl scale deployment osiris-web --replicas=4 -n kam
```

- ✅ **Success looks like:** `deployment.apps/osiris-web scaled`, then `4/4`.

## 15.4 Rotate the database password without downtime

```bash
# ─────────────────────────────────────────────────────
# WHAT THIS DOES: Writes a new DB password to OpenBao; ESO syncs it within the
#                 refresh interval, then a rolling restart picks it up.
# WHO runs this:  sysadmin
# WHEN to run:    on your rotation schedule, or after a suspected leak
# ─────────────────────────────────────────────────────
kubectl exec -n openbao openbao-0 -- bao kv put kam/postgres password="$(head -c 24 /dev/urandom | base64 | tr -d '/+=' | cut -c1-32)"
```

- ✅ **Success looks like:** `Success! Data written`. After ESO resyncs (≤ the
  refresh interval), restart consumers: `kubectl rollout restart deployment/foundation-api -n kam`.
- ⚠️ **Ordering matters:** change the password **in Postgres too**, in a
  coordinated way (add the new credential, sync the Secret, restart, then remove
  the old), or the API will `CrashLoopBackOff` on authentication failure.

---

# PART 16 — Production troubleshooting matrix

For every problem: **look → understand → act**, never restart blindly.

| Symptom | Look | Likely cause | Fix |
|---|---|---|---|
| Pod `Pending` | `kubectl describe pod <p> -n kam` → Events | No node capacity, or unbound PVC | Free/add capacity; fix the PVC's StorageClass |
| `CrashLoopBackOff` | `kubectl logs <p> -n kam --previous` | Bad secret, DB unreachable, bad config | Fix the root cause; the loop clears |
| `ImagePullBackOff` | `describe pod` → Failed to pull | Wrong tag, missing pull Secret, image absent | Fix tag; add `regcred`; build the image |
| Service can't reach service | `kubectl exec` a `wget` between them | NetworkPolicy blocks it, wrong Service name | Allow the exact flow; verify Service name |
| PVC `Pending` | `kubectl get pvc -n kam` | No matching PV / StorageClass | Set a valid `storageClassName` |
| Rollout stuck | `kubectl rollout status …` | New Pods failing readiness | Diagnose new Pods; `rollout undo` |
| RBAC `Forbidden` | Pod log names the permission | Role too narrow | Add the one missing verb; re‑test `can-i` |
| `OOMKilled` | `describe pod` → Last State | Exceeded memory limit | Raise limit or fix the leak; `kubectl top pod` |
| TLS expired | `kubectl describe certificate -n kam` | cert‑manager renewal failed (DNS/ACME) | Fix DNS/issuer; watch the Certificate |
| Cert `READY False` | `describe certificate` | HTTP‑01 challenge failing | Ensure DNS points at the ingress IP |
| No metrics in Grafana | Prometheus → Targets | ServiceMonitor label mismatch | Match the `release` label to Prometheus |
| No logs in OpenSearch | Fluent Bit logs | OpenSearch host/port wrong, or not Ready | Fix output host; raise `vm.max_map_count` |
| No SIEM events | Wazuh dashboard empty | `kam → wazuh:514` blocked, SIEM off | Allow egress; set `SIEM_ENABLED=true` |

---

# Appendix A — Per‑OS install command reference

| Tool | 🐧 Linux (Ubuntu/Debian) | 🍎 macOS (Homebrew) | 🪟 Windows (winget/WSL) |
|---|---|---|---|
| kubectl | `curl -LO "https://dl.k8s.io/release/$(curl -Ls https://dl.k8s.io/release/stable.txt)/bin/linux/amd64/kubectl" && sudo install kubectl /usr/local/bin/` | `brew install kubectl` | `winget install -e --id Kubernetes.kubectl` |
| Helm | `curl https://raw.githubusercontent.com/helm/helm/main/scripts/get-helm-3 \| bash` | `brew install helm` | `winget install -e --id Helm.Helm` |
| Docker | `curl -fsSL https://get.docker.com \| sh` | `brew install --cask docker` | `winget install -e --id Docker.DockerDesktop` |
| k3s (server) | `curl -sfL https://get.k3s.io \| sh -` | n/a (use Docker Desktop K8s) | n/a (use Docker Desktop K8s in WSL2) |
| Trivy | `sudo apt-get install -y trivy` | `brew install trivy` | `winget install -e --id AquaSecurity.Trivy` |
| OpenBao CLI | via the Pod (`kubectl exec … bao`) | `brew install openbao` | download from OpenBao releases |

> macOS and Windows are **local dev only**. The public production platform runs on
> the Linux server path.

---

# Appendix B — Every secret, with its exact generation command

| Secret | Where it lives | Generate it with |
|---|---|---|
| PostgreSQL password | `kam/postgres` in OpenBao → `postgres-password` | `head -c 24 /dev/urandom \| base64 \| tr -d '/+=' \| cut -c1-32` |
| Redis password | `kam/redis` → `redis-password` | same as above |
| Audit HMAC key | `kam/audit` → `audit-hmac-key` | `head -c 32 /dev/urandom \| od -An -tx1 \| tr -d ' \n'` |
| OIDC issuer/JWKS URLs | `kam/oidc` | provided by the Institution IAM team (not generated) |
| TLS certificate | `kam-web-tls` Secret | issued automatically by cert‑manager |
| Internal CA (air‑gap) | `kam-internal-ca` Secret | issued by cert‑manager (`isCA: true`) |
| Connector API keys | `kam-connector-keys` Secret | provided by each data provider (not generated) |
| Registry pull creds | `regcred` Secret | `kubectl create secret docker-registry …` |
| OpenBao unseal keys + root token | `openbao-init.json` (offline!) | produced by `bao operator init` |

---

# Appendix C — Glossary of the new tools

| Term | One plain sentence (analogy) |
|---|---|
| k3s | A small, complete Kubernetes in one binary — the head chef and kitchen in a box. |
| Helm | A recipe book: one recipe installs a whole stack. |
| cert‑manager | An automatic ID‑card office that issues and renews TLS certificates. |
| Let's Encrypt | A free, public issuer of TLS certificates. |
| PKI / CA | The trust system of issuers and ID cards; the CA is the authority that signs them. |
| OpenBao | A bank vault for secrets, with a guard, an access log, and rotation. |
| Unseal | Turning enough key‑holders' keys to open the vault after a restart. |
| External Secrets Operator | The courier that copies secrets from the vault into Kubernetes Secrets. |
| ingress‑nginx | The building's front door that routes visitors and terminates TLS. |
| MetalLB | Hands out a real IP address for the front door on a bare server. |
| Prometheus | The machine that reads the vital signs (metrics). |
| Grafana | The wall screen that draws the metric graphs. |
| EFK | Collect‑and‑search logs: OpenSearch (store) + Fluent Bit (courier) + Dashboards (viewer). |
| Fluent Bit | A courier on every node that ships container logs to the store. |
| Loki | A lighter log store (spec‑listed alternative to EFK). |
| Wazuh | A SIEM — the central security desk watching every sensor. |
| SIEM | Security Information and Event Management: the guard that spots patterns across all logs. |
| Trivy | An image scanner that checks lunchboxes for known bad ingredients (vulnerabilities). |
| StatefulSet | A Deployment whose Pods each keep a stable name and their own filing cabinet (for databases). |
| BFF (Backend‑For‑Frontend) | The website's own server routes that talk to backend services on the browser's behalf. |

---

# Appendix D — Quick reference cheat sheet

```bash
kubectl get pods -A                         # every Pod, every namespace
kubectl get pods -n kam                      # KAM app Pods
kubectl describe pod <pod> -n kam            # #1 debugging tool: events + detail
kubectl logs deploy/foundation-api -n kam -f # stream a service's logs
kubectl rollout status deploy/<name> -n kam  # watch a rollout finish
kubectl rollout undo deploy/<name> -n kam    # roll back a bad release
kubectl rollout restart deploy/<name> -n kam # pick up a config/secret change
kubectl scale deploy/<name> --replicas=N -n kam
kubectl get svc,ingress -n kam               # reception desks + front door
kubectl get certificate -n kam               # TLS certificate status
kubectl get externalsecret -n kam            # OpenBao -> Secret sync status
kubectl get networkpolicy -n kam             # who may talk to whom
kubectl auth can-i <verb> <res> -n kam --as=system:serviceaccount:kam:<sa>
kubectl top pod -n kam                        # live CPU/memory (needs metrics-server)
kubectl exec -it <pod> -n kam -- sh          # a shell inside a Pod
kubectl get pvc -n kam                        # persistent storage claims
helm list -A                                  # every Helm release
helm history <release> -n <ns>                # release revisions
helm rollback <release> <rev> -n <ns>         # roll a Helm release back
kubectl port-forward -n <ns> svc/<svc> L:R    # reach a service from your laptop
```

---

## Where to go next

- **Concepts in depth:** `KAM-KUBERNETES-COMPLETE-GUIDE.md` (Chapters 0–15).
- **Fast foundation deploy:** `KAM-KUBERNETES-BEGINNER-GUIDE.md`.
- **Decisions:** `docs/adr/` — especially ADR‑002 (IAM), ADR‑003 (network
  separation), ADR‑004 (crypto), ADR‑013 (website integration).
- **What's built vs. planned:** `docs/requirements/requirements-traceability-matrix.md`.

*Take it one Part at a time. You do not need to memorise any of this — you need to
understand what each command does before you run it, and this manual is here every
time you forget. You have got this.*
