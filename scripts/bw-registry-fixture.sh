#!/usr/bin/env bash
# Regenerates proof/bw-registry.json from the LIVE lending.view_registry rows.
#
# The proof harness renders its nav from this file so that "a new list is a
# registry row, not a page build" can be SHOWN rather than asserted: insert a row,
# re-run this, rebuild the harness, and the nav has the new surface in it without
# a line of component code changing.
set -euo pipefail
echo "Run the registry SELECT against the Cube and write proof/bw-registry.json" >&2
