#!/bin/bash

. $(brew --prefix nvm)/nvm.sh  # if installed via Brew
nvm use 22

pnpm run dev
