#!/bin/zsh -l
cd -- "${0:A:h}"
if ! command -v node >/dev/null 2>&1; then
  print 'Install Node.js LTS 24 or newer, then open this file again.'
  read 'task_reply?Press Return to close.'
  exit 1
fi
if [ ! -d node_modules ]; then
  npm install || exit 1
fi
npm run dev
