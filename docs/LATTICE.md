# Optional Lattice layer

Vendored from [osiris-lattice](https://github.com/Polybolos-Institute/osiris-lattice) at `src/lib/lattice/`. Default off.

## Enable

`.env.example` section **ANDURIL LATTICE**:

- `LATTICE_ENABLED=1`
- `LATTICE_ENDPOINT`
- `LATTICE_CLIENT_ID` / `LATTICE_CLIENT_SECRET`
- `LATTICE_ENV_TOKEN` (Sandboxes Bearer, not the Lattice UI password)

NETWORK INTEL then shows **Lattice Tracks**. Probe: `GET /api/lattice?probe=1`. Entities: `GET /api/lattice`.

Local mock: [anduril-mock-lattice](https://github.com/Polybolos-Institute/anduril-mock-lattice).

## Disable

`LATTICE_ENABLED=0` or unset credentials. Probe returns `configured: false`. Toggle stays hidden.

Empty or unknown Lattice types are left unknown. This layer does not task, mission, or engage.

## Note

Anduril and Lattice are trademarks of Anduril Industries. Independent optional integration, not an Anduril product.

Thank you to [simplifaisoul](https://github.com/simplifaisoul) for Osiris (MIT).
