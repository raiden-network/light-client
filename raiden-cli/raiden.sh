#!/bin/bash

RAIDEN="$( dirname $0 )/build/raiden.js"
[ -e "$RAIDEN" ] || RAIDEN="$( dirname $0 )/build/raiden.bundle.js"

exec node "$RAIDEN" "$@"
