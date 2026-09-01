#!/bin/sh
set -eu

# Railway mounts persistent volumes after the image has been built. Prepare the
# mounted directory as root, then run the application with the unprivileged
# node user supplied by the official Node image.
mkdir -p \
    /app/storage/data \
    /app/storage/uploads \
    /app/storage/transfers \
    /app/storage/backups
chown -R node:node /app/storage

exec gosu node "$@"
