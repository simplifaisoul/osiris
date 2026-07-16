# Ubuntu install wizard

OSIRIS includes a first-pass Ubuntu setup wizard for self-hosted installs that
use the world-state database.

Run it from the repository root:

```bash
npm run setup:wizard
```

The wizard covers:

- mounted disk path selection for PostgreSQL data and raw archives;
- optional mounting of an existing filesystem on Ubuntu Server;
- optional `/etc/fstab` entry creation so the selected disk mounts at boot;
- `.env` generation with database credentials and world-state paths;
- host directory creation and ownership preparation;
- Docker Compose availability checks;
- Compose configuration validation for the combined OSIRIS + world-state stack.

## Disk mounting model

The safe workflow is:

1. Mount the disk first.
2. Run the wizard.
3. Let the wizard create `postgres` and `archive` directories on that mounted
   filesystem.

For a desktop-capable Ubuntu machine, use the **Disks** GUI to format and mount
the target disk at a stable path such as `/mnt/osiris-worldstate`, with
“mount at startup” enabled.

For Ubuntu Server, you have two safe options:

1. Mount the disk with your normal server workflow first (`/etc/fstab`,
   cloud-init, Ansible, Cockpit, or similar), then provide the mounted path to
   the wizard.
2. Let the wizard mount an already-formatted filesystem. It lists block
   devices with `lsblk`, asks for a device path such as `/dev/sdb1`, mounts it
   at a stable path such as `/mnt/osiris-worldstate`, and can append a UUID
   based `/etc/fstab` entry.

The wizard intentionally does not format or partition disks, because those
operations are destructive and must stay explicit.

## Storage setup modes

The wizard presents three storage modes:

| Mode | Use when | Result |
|---|---|---|
| Already mounted path | The disk is mounted by Disks, Cockpit, cloud-init or manual server setup | The wizard validates that the path is a mount root, then prepares `postgres` and `archive` directories |
| Mount existing filesystem now | The disk partition already has a filesystem but is not mounted yet | The wizard mounts it, can add `/etc/fstab`, then prepares OSIRIS directories |
| Local default path | You are testing or do not have a dedicated disk yet | The wizard uses `/srv/osiris-worldstate` on the current root filesystem |

If you choose a mounted-disk mode and the selected path is only backed by `/`,
the wizard stops unless you explicitly continue. This prevents accidentally
putting PostgreSQL data on the OS disk when you intended to use a dedicated
volume.

## Generated storage settings

The wizard writes these key values to `.env`:

```env
WORLDSTATE_DB_DATA=/mnt/osiris-worldstate/postgres
RAW_ARCHIVE_HOST_PATH=/mnt/osiris-worldstate/archive
RAW_ARCHIVE_PATH=/archive
EARTHQUAKE_DATA_MODE=database_with_live_fallback
```

`WORLDSTATE_DB_DATA` may be either a Docker volume name or an absolute host
path. For mounted-disk installs, use an absolute host path.

`RAW_ARCHIVE_HOST_PATH` is the host-side directory for preserved upstream
responses. `RAW_ARCHIVE_PATH` is the container-side path used by the collector.

## Starting after the wizard

```bash
docker compose -f docker-compose.yml -f docker-compose.worldstate.yml \
  up -d osiris collector
```

Check status:

```bash
docker compose -f docker-compose.yml -f docker-compose.worldstate.yml ps
docker compose -f docker-compose.yml -f docker-compose.worldstate.yml logs -f collector
```

## Future GUI work

The current wizard is terminal-based so it works on Ubuntu Server. The storage
contract it writes is intentionally simple enough for a future OSIRIS GUI setup
screen: collect a mounted data root, validate write access, generate the same
`.env` values, and run the same Compose validation.
