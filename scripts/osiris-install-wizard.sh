#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ENV_FILE="${ROOT_DIR}/.env"
ALLOW_NON_MOUNT_ROOT=0
SELECTED_DATA_ROOT=""

say() {
  printf '%s\n' "$*" >&2
}

ask() {
  local prompt="$1"
  local default_value="$2"
  local value
  if [[ -n "${default_value}" ]]; then
    read -r -p "${prompt} [${default_value}]: " value
    printf '%s' "${value:-${default_value}}"
  else
    read -r -p "${prompt}: " value
    printf '%s' "${value}"
  fi
}

confirm() {
  local prompt="$1"
  local default_value="${2:-n}"
  local suffix="[y/N]"
  [[ "${default_value}" == "y" ]] && suffix="[Y/n]"
  local answer
  read -r -p "${prompt} ${suffix}: " answer
  answer="${answer:-${default_value}}"
  [[ "${answer}" =~ ^[Yy]$ ]]
}

choose() {
  local prompt="$1"
  shift
  local options=("$@")
  local index

  say "${prompt}"
  for index in "${!options[@]}"; do
    say "  $((index + 1))) ${options[$index]}"
  done

  while true; do
    local answer
    answer="$(ask "Select an option" "1")"
    if [[ "${answer}" =~ ^[0-9]+$ ]] && (( answer >= 1 && answer <= ${#options[@]} )); then
      printf '%s' "${options[$((answer - 1))]}"
      return
    fi
    say "Invalid option."
  done
}

require_command() {
  command -v "$1" >/dev/null 2>&1
}

target_uid() {
  printf '%s' "${SUDO_UID:-$(id -u)}"
}

target_gid() {
  printf '%s' "${SUDO_GID:-$(id -g)}"
}

make_directory() {
  local path="$1"
  local mode="$2"
  if [[ "${EUID}" -eq 0 ]]; then
    install -d -m "${mode}" "${path}"
  elif require_command sudo; then
    sudo install -d -m "${mode}" "${path}"
  else
    install -d -m "${mode}" "${path}"
  fi
}

run_privileged() {
  if [[ "${EUID}" -eq 0 ]]; then
    "$@"
  elif require_command sudo; then
    sudo "$@"
  else
    say "sudo is required for: $*"
    exit 1
  fi
}

random_password() {
  if require_command openssl; then
    openssl rand -base64 36 | tr -d '\n'
  else
    date +%s%N | sha256sum | awk '{print $1}'
  fi
}

mount_target_for_path() {
  local path="$1"
  findmnt -T "${path}" -no TARGET 2>/dev/null | head -n 1 || true
}

is_mount_root() {
  local path="$1"
  local target
  target="$(mount_target_for_path "${path}")"
  [[ -n "${target}" && "$(readlink -f "${target}")" == "$(readlink -f "${path}")" ]]
}

device_field() {
  local device="$1"
  local field="$2"
  lsblk -no "${field}" "${device}" 2>/dev/null | head -n 1 | sed 's/^[[:space:]]*//;s/[[:space:]]*$//'
}

show_block_devices() {
  if ! require_command lsblk; then
    say "lsblk is unavailable; cannot list disks automatically."
    return 1
  fi

  say "Detected block devices:"
  lsblk -o NAME,SIZE,FSTYPE,LABEL,UUID,MOUNTPOINTS,MODEL >&2
}

choose_existing_filesystem() {
  show_block_devices || return 1

  say ""
  say "Enter the device path for an existing filesystem to mount."
  say "Examples: /dev/sdb1, /dev/nvme1n1p1"
  say "The wizard will not format or partition disks."
  local device
  device="$(ask "Device path" "")"

  if [[ -z "${device}" || ! -b "${device}" ]]; then
    say "Device does not exist or is not a block device: ${device}"
    return 1
  fi

  local fstype
  fstype="$(device_field "${device}" "FSTYPE")"
  if [[ -z "${fstype}" ]]; then
    say "${device} has no detected filesystem. Format/partition it outside this wizard, then rerun."
    return 1
  fi

  printf '%s' "${device}"
}

mount_existing_filesystem() {
  local device="$1"
  local mount_point="$2"
  local fstype
  local uuid

  fstype="$(device_field "${device}" "FSTYPE")"
  uuid="$(device_field "${device}" "UUID")"

  if [[ -z "${fstype}" ]]; then
    say "${device} has no detected filesystem; refusing to continue."
    exit 1
  fi

  if [[ -z "${uuid}" ]]; then
    say "${device} has no UUID; mount can proceed by device path, but fstab persistence needs a UUID."
  fi

  make_directory "${mount_point}" "0750"

  if ! is_mount_root "${mount_point}"; then
    say "Mounting ${device} at ${mount_point}..."
    if [[ -n "${uuid}" ]]; then
      run_privileged mount "UUID=${uuid}" "${mount_point}"
    else
      run_privileged mount "${device}" "${mount_point}"
    fi
  fi

  if ! is_mount_root "${mount_point}"; then
    say "Mount failed or ${mount_point} is not a mount root."
    exit 1
  fi

  if [[ -n "${uuid}" ]] && confirm "Add this mount to /etc/fstab for startup mounting?" "y"; then
    local escaped_mount
    escaped_mount="${mount_point// /\\040}"
    if grep -qs "UUID=${uuid}[[:space:]]" /etc/fstab; then
      say "/etc/fstab already contains UUID=${uuid}; leaving it unchanged."
    else
      say "Adding persistent mount entry to /etc/fstab."
      printf 'UUID=%s %s %s defaults,nofail 0 2\n' "${uuid}" "${escaped_mount}" "${fstype}" \
        | run_privileged tee -a /etc/fstab >/dev/null
    fi
  fi
}

select_data_root() {
  local default_root="/srv/osiris-worldstate"
  say ""
  local mode
  mode="$(choose "Storage setup mode:" \
    "Use an already mounted path" \
    "Mount an existing filesystem now" \
    "Use local default path without a dedicated disk")"

  case "${mode}" in
    "Mount an existing filesystem now")
      local mount_point
      mount_point="$(ask "Mount point for OSIRIS state" "/mnt/osiris-worldstate")"
      mount_point="${mount_point%/}"
      local device
      device="$(choose_existing_filesystem)"
      mount_existing_filesystem "${device}" "${mount_point}"
      SELECTED_DATA_ROOT="${mount_point}"
      ;;
    "Use local default path without a dedicated disk")
      ALLOW_NON_MOUNT_ROOT=1
      SELECTED_DATA_ROOT="${default_root}"
      ;;
    *)
      local data_root
      data_root="$(ask "Mounted disk/data root for OSIRIS state" "${default_root}")"
      SELECTED_DATA_ROOT="${data_root%/}"
      ;;
  esac
}

