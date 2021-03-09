#!/usr/bin/env bash

# Exit immediately on error
set -o errexit

# Creates a mock project with structure like:
# + node_modules/
#     @ethereumjs/tx: 3.0.2
#     @ethereumjs/vm: master
#       @ethereumjs/tx master
#
#
#
tx_backwards_compatibility_test(){
  # Setup
  source ./scripts/e2e-compat-utils.sh
  setup_compatibility_test @ethereumjs/tx@3.0.2 @ethereumjs/vm

  # Copy target test, utils, tsconfig over
  cp packages/vm/tests/api/runTx.spec.ts $E2E_TEST_DIRECTORY
  cp packages/vm/tests/api/utils.ts $E2E_TEST_DIRECTORY/utils.ts
  cp packages/vm/tsconfig.json tsconfig.json

  echo ">>>> e2e_test/node_modules >>>>"
  ls -A e2e_test

  echo ">>>> e2e_test/node_modules/@ethereumjs/vm >>>>"
  ls -A e2e_test/node_modules/@ethereumjs/vm

  # Make test consume everything from node_modules
  sed -i "s|../../lib|@ethereumjs/vm/dist/|g" $E2E_TEST_DIRECTORY/runTx.spec.ts
  sed -i "s|../../lib/index|@ethereumjs/vm|g" $E2E_TEST_DIRECTORY/utils.ts
  sed -i "s|../../lib|@ethereumjs/vm|g" $E2E_TEST_DIRECTORY/utils.ts

  # Test
  npx tape -r ts-node/register "$E2E_TEST_DIRECTORY/runTx.spec.ts"

  # Cleanup
  teardown_compatibility_test
}

