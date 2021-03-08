#!/usr/bin/env bash

# Exit immediately on error
set -o errexit

tx_backwards_compatibility_test(){
  # Setup
  source ./e2e_compat_utils.sh
  setup_dependency_test @ethereumjs/tx@3.0.2 @ethereumjs/vm

  # Copy target test over and make it consume ethereumjs/vm from node_modules
  cp packages/vm/tests/api/runTx.spec.ts $E2E_TEST_DIRECTORY
  sed -i "s|../../lib|@ethereumjs/vm|g" $E2E_TEST_DIRECTORY/runTx.spec.ts

  # Test
  tape -r ts-node/register '$E2E_TEST_DIRECTORY/runTx.spec.ts'

  # Cleanup
  #teardown_dependency_test
}

