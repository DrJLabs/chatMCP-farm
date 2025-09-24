These tests validate the postbump test runner CLI by spawning a child Node process.

Test framework:
- Node's built-in node:test and assert/strict (no external deps).

Notes:
- Tests do not import the runner directly (it exits the process). They spawn it as a separate process.
- npm is stubbed via a temporary directory prepended to PATH so we can inspect arguments and control exit codes.
- If your runner file is not at scripts/postbump-test.mjs, set POSTBUMP_RUNNER_PATH env to its path when running tests.