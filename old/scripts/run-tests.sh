#!/bin/bash
# Run tests only in the test directory, excluding webhook-service
cd "$(dirname "$0")/.."
exec bun test --cwd . test/