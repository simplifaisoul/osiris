2.0.8
=====

  * Fix [CVE-2026-90711](https://www.cve.org/CVERecord?id=CVE-2026-90711) ([GHSA-jqcg-44mw-7w3h](https://github.com/jshttp/proxy-addr/security/advisories/GHSA-jqcg-44mw-7w3h))


2.0.7
=====

  * deps: forwarded@0.2.0
    - Use `req.socket` over deprecated `req.connection`

2.0.6
=====

  * deps: ipaddr.js@1.9.1

2.0.5
=====

  * deps: ipaddr.js@1.9.0

2.0.4
=====

  * deps: ipaddr.js@1.8.0

2.0.3
=====

  * deps: ipaddr.js@1.6.0

2.0.2
=====

  * deps: forwarded@~0.1.2
    - perf: improve header parsing
    - perf: reduce overhead when no `X-Forwarded-For` header

2.0.1
=====

  * deps: forwarded@~0.1.1
    - Fix trimming leading / trailing OWS
    - perf: hoist regular expression
  * deps: ipaddr.js@1.5.2

2.0.0
=====

  * Drop support for Node.js below 0.10

1.1.5
=====

  * Fix array argument being altered
  * deps: ipaddr.js@1.4.0

1.1.4
=====

  * deps: ipaddr.js@1.3.0

1.1.3
=====

  * deps: ipaddr.js@1.2.0

1.1.2
=====

  * deps: ipaddr.js@1.1.1
    - Fix IPv6-mapped IPv4 validation edge cases

1.1.1
=====

  * Fix regression matching mixed versions against multiple subnets

1.1.0
=====

  * Fix accepting various invalid netmasks
    - IPv4 netmasks must be contingous
    - IPv6 addresses cannot be used as a netmask
  * deps: ipaddr.js@1.1.0

1.0.10
======

  * deps: ipaddr.js@1.0.5
    - Fix regression in `isValid` with non-string arguments

1.0.9
=====

  * deps: ipaddr.js@1.0.4
    - Fix accepting some invalid IPv6 addresses
    - Reject CIDRs with negative or overlong masks
  * perf: enable strict mode

1.0.8
=====

  * deps: ipaddr.js@1.0.1

1.0.7
=====

  * deps: ipaddr.js@0.1.9
    - Fix OOM on certain inputs to `isValid`

1.0.6
=====

  * deps: ipaddr.js@0.1.8

1.0.5
=====

  * deps: ipaddr.js@0.1.6

1.0.4
=====

  * deps: ipaddr.js@0.1.5
    - Fix edge cases with `isValid`

1.0.3
=====

  * Use `forwarded` npm module

1.0.2
=====

  * Fix a global leak when multiple subnets are trusted
  * Support Node.js 0.6
  * deps: ipaddr.js@0.1.3

1.0.1
=====

  * Fix links in npm package

1.0.0
=====

  * Add `trust` argument to determine proxy trust on
    * Accepts custom function
    * Accepts IPv4/IPv6 address(es)
    * Accepts subnets
    * Accepts pre-defined names
  * Add optional `trust` argument to `proxyaddr.all` to
    stop at first untrusted
  * Add `proxyaddr.compile` to pre-compile `trust` function
    to make subsequent calls faster

0.0.1
=====

  * Fix bad npm publish

0.0.0
=====

  * Initial release
