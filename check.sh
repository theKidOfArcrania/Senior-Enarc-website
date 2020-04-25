#!/bin/bash

ERROR=$'\x1b[0;41;5mERROR:\x1b[m'

# Make sure lib/config.ts is up-to-date
if [ ! -f lib/config.ts ]; then
  echo "$ERROR lib/config.ts DOES NOT EXIST!"
  echo 'Please run `cp lib/config.ts.def lib/config.ts` from root git directory!'
  exit 1
fi

if [ lib/config.ts.def -nt lib/config.ts ]; then
  if diff lib/config.ts.def lib/config.ts; then
    exit 0
  fi

  echo "$ERROR lib/config.ts.def is NEWER than lib/config.ts!"
  echo 'Please run `cp lib/config.ts.def lib/config.ts` from root git directory!'
  exit 1
fi
