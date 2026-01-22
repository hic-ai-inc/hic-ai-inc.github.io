#!/bin/bash
# Quick DM system health check - for CI/CD pipelines
# Original implementation for HIC project

cd "$(dirname "$0")/.." || { echo "Error: Failed to change to DM directory"; exit 1; }

# Color definitions
CLR_ERROR='\e[91m'
CLR_SUCCESS='\e[92m'
CLR_WARNING='\e[93m'
CLR_INFO='\e[94m'
CLR_RESET='\e[0m'

echo -e "${CLR_INFO}🏥 DM System Health Check${CLR_RESET}"
echo "========================"
echo

# Run critical facade tests only
echo -e "${CLR_INFO}Testing external facade...${CLR_RESET}"
node --test tests/facade/unit/*.test.js

if [ $? -ne 0 ]; then
    echo -e "${CLR_ERROR}❌ Facade tests failed - blocking deployment${CLR_RESET}"
    exit 1
fi

echo -e "${CLR_SUCCESS}✅ Facade tests passed${CLR_RESET}"
echo

# Test internal integration
echo -e "${CLR_INFO}Testing internal integration...${CLR_RESET}"
node --test tests/internal/integration/*.test.js

if [ $? -ne 0 ]; then
    echo -e "${CLR_ERROR}❌ Internal integration failed - blocking deployment${CLR_RESET}"
    exit 1
fi

echo -e "${CLR_SUCCESS}✅ Internal integration passed${CLR_RESET}"
echo

echo -e "${CLR_SUCCESS}🎉 DM system health check passed - safe to deploy${CLR_RESET}"
