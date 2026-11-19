#!/bin/sh
set -eu
# BACKEND_HOST is a hostname only, never a URL, path or secret.
case "${BACKEND_HOST:-}" in
  ''|*[!a-z0-9.-]*|.*|*.) echo 'Set BACKEND_HOST to the backend HTTPS hostname only.' >&2; exit 1 ;;
esac
case "${PORT:-}" in
  ''|*[!0-9]*) echo 'PORT must be an integer from 1 to 65535.' >&2; exit 1 ;;
esac
if [ "$PORT" -lt 1 ] || [ "$PORT" -gt 65535 ]; then
  echo 'PORT must be an integer from 1 to 65535.' >&2
  exit 1
fi
