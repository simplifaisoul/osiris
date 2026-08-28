# Optional Lattice layer (ontology COP)

This Osiris tree vendors [osiris-lattice](https://github.com/Polybolos-Institute/osiris-lattice) under `src/lib/lattice/`. The layer is **default off**. Stock Osiris is unchanged until you set `LATTICE_ENABLED=1` and OAuth env vars.

Read the full argument there: [OSIRIS_ONTOLOGY.md](https://github.com/Polybolos-Institute/osiris-lattice/blob/main/docs/OSIRIS_ONTOLOGY.md)

## What this is trying to do

Osiris is already a global OSINT map. Public flights, cameras, hazards, news. Those dots are usually **untyped**: a lat/lon and a homegrown label.

Anduril Lattice already types the live world: `platformType`, `specificType`, disposition, environment, provenance, entityId. That is an operational **ontology** (shared catalog of what each object is), not a research knowledge graph.

This optional layer lets Osiris **sit on that catalog**:

- Connect to a Lattice env (or [anduril-mock-lattice](https://github.com/Polybolos-Institute/anduril-mock-lattice)).
- Draw tracks **without stripping ontology**. Click a point: platform, subtype, disposition, environment, fail-closed class (or explicit unknown).
- Disconnect with `LATTICE_ENABLED=0`. Every other Osiris layer keeps running. Credentials can stay in env.
- Never invent `SMALL_UAS` (or any combat class) for an empty or unknown Lattice type.

That is how open Osiris becomes a serious platform for people developing on Lattice: OSINT plus a typed common picture. It is **not** a Lattice C2 clone and **not** an engagement engine. ROE and authority stay in whatever C2 you already run.

## Capabilities in this PR

| You get | You do not get |
|---------|----------------|
| Hidden layer until configured (same pattern as Cloudflare Radar) | Layer on by default |
| `GET /api/lattice?probe=1` | Secrets in git |
| `GET /api/lattice` FeatureCollection with ontology on properties | Mapping into a private engage ICD |
| Map dots + click inspector | Tasking / missions / Anduril UI clone |
| Fail-closed unknown | Osiris deciding friend/foe as a legal finding |

## Connect

See `.env.example` section **ANDURIL LATTICE**. Required:

- `LATTICE_ENABLED=1`
- `LATTICE_ENDPOINT` (host:port)
- `LATTICE_CLIENT_ID` / `LATTICE_CLIENT_SECRET`
- `LATTICE_ENV_TOKEN` (Sandboxes Bearer, not the Lattice UI password)

Then NETWORK INTEL shows **Lattice Tracks**. Probe is `GET /api/lattice?probe=1`.

## Disconnect

`LATTICE_ENABLED=0` or unset credentials. Probe returns `configured: false`. Toggle stays hidden. Osiris OSINT is unaffected.

## Independent sample

Anduril and Lattice are trademarks of Anduril Industries. This is an independent optional integration, not an Anduril product.

Thank you to [simplifaisoul](https://github.com/simplifaisoul) for Osiris (MIT).
