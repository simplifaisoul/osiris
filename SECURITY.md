# Security Policy

## Responsible Usage
The OSIRIS Project provides powerful Open Source Intelligence (OSINT) and cybersecurity monitoring tools designed to visualize and analyze global threat landscapes.

**By using this software, you agree to the following:**
1. **Defensive Use Only:** The tools, scripts, and intelligence capabilities provided in this repository must be used strictly for defensive, educational, and authorized monitoring purposes.
2. **Authorized Targets:** Do not use OSIRIS to scan, probe, or interact with infrastructure, networks, or systems that you do not own or have explicit authorization to monitor.
3. **Compliance with Laws:** You are responsible for ensuring that your use of OSIRIS complies with all applicable local, state, national, and international laws and regulations.
4. **No Malicious Intent:** Any use of OSIRIS for malicious activities, offensive cyber operations, or unauthorized data harvesting is strictly prohibited.

The creators and contributors of OSIRIS are not responsible for any misuse or damage caused by this software. Use it responsibly and ethically.

## Strix autonomous pentesting module

OSIRIS can optionally integrate [Strix](https://github.com/usestrix/strix), an autonomous
AI penetration-testing agent that **actively exploits** vulnerabilities (it fires real
SQLi / SSRF / RCE / XSS payloads and validates them with working proofs-of-concept). This
is a powerful, dual-use capability and is treated accordingly:

1. **Off by default.** The feature is inert unless `STRIX_URL`, `STRIX_KEY`, and
   `OPERATOR_KEY` are all set. The public/demo deployment does not set them, so the feature
   does not exist there.
2. **Private, authenticated deployments only.** Never enable Strix on a public or anonymous
   deployment. The OSIRIS proxy requires a per-operator key (`OPERATOR_KEY`), and the Strix
   backend requires a shared key (`STRIX_KEY`) — both must be present for any request to run.
3. **Authorized targets only.** Only launch Strix against systems you own or are explicitly
   authorized to test. Internal / RFC1918 / cloud-metadata targets are blocked by default
   (override only for your own assets via `STRIX_ALLOW_INTERNAL=1`).
4. **Auditable & rate-limited.** The backend logs every target and run; the proxy rate-limits
   launches. See `strix-backend/README.md` for the self-hosting and safety details.

Running Strix is your responsibility and must comply with all applicable laws.

## Reporting a Vulnerability

We take the security of our project seriously. If you discover a security vulnerability within the OSIRIS codebase itself, please do not disclose it publicly.

**To report a vulnerability:**
1. Please open an issue in the GitHub repository and label it appropriately, or contact the repository maintainers directly if a private channel is available.
2. Provide a detailed description of the vulnerability, including steps to reproduce it and the potential impact.
3. Our team will acknowledge the receipt of your report and provide an estimated timeline for resolution.

We appreciate your efforts in keeping OSIRIS secure for everyone!
