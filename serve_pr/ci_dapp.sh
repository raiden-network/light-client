#!/bin/bash
set -x

PWD=$( realpath -e `dirname $0` )
exec 2> /tmp/log.txt
CIRCLE_SLUG="${CIRCLE_SLUG:-github/raiden-network/light-client}"
[[ -n "$1" && -n "${CIRCLE_TOKEN}" ]] || exit 1
QUERY="$1"
CURL="curl -H Circle-Token:${CIRCLE_TOKEN}"
BASE="https://circleci.com/api/v2"

PIPELINES=(`$CURL "$BASE/project/${CIRCLE_SLUG}/pipeline?${QUERY}" | grep -B1 -A0 '"errors" : \[\s*\]' | grep -oP '(?<="id" : ")[^"]+'`)
for PIPELINE in $PIPELINES; do
  echo "Pipeline: ${PIPELINE}" >&2
  WORKFLOWS=(`$CURL "$BASE/pipeline/${PIPELINE}/workflow" | grep -oP '(?<="id" : ")[^"]+'`)
  for WORKFLOW in $WORKFLOWS; do
    echo "Workflow: ${WORKFLOW}" >&2
    JOB=`$CURL "$BASE/workflow/${WORKFLOW}/job" | grep -B5 -A0 '"status" : "success"' | grep -B3 -A0 '"name" : "build_dapp"' | grep -oP '(?<="job_number" : )\d+' | head -1`
    URL=`$CURL "$BASE/project/${CIRCLE_SLUG}/${JOB}/artifacts" | grep -oP '(?<="url" : ")[^"]+' | head -1`
    PULL=`curl "https://circleci.com/api/v1.1/project/${CIRCLE_SLUG}/${JOB}?circle-token=${CIRCLE_TOKEN}" | grep -B0 -A2 '"pull_requests"' | grep -oP '(?<=/pull/)\d+' | head -1`
    [[ -n "$PULL" ]] || continue
    PULLDIR="${PWD}/${PULL}"
    mkdir -p "${PULLDIR}"
    OLDFILE="$PULLDIR/dapp.prev.tar.gz"
    OUTFILE="$PULLDIR/dapp.tar.gz"
    $CURL -L -o "$OUTFILE" -z "$OLDFILE" "$URL" && SUCCESS=1
    [[ "$SUCCESS" == 1 ]] && break
  done
  [[ "$SUCCESS" == 1 ]] && break
done

[[ "$SUCCESS" == 1 && -d "$PULLDIR" ]] || exit 1
if [[ -e "$OUTFILE" ]]; then
  rm -rf "${PULLDIR}/dist"
  tar -xvf "$OUTFILE" -C "$PULLDIR" >&2
  mv "${OUTFILE}" "${OLDFILE}"
fi
[[ -e "${OLDFILE}" ]] || exit 1

# TODO: clear old PR folders
echo $PULL # only thing sent to stdout is the PR number
if [[ "$2" == "-s" ]]; then # local test only
  python -m http.server --directory "$PULLDIR/dist/" ${PORT:-8888}
fi
