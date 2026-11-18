## Threat Model for qs (querystring parsing library)

### 1. Library Overview

- **Library Name:** qs
- **Brief Description:** A JavaScript library for parsing and stringifying URL query strings, supporting nested objects and arrays. It is widely used in Node.js and web applications for processing query parameters[2][6][8].
- **Key Public APIs/Functions:** `qs.parse()`, `qs.stringify()`

### 2. Define Scope

This threat model focuses on the core parsing and stringifying functionality, specifically the handling of nested objects and arrays, option validation, and cycle management in stringification.

### 3. Conceptual System Diagram

```
Caller Application → qs.parse(input, options) → Parsing Engine → Output Object
                           │
                           └→ Options Handling

Caller Application → qs.stringify(obj, options) → Stringifying Engine → Output String
                           │
                           └→ Options Handling
                           └→ Cycle Tracking
```

**Trust Boundaries:**
- **Input string (parse):** May come from untrusted sources (e.g., user input, network requests). `qs` defines its own key grammar, where bracket groups denote nesting, so the parameter names it derives are deliberately not the flat names produced by `URLSearchParams`, `node:querystring`, or a WHATWG-conformant parser. The parsed object, not the raw string, is the only thing a caller should make trust decisions about; see "Interpretation conflict" below.
- **Input object (stringify):** The calling application's own data, not a direct untrusted channel. May contain cycles (handled by the cycle detector). Deeply-nested non-cyclic input surfaces as a catchable synchronous `RangeError` (stack overflow), not unbounded resource consumption; callers that serialize externally-influenced objects should bound their depth/size beforehand.
- **Options:** Provided by the caller
- **Cycle Tracking:** Used only during stringification to detect and handle circular references

### 4. Identify Assets

- **Integrity of parsed output:** Prevent malicious manipulation of the output object structure, especially ensuring builtins/globals are not modified as a result of parse[3][4][8].
- **Confidentiality of processed data:** Avoid leaking sensitive information through errors or output.
- **Availability/performance for host application:** Prevent crashes or resource exhaustion in the consuming application.
- **Security of host application:** Prevent the library from being a vector for attacks (e.g., prototype pollution, DoS).
- **Reputation of library:** Maintain trust by avoiding supply chain attacks and vulnerabilities[1].

### 5. Identify Threats

| Component / API / Interaction         | S  | T  | R  | I  | D  | E  |
|---------------------------------------|----|----|----|----|----|----|
| Public API Call (`parse`)             | –  | ✓  | –  | ✓  | ✓  | ✓  |
| Public API Call (`stringify`)         | –  | ✓  | –  | ✓  | ✓  | –  |
| Options Handling                      | ✓  | ✓  | –  | ✓  | –  | ✓  |
| Dependency Interaction                | –  | –  | –  | –  | ✓  | –  |

**Key Threats:**
- **Tampering:** Malicious input can, if not prevented, alter parsed output (e.g., prototype pollution via `__proto__`, modification of builtins/globals)[3][4][8].
- **Information Disclosure:** Error messages may expose internal details or sensitive data.
- **Denial of Service:** Large or malformed input can exhaust memory or CPU.
- **Elevation of Privilege:** Prototype pollution can lead to unintended privilege escalation in the host application[3][4][8].
- **Interpretation conflict (out of scope):** An application that parses the same query string with two different parsers, and makes a trust decision on one result while consuming the other, can be attacked by any input the two parsers read differently. `qs`'s bracket grammar guarantees such inputs exist, so this is a property of the deployment, not a defect `qs` can remove. It is the calling application's responsibility to parse once and validate the parsed object.

### 6. Mitigation/Countermeasures

| Threat Identified                                 | Proposed Mitigation |
|---------------------------------------------------|---------------------|
| Tampering (malicious input, prototype pollution)  | Strict input validation; keep `allowPrototypes: false` by default; use `plainObjects` for output; ensure builtins/globals are never modified by parse[4][8]. |
| Information Disclosure (error messages)           | Generic error messages without stack traces or internal paths. |
| Denial of Service (memory/CPU exhaustion)         | `arrayLimit`, `parameterLimit`, and depth limiting apply with safe defaults. Note that `arrayLimit` is a representation threshold (array vs. object), and `parameterLimit` bounds only the number of `&`-delimited parameters - neither caps the elements produced by `comma: true` splitting. For hard caps on the number of parameters and on each array's length, opt in to `throwOnLimitExceeded: true` (default `false`), which rejects a query string with more than `parameterLimit` parameters, or one that would produce any array longer than `arrayLimit`. `arrayLimit` applies to each array separately, including each parameter's comma-split value, so the total number of values can still reach `parameterLimit` times `arrayLimit`; always bound input size at the transport layer as well[7]. On the `stringify` side, the input is the caller's own object rather than an untrusted string, so unbounded nesting manifests as a catchable `RangeError` (stack overflow) rather than exhaustion; callers serializing externally-influenced objects should bound depth/size beforehand, and may opt into `stringify`'s `depth` option (default `Infinity`) for a deterministic, catchable error. |
| Elevation of Privilege (prototype pollution)      | Keep `allowPrototypes: false`; validate options against allowlist; use `plainObjects` to avoid prototype pollution[4][8]. |
| Interpretation conflict (validate-then-use across two parsers) | None available inside `qs`, by construction: `qs` and a flat parser disagree about parameter names for well-formed input, so no hardening can make the two views equal. Parse untrusted input once, with `qs`, and apply deny lists, authorization, and signature checks to the parsed object rather than to raw key text. Text that `qs` cannot place in its grammar is currently dropped, so distinct raw names can share one parsed path ([#619](https://github.com/ljharb/qs/issues/619)). |

### 7. Risk Ranking

- **High:** Denial of Service via array parsing or malformed input (historical vulnerability)
- **Medium:** Prototype pollution via options or input (if `allowPrototypes` enabled)
- **Low:** Information disclosure in errors

### 8. Next Steps & Review

1. **Audit option validation logic.**
2. **Depth limiting:** `parse` enforces a `depth` bound by default (with `strictDepth` to throw); `stringify` offers an opt-in `depth` bound (default `Infinity`, since its input is caller-produced) for defense-in-depth.
3. **Implement fuzz testing for parser and stringifier edge cases.**
4. **Regularly review dependencies for vulnerabilities.**
5. **Keep documentation and threat model up to date.**
6. **Ensure builtins/globals are never modified as a result of parse.**
7. **Support round-trip consistency between parse and stringify as a non-security goal, with the right options[5][9].**
