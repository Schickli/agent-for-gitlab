#!/bin/bash

# Centralized utility for getting temporary directory across GitHub Actions and GitLab CI
# 
# Usage: source this file and use $TEMP_DIR variable
#   source scripts/get-temp-directory.sh
#   echo "Temp directory: $TEMP_DIR"

# Detect CI platform and set appropriate temp directory
if [ -n "$RUNNER_TEMP" ]; then
  # GitHub Actions
  TEMP_DIR="$RUNNER_TEMP"
  TEMP_SOURCE="RUNNER_TEMP"
elif [ -n "$CI_BUILDS_DIR" ]; then
  # GitLab CI - create a subdirectory for Claude temp files
  TEMP_DIR="$CI_BUILDS_DIR/.claude-temp"
  TEMP_SOURCE="CI_BUILDS_DIR"
  mkdir -p "$TEMP_DIR"
else
  # Fallback to system temp
  TEMP_DIR="/tmp"
  TEMP_SOURCE="fallback"
fi

# Export for use in scripts
export TEMP_DIR
export TEMP_SOURCE

# Optional: print debug info if DEBUG is set
if [ -n "$DEBUG" ]; then
  echo "Temp directory: $TEMP_DIR (source: $TEMP_SOURCE)" >&2
fi