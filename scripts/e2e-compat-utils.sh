#!/usr/bin/env bash


#!/usr/bin/env bash

# Exit immediately on error
set -o errexit

# Directory to stage backwards-compatibility dependencies and tests in
E2E_TEST_DIRECTORY="e2e_test"

only_in_ci(){

  if [ -z "$CI" ]; then

    echo "===================================================================================="
    echo "This script installs dependencies as part of an test. Only run in CI or with CI=true."
    echo "===================================================================================="

    exit 1

  fi
}

# Installs a testbed for checking the backwards compatibility of current monorepo state
# with previously published sub-dependencies. The "old dependency" is installed from npm,
# the current monorepo state is installed from a virtual npm registry.
#
# USAGE:   setup_compatibility_test <old-sub-dependency> <virtually-published-package>
# EXAMPLE: setup_compatibility_test @ethereumjs/tx@3.0.2 @ethereumjs/vm@e2e
setup_compatibility_test(){
  only_in_ci

  mkdir $E2E_TEST_DIRECTORY
  cd $E2E_TEST_DIRECTORY
  npm init --yes
  yarn add $1
  yarn add $2 #--registry http://localhost:4873 --network-timeout 500000
  cd ..
}

# Cleans up
teardown_compatibility_test(){
  only_in_ci
  rm -rf $E2E_TEST_DIRECTORY
}


