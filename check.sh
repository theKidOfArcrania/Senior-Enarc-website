#!/bin/bash

ERROR=$'\x1b[0;41;5mERROR:\x1b[m'

# Make sure lib/config.js is up-to-date
if [ ! -f lib/config.js ]; then
  echo "$ERROR lib/config.js DOES NOT EXIST!"
  echo 'Please run `cp lib/config.js.def lib/config.js` from root git directory!'
  exit 1
fi

if [ lib/config.js.def -nt lib/config.js ]; then
  echo "$ERROR lib/config.js.def is NEWER than lib/config.js!"
  echo 'Please run `cp lib/config.js.def lib/config.js` from root git directory!'
  exit 1
fi