write_env() {
  local osiris_port="$1"
  local db_name="$2"
  local db_user="$3"
  local db_password="$4"
  local db_host_path="$5"
  local archive_host_path="$6"
  local archive_container_path="$7"

  if [[ -f "${ENV_FILE}" ]]; then
    local backup="${ENV_FILE}.backup.$(date +%Y%m%d%H%M%S)"
    cp "${ENV_FILE}" "${backup}"
    say "Backed up existing .env to ${backup}"
  fi

  cat >"${ENV_FILE}" <<EOF
# Generated by scripts/osiris-install-wizard.sh
OSIRIS_PORT=${osiris_port}

POSTGRES_DB=${db_name}
POSTGRES_USER=${db_user}
POSTGRES_PASSWORD=${db_password}
POSTGRES_PORT=5432

WORLDSTATE_DB_DATA=${db_host_path}
RAW_ARCHIVE_HOST_PATH=${archive_host_path}
RAW_ARCHIVE_PATH=${archive_container_path}

EARTHQUAKE_DATA_MODE=database_with_live_fallback
EARTHQUAKE_DATABASE_MAX_AGE_MS=900000

COLLECTOR_SOURCE=usgs-earthquakes
COLLECT_INTERVAL_MS=300000
COLLECT_ON_STARTUP=1
MAX_FETCH_ATTEMPTS=3
MAX_RESPONSE_BYTES=26214400
REQUEST_TIMEOUT_MS=10000
RETRY_BASE_MS=500
STALE_RUN_AFTER_MS=900000

COLLECTOR_UID=$(target_uid)
COLLECTOR_GID=$(target_gid)
COLLECTOR_HEALTH_PORT=4001
COLLECTOR_LOG_LEVEL=info
EOF
}

prepare_directories() {
  local db_host_path="$1"
  local archive_host_path="$2"

  say "Preparing host directories:"
  say "  PostgreSQL: ${db_host_path}"
  say "  Raw archive: ${archive_host_path}"

  make_directory "${db_host_path}" "0750"
  make_directory "${archive_host_path}" "0750"

  if confirm "Set ownership of both directories to $(target_uid):$(target_gid) for this user?" "y"; then
    if [[ "${EUID}" -eq 0 ]]; then
      chown -R "$(target_uid):$(target_gid)" "${db_host_path}" "${archive_host_path}"
    elif require_command sudo; then
      sudo chown -R "$(target_uid):$(target_gid)" "${db_host_path}" "${archive_host_path}"
    else
      say "sudo is unavailable; leaving ownership unchanged."
    fi
  fi
}

