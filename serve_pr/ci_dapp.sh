#!/bin/bash

function log() {
  echo "$@" >&2
}

function err() {
  log "$@"
  exit 1
}

PWD=$( realpath -e `dirname $0` )
CIRCLE_SLUG="${CIRCLE_SLUG:-github/raiden-network/light-client}"
[[ -n "$1" ]] || err "Branch param not set"
[[ -n "${CIRCLE_TOKEN}" ]] || err "CIRCLE_TOKEN not defined"
QUERY="$1"
CURL="curl -ss -H Circle-Token:${CIRCLE_TOKEN}"
BASE="https://circleci.com/api/v2"

PIPELINES=(`$CURL "$BASE/project/${CIRCLE_SLUG}/pipeline?${QUERY}" | grep -B1 -A0 '"errors" : \[\s*\]' | grep -oP '(?<="id" : ")[^"]+'`)
for PIPELINE in $PIPELINES; do
  log "Pipeline: ${PIPELINE}"
  WORKFLOWS=(`$CURL "$BASE/pipeline/${PIPELINE}/workflow" | grep -oP '(?<="id" : ")[^"]+'`)
  for WORKFLOW in $WORKFLOWS; do
    log "Workflow: ${WORKFLOW}"
    JOB=`$CURL "$BASE/workflow/${WORKFLOW}/job" | grep -B5 -A0 '"status" : "success"' | grep -B3 -A0 '"name" : "build_dapp"' | grep -oP '(?<="job_number" : )\d+' | head -1`
    URL=`$CURL "$BASE/project/${CIRCLE_SLUG}/${JOB}/artifacts" | grep -oP '(?<="url" : ")[^"]+' | head -1`
    PULL=`curl -ss "https://circleci.com/api/v1.1/project/${CIRCLE_SLUG}/${JOB}?circle-token=${CIRCLE_TOKEN}" | grep -B0 -A2 '"pull_requests"' | grep -oP '(?<=/pull/)\d+' | head -1`
    [[ -n "$PULL" ]] || continue
    log "Pull Request: ${PULL}"
    PULLDIR="${PWD}/${PULL}"
    mkdir -p "${PULLDIR}"
    OLDFILE="$PULLDIR/dapp.prev.tar.bz2"
    OUTFILE="$PULLDIR/dapp.tar.bz2"
    $CURL -L -o "$OUTFILE" -z "$OLDFILE" "$URL" && SUCCESS=1
    [[ "$SUCCESS" == 1 ]] && break
  done
  [[ "$SUCCESS" == 1 ]] && break
done

[[ "$SUCCESS" == 1 ]] || err "No artifact found to download"
if [[ -e "$OUTFILE" ]]; then
  rm -rf "${PULLDIR}/dist"
  tar -xf "$OUTFILE" -C "$PULLDIR" && mv "${OUTFILE}" "${OLDFILE}"
fi
[[ -e "${OLDFILE}" && -d "${PULLDIR}/dist" ]] || err "Failed to download or extract file"

# TODO: clear old PR folders
echo $PULL # only thing sent to stdout is the PR number
if [[ "$2" == "-s" ]]; then # local test only
  python -m http.server --directory "$PULLDIR/dist/" ${PORT:-8080}
fi