show_disk_guidance() {
  say ""
  say "Disk setup guidance"
  say "-------------------"
  say "Use this if you want PostgreSQL and archives on a dedicated disk."
  say ""
  say "Preferred GUI path on Ubuntu Desktop:"
  say "  1. Open Disks."
  say "  2. Select the target disk."
  say "  3. Create/format a Linux filesystem such as ext4."
  say "  4. Mount it at a stable path, for example /mnt/osiris-worldstate."
  say "  5. Enable mount at startup in the mount options."
  say ""
  say "Ubuntu Server usually has no desktop GUI. In that case mount the disk"
  say "outside this wizard first, or let this wizard mount an existing filesystem."
  say ""
  if require_command lsblk; then
    say "Current block devices:"
    lsblk -o NAME,SIZE,FSTYPE,MOUNTPOINTS,MODEL
  fi
  say ""
  say "This wizard does not format disks. That is intentionally separate because"
  say "formatting is destructive. Once the disk is mounted, the wizard prepares"
  say "the OSIRIS directories and writes Compose configuration."
}

check_docker() {
  if require_command docker && docker compose version >/dev/null 2>&1; then
    say "Docker Compose is available."
    return
  fi

  say "Docker Compose was not detected."
  if confirm "Install Docker packages with apt now?" "n"; then
    if ! require_command apt-get; then
      say "apt-get is unavailable; install Docker manually and rerun this wizard."
      exit 1
    fi
    if [[ "${EUID}" -eq 0 ]]; then
      apt-get update
      apt-get install -y docker.io docker-compose-plugin
      systemctl enable --now docker || true
    elif require_command sudo; then
      sudo apt-get update
      sudo apt-get install -y docker.io docker-compose-plugin
      sudo systemctl enable --now docker || true
    else
      say "sudo is unavailable; install Docker manually and rerun this wizard."
      exit 1
    fi
  fi
}

validate_compose() {
  say "Validating Compose configuration..."
  docker compose -f docker-compose.yml -f docker-compose.worldstate.yml config --quiet
}

main() {
  say "OSIRIS Ubuntu install wizard"
  say "============================"
  say "Repository: ${ROOT_DIR}"
  say ""

  if [[ -r /etc/os-release ]] && ! grep -qi '^ID=ubuntu' /etc/os-release; then
    say "Warning: this wizard is written for Ubuntu Server/Desktop. Continuing anyway."
  fi

  show_disk_guidance

  local data_root
  select_data_root
  data_root="${SELECTED_DATA_ROOT}"

  if [[ ! -d "${data_root}" ]]; then
    confirm "Create ${data_root} now?" "y" || exit 1
    make_directory "${data_root}" "0750"
  fi

  if [[ "${ALLOW_NON_MOUNT_ROOT}" != "1" ]] && ! is_mount_root "${data_root}"; then
    local current_mount
    current_mount="$(mount_target_for_path "${data_root}")"
    say "Warning: ${data_root} is not itself a mounted filesystem."
    say "Current backing mount: ${current_mount:-unknown}"
    confirm "Continue using this path anyway?" "n" || exit 1
  fi

  local db_host_path="${data_root}/postgres"
  local archive_host_path="${data_root}/archive"
  local archive_container_path="/archive"
  local osiris_port
  local db_name
  local db_user
  local db_password

  osiris_port="$(ask "OSIRIS web UI host port" "3000")"
  db_name="$(ask "PostgreSQL database name" "osiris_worldstate")"
  db_user="$(ask "PostgreSQL username" "osiris")"
  db_password="$(ask "PostgreSQL password" "$(random_password)")"

  prepare_directories "${db_host_path}" "${archive_host_path}"
  write_env "${osiris_port}" "${db_name}" "${db_user}" "${db_password}" "${db_host_path}" "${archive_host_path}" "${archive_container_path}"
  check_docker
  validate_compose

  say ""
  say "Wizard complete."
  say ""
  say "Start OSIRIS and world-state persistence with:"
  say "  docker compose -f docker-compose.yml -f docker-compose.worldstate.yml up -d osiris collector"
  say ""
  say "Verify state with:"
  say "  docker compose -f docker-compose.yml -f docker-compose.worldstate.yml ps"
  say "  docker compose -f docker-compose.yml -f docker-compose.worldstate.yml logs -f collector"
  say ""
  say "Database path: ${db_host_path}"
  say "Archive path:  ${archive_host_path}"
}

main "$@"
