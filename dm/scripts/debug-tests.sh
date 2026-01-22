#!/bin/bash
# DM Test Debugging Commands - Interactive hierarchical test runner for DM system
# Enhanced version with submenus for comprehensive test suites

cd "$(dirname "$0")/.." || { echo "Error: Failed to change to DM directory"; exit 1; }

# Color definitions
declare -r CLR_ERROR='\e[91m'      # Bright red
declare -r CLR_SUCCESS='\e[92m'    # Bright green  
declare -r CLR_WARNING='\e[93m'    # Bright yellow
declare -r CLR_INFO='\e[94m'       # Bright blue
declare -r CLR_HEADER='\e[95m'     # Bright magenta
declare -r CLR_SUBMENU='\e[96m'    # Bright cyan
declare -r CLR_RESET='\e[0m'       # Reset

# Test path constants
declare -r TESTS_ROOT="tests"
declare -r FACADE_TESTS="$TESTS_ROOT/facade"
declare -r INTERNAL_TESTS="$TESTS_ROOT/internal"
declare -r FACADE_UNIT="$FACADE_TESTS/unit"
declare -r FACADE_INTEGRATION="$FACADE_TESTS/integration"
declare -r INTERNAL_ANALYSIS="$INTERNAL_TESTS/analysis"
declare -r INTERNAL_LAYERS="$INTERNAL_TESTS/layers"
declare -r INTERNAL_INFRASTRUCTURE="$INTERNAL_TESTS/infrastructure"
declare -r INTERNAL_UTILS="$INTERNAL_TESTS/utils"
declare -r INTERNAL_INTEGRATION="$INTERNAL_TESTS/integration"

# Test commands
declare -r NODE_TEST="node --test"
declare -r NODE_TEST_COVERAGE="node --test --experimental-test-coverage"
declare -r NODE_TEST_COVERAGE_ONLY="node --test --experimental-test-coverage --test-only"
declare -r NODE_TEST_REPORTER_TAP="node --test --test-reporter=tap"
declare -r NODE_TEST_REPORTER_SPEC="node --test --test-reporter=spec"
declare -r NODE_TEST_CONCISE="node --test"

# Global state for menu navigation
current_menu="main"

# Dynamic test discovery helpers
list_test_files() {
    local test_dir="$1"
    local pattern="${2:-*.test.js}"
    find "$test_dir" -name "$pattern" 2>/dev/null | sort
}

select_individual_test() {
    local test_dir="$1"
    local category_name="$2"
    
    echo -e "${CLR_INFO}🔍 Available ${category_name} tests:${CLR_RESET}"
    local -a test_files
    while IFS= read -r file; do
        test_files+=("$file")
    done < <(list_test_files "$test_dir")
    
    if [ ${#test_files[@]} -eq 0 ]; then
        echo -e "${CLR_WARNING}⚠️  No test files found in $test_dir${CLR_RESET}"
        return 1
    fi
    
    for i in "${!test_files[@]}"; do
        local filename=$(basename "${test_files[$i]}" .test.js)
        echo "$((i+1))) $filename"
    done
    echo ""
    
    read -p "Select test number (or Enter to cancel): " selection
    if [[ "$selection" =~ ^[0-9]+$ ]] && [ "$selection" -ge 1 ] && [ "$selection" -le ${#test_files[@]} ]; then
        local selected_file="${test_files[$((selection-1))]}"
        local test_name=$(basename "$selected_file" .test.js)
        run_test_suite "$NODE_TEST $selected_file" "$test_name Test"
    fi
}

search_tests_by_pattern() {
    local base_dir="$1"
    local category_name="$2"
    
    echo -e "${CLR_INFO}🔍 Search for tests in ${category_name}${CLR_RESET}"
    read -p "Enter search pattern (e.g., 'dynamo', 'mock', 'integration'): " pattern
    
    if [ -n "$pattern" ]; then
        local matching_tests=$(grep -r "$pattern" "$base_dir" --include="*.test.js" -l | tr '\n' ' ')
        if [ -n "$matching_tests" ]; then
            run_test_suite "$NODE_TEST $matching_tests" "Tests matching '$pattern'"
        else
            echo -e "${CLR_WARNING}⚠️  No tests found matching '$pattern' in $base_dir${CLR_RESET}"
        fi
    fi
}

# Diagnostic helper functions
find_tests_containing() {
    local search_term="$1"
    local description="$2"
    
    echo -e "${CLR_INFO}🔍 Finding tests containing '$search_term'...${CLR_RESET}"
    local matching_tests=$(grep -r "$search_term" $TESTS_ROOT/ --include="*.test.js" -l | tr '\n' ' ')
    if [ -n "$matching_tests" ]; then
        run_test_suite "$NODE_TEST $matching_tests" "$description"
    else
        echo -e "${CLR_WARNING}⚠️  No tests found containing '$search_term'${CLR_RESET}"
    fi
}

run_concurrent_stress_test() {
    echo -e "${CLR_INFO}🚀 Running concurrent stress test...${CLR_RESET}"
    echo -e "${CLR_WARNING}⚠️  This will run tests multiple times in parallel${CLR_RESET}"
    ($NODE_TEST $TESTS_ROOT/**/*.test.js &
     $NODE_TEST $TESTS_ROOT/**/*.test.js &
     $NODE_TEST $TESTS_ROOT/**/*.test.js &
     wait)
    echo -e "${CLR_SUCCESS}✅ Concurrent stress test completed${CLR_RESET}"
}

show_unsupported_feature() {
    local feature_name="$1"
    local suggestion="$2"
    
    echo -e "${CLR_WARNING}⚠️  Node.js native test doesn't support '$feature_name'${CLR_RESET}"
    echo -e "${CLR_INFO}💡 Suggestion: $suggestion${CLR_RESET}"
    echo
}

# Quick action helper functions
find_smoke_tests() {
    echo -e "${CLR_INFO}🔍 Finding smoke/critical/essential tests...${CLR_RESET}"
    local smoke_tests=$(grep -r "smoke\|critical\|essential" $TESTS_ROOT/ --include="*.test.js" -l | tr '\n' ' ')
    if [ -n "$smoke_tests" ]; then
        run_test_suite "$NODE_TEST $smoke_tests" "Smoke Test (critical paths)"
    else
        echo -e "${CLR_WARNING}⚠️  No smoke tests found, running comprehensive basic tests instead${CLR_RESET}"
        run_test_suite "$NODE_TEST $FACADE_UNIT/registry.test.js $FACADE_UNIT/dynamodb.test.js $INTERNAL_LAYERS/builder.test.js" "Comprehensive Smoke Test (3 core tests)"
    fi
}

find_non_integration_tests() {
    echo -e "${CLR_INFO}🔍 Finding non-integration tests...${CLR_RESET}"
    local non_integration_tests=$(find $TESTS_ROOT/ -name "*.test.js" | grep -v integration | tr '\n' ' ')
    if [ -n "$non_integration_tests" ]; then
        run_test_suite "$NODE_TEST $non_integration_tests" "Non-Integration Tests Only"
    else
        echo -e "${CLR_WARNING}⚠️  No non-integration tests found${CLR_RESET}"
    fi
}

generate_test_statistics() {
    echo -e "${CLR_INFO}📊 Generating Test Statistics...${CLR_RESET}"
    echo "Total test files:" $(find $TESTS_ROOT/ -name "*.test.js" | wc -l)
    echo "Facade tests:" $(find $FACADE_TESTS/ -name "*.test.js" 2>/dev/null | wc -l)
    echo "Internal tests:" $(find $INTERNAL_TESTS/ -name "*.test.js" 2>/dev/null | wc -l)
    echo "Integration tests:" $(find $TESTS_ROOT/ -name "*integration*.test.js" 2>/dev/null | wc -l)
    echo
}

clean_test_cache() {
    echo -e "${CLR_WARNING}🧹 Cleaning test cache and temporary files...${CLR_RESET}"
    rm -rf coverage/ .nyc_output/ node_modules/.cache/ 2>/dev/null || true
    echo -e "${CLR_SUCCESS}✅ Test cache cleaned${CLR_RESET}"
    echo
}

validate_test_structure() {
    echo -e "${CLR_INFO}🔍 Validating test structure...${CLR_RESET}"
    echo "Checking for missing test files..."
    # Check if all main modules have corresponding test files
    find src/ -name "*.js" 2>/dev/null | while read -r file; do
        test_file="$TESTS_ROOT/${file#src/}"
        test_file="${test_file%.js}.test.js"
        [ ! -f "$test_file" ] && echo -e "${CLR_WARNING}⚠️  Missing test: $test_file${CLR_RESET}"
    done
    echo
}

check_jest_remnants() {
    echo -e "${CLR_INFO}📦 Checking for Jest remnants...${CLR_RESET}"
    echo "Dependencies check:"
    npm ls --depth=0 | grep -E "(jest|babel)" || echo -e "${CLR_SUCCESS}✅ No Jest dependencies found${CLR_RESET}"
    echo "Config files check:"
    find . -name "*jest*" -o -name "*babel*" | head -5 || echo -e "${CLR_SUCCESS}✅ No Jest config files found${CLR_RESET}"
    echo
}

# Internal menu helper functions
select_subsystem_tests() {
    echo -e "${CLR_INFO}🔍 Available subsystems:${CLR_RESET}"
    echo "1) Analysis   2) Layers   3) Infrastructure   4) Utils   5) Integration"
    read -p "Select subsystem number: " subsystem_choice
    case $subsystem_choice in
        1) select_individual_test "$INTERNAL_ANALYSIS" "Analysis" ;;
        2) select_individual_test "$INTERNAL_LAYERS" "Layers" ;;
        3) select_individual_test "$INTERNAL_INFRASTRUCTURE" "Infrastructure" ;;
        4) select_individual_test "$INTERNAL_UTILS" "Utils" ;;
        5) select_individual_test "$INTERNAL_INTEGRATION" "Integration" ;;
        *) echo -e "${CLR_WARNING}Invalid subsystem selection${CLR_RESET}" ;;
    esac
}

# Diagnostics helper functions
run_tests_with_timeout() {
    echo -e "${CLR_INFO}📊 Running tests with timeout monitoring...${CLR_RESET}"
    # Look for tests that might have timeout issues by running a short timeout
    timeout 15s $NODE_TEST_CONCISE $TESTS_ROOT/**/*.test.js 2>&1 | grep -E "(timeout|SIGTERM|killed)" || {
        echo -e "${CLR_SUCCESS}✅ No timeout issues detected in 15s run${CLR_RESET}"
        echo -e "${CLR_INFO}💡 Running full suite to check for slow tests...${CLR_RESET}"
        run_test_suite "$NODE_TEST_CONCISE $TESTS_ROOT/**/*.test.js | grep -E '([0-9]{3,}(\.[0-9]+)?ms)'" "Tests with Potential Timeout Issues"
    }
}

analyze_test_performance() {
    echo -e "${CLR_INFO}📈 Analyzing test performance...${CLR_RESET}"
    $NODE_TEST_CONCISE $TESTS_ROOT/**/*.test.js 2>&1 | grep -E '([0-9]{4,}(\.[0-9]+)?ms|slow)' | head -20
    echo -e "${CLR_INFO}💡 Showing top 20 slowest test results${CLR_RESET}"
}

# Coverage-only functions for clean output
run_coverage_only() {
    local test_path="$1"
    local description="$2"
    local category_filter="$3"
    
    echo -e "${CLR_INFO}📊 Generating coverage report: ${description}${CLR_RESET}"
    echo -e "${CLR_WARNING}⚠️  Running in coverage-only mode (no test output)${CLR_RESET}"
    echo -e "${CLR_HEADER}============================================================${CLR_RESET}"
    
    # Capture all output and extract only coverage section with colors
    local temp_output=$(mktemp)
    $NODE_TEST_COVERAGE $test_path > "$temp_output" 2>&1
    
    # Extract and colorize coverage report
    awk '
        /^# start of coverage report/ { coverage_started = 1; next }
        /^# -+$/ && coverage_started { 
            printf "\033[96m%s\033[0m\n", $0; 
            next 
        }
        /^# file.*line %.*branch %.*funcs %.*uncovered lines$/ && coverage_started {
            printf "\033[95m%s\033[0m\n", $0;
            next
        }
        /^# -+$/ && coverage_started { 
            printf "\033[96m%s\033[0m\n", $0; 
            next 
        }
        /^# all files/ && coverage_started {
            # Summary line - make it stand out
            gsub(/^# /, "");
            printf "\033[93m📊 %s\033[0m\n", $0;
            next
        }
        coverage_started && /^#.*\|/ {
            # Coverage data lines
            gsub(/^# /, "");
            # Color code based on coverage percentage
            if ($0 ~ /100\.00.*100\.00.*100\.00/) {
                printf "\033[92m✅ %s\033[0m\n", $0;  # Green for perfect coverage
            } else if ($0 ~ /[89][0-9]\.[0-9][0-9].*\|/) {
                printf "\033[93m📊 %s\033[0m\n", $0;  # Yellow for good coverage (80-99%)
            } else if ($0 ~ /[67][0-9]\.[0-9][0-9].*\|/) {
                printf "\033[94m📈 %s\033[0m\n", $0;  # Blue for moderate coverage (60-79%)
            } else if ($0 ~ /[0-5][0-9]\.[0-9][0-9].*\|/) {
                printf "\033[91m⚠️  %s\033[0m\n", $0; # Red for low coverage (0-59%)
            } else {
                printf "\033[96m📁 %s\033[0m\n", $0;  # Cyan for directory headers
            }
            next
        }
        coverage_started && /^#/ && !/^# -/ {
            # Other coverage-related lines
            gsub(/^# /, "");
            printf "\033[94m%s\033[0m\n", $0;
        }
    ' "$temp_output"
    
    # Clean up
    rm -f "$temp_output"
    
    echo -e "${CLR_HEADER}============================================================${CLR_RESET}"
    echo -e "${CLR_SUCCESS}✅ Coverage report generated for: ${description}${CLR_RESET}"
    echo
}

run_coverage_by_category() {
    local category="$1"
    local test_path="$2"
    local description="$3"
    
    echo -e "${CLR_INFO}📊 Generating ${category} coverage report${CLR_RESET}"
    echo -e "${CLR_HEADER}============================================================${CLR_RESET}"
    
    # Capture all output and extract only coverage section for the category
    local temp_output=$(mktemp)
    $NODE_TEST_COVERAGE $test_path > "$temp_output" 2>&1
    
    # Extract and colorize coverage report, filtering for specific category
    awk -v category="$category" '
        /^# start of coverage report/ { coverage_started = 1; next }
        /^# -+$/ && coverage_started && should_show { 
            printf "\033[96m%s\033[0m\n", $0; 
            next 
        }
        /^# file.*line %.*branch %.*funcs %.*uncovered lines$/ && coverage_started {
            printf "\033[95m%s\033[0m\n", $0;
            should_show = 1;
            next
        }
        /^# all files/ && coverage_started {
            gsub(/^# /, "");
            printf "\033[93m📊 %s\033[0m\n", $0;
            next
        }
        coverage_started && /^#.*\|/ {
            # Check if this line contains our category or is a summary line
            if ($0 ~ category || $0 ~ /^# all files/) {
                gsub(/^# /, "");
                # Color code based on coverage percentage  
                if ($0 ~ /100\.00.*100\.00.*100\.00/) {
                    printf "\033[92m✅ %s\033[0m\n", $0;
                } else if ($0 ~ /[89][0-9]\.[0-9][0-9].*\|/) {
                    printf "\033[93m📊 %s\033[0m\n", $0;
                } else if ($0 ~ /[67][0-9]\.[0-9][0-9].*\|/) {
                    printf "\033[94m📈 %s\033[0m\n", $0;
                } else if ($0 ~ /[0-5][0-9]\.[0-9][0-9].*\|/) {
                    printf "\033[91m⚠️  %s\033[0m\n", $0;
                } else {
                    printf "\033[96m📁 %s\033[0m\n", $0;
                }
            }
            next
        }
        # Show category directory headers
        coverage_started && /^# [a-zA-Z]/ && $0 ~ category {
            gsub(/^# /, "");
            printf "\033[96m📁 %s\033[0m\n", $0;
        }
    ' "$temp_output"
    
    # Clean up
    rm -f "$temp_output"
    
    echo -e "${CLR_HEADER}============================================================${CLR_RESET}"
    echo -e "${CLR_SUCCESS}✅ ${category} coverage analysis complete${CLR_RESET}"
    echo
}
show_main_menu() {
    echo -e "${CLR_HEADER}=== DM Test Debugging Helper===${CLR_RESET}"
    echo "Navigate to test categories:"
    echo ""
    echo -e "${CLR_INFO}📁 TEST CATEGORIES:${CLR_RESET}"
    echo "1) 🎭 Facade Tests (External API Layer)"
    echo "2) ⚙️  Internal Tests (DM Platform)"
    echo "3) 🔍 Diagnostics & Patterns"
    echo "4) 📊 Quick Actions & Reports"
    echo ""
    echo -e "${CLR_INFO}🚀 QUICK RUNNERS:${CLR_RESET}"
    echo "5) Run All Tests (standard output)"
    echo "6) Run All Tests with Coverage Only"
    echo "7) Quick Smoke Test (2 critical tests)"
    echo "8) Comprehensive Smoke Test (auto-detect)"
    echo ""
    echo "0) Exit"
    echo ""
}

# Facade tests submenu
show_facade_menu() {
    echo -e "${CLR_SUBMENU}=== 🎭 FACADE TESTS (External API Layer) ===${CLR_RESET}"
    echo "Test the service provider role - facade helpers for HIC consumers"
    echo ""
    echo -e "${CLR_INFO}📦 FACADE TEST CATEGORIES:${CLR_RESET}"
    echo "1) All Facade Tests"
    echo "2) Unit Tests Only ($(find $FACADE_UNIT -name "*.test.js" 2>/dev/null | wc -l) files)"
    echo "3) Integration Tests Only ($(find $FACADE_INTEGRATION -name "*.test.js" 2>/dev/null | wc -l) files)"
    echo ""
    echo -e "${CLR_INFO}� DYNAMIC DISCOVERY:${CLR_RESET}"
    echo "4) List & Select Individual Unit Tests"
    echo "5) List & Select Integration Tests"
    echo "6) Search by Test Name Pattern"
    echo ""
    echo "b) ← Back to Main Menu"
    echo "0) Exit"
    echo ""
}

# Internal tests submenu
show_internal_menu() {
    echo -e "${CLR_SUBMENU}=== ⚙️ INTERNAL TESTS (DM Platform) ===${CLR_RESET}"
    echo "Test the platform role - internal DM subsystems and workflows"
    echo ""
    echo -e "${CLR_INFO}📂 INTERNAL TEST CATEGORIES:${CLR_RESET}"
    echo "1) All Internal Tests"
    echo "2) Analysis Subsystem ($(find $INTERNAL_ANALYSIS -name "*.test.js" 2>/dev/null | wc -l) files)"
    echo "3) Layers Subsystem ($(find $INTERNAL_LAYERS -name "*.test.js" 2>/dev/null | wc -l) files)"
    echo "4) Infrastructure ($(find $INTERNAL_INFRASTRUCTURE -name "*.test.js" 2>/dev/null | wc -l) files)"
    echo "5) Utils Subsystem ($(find $INTERNAL_UTILS -name "*.test.js" 2>/dev/null | wc -l) files)"
    echo "6) Internal Integration ($(find $INTERNAL_INTEGRATION -name "*.test.js" 2>/dev/null | wc -l) files)"
    echo ""
    echo -e "${CLR_INFO}� DYNAMIC DISCOVERY:${CLR_RESET}"
    echo "7) List & Select Individual Tests"
    echo "8) Search by Subsystem Pattern"
    echo "9) Search by Test Name Pattern"
    echo ""
    echo "b) ← Back to Main Menu"
    echo "0) Exit"
    echo ""
}

# Diagnostics submenu
show_diagnostics_menu() {
    echo -e "${CLR_SUBMENU}=== 🔍 DIAGNOSTICS & PATTERNS ===${CLR_RESET}"
    echo "Pattern matching and diagnostic tools for 350+ test suite"
    echo ""
    echo -e "${CLR_INFO}🎯 TEST PATTERNS:${CLR_RESET}"
    echo "1) Tests containing 'should'"
    echo "2) Tests containing 'error'"
    echo "3) Tests containing 'integration'"
    echo "4) Tests containing 'mock'"
    echo "5) Tests containing 'validation'"
    echo "6) Tests containing 'deployment'"
    echo ""
    echo -e "${CLR_INFO}🚨 FAILURE ANALYSIS:${CLR_RESET}"
    echo "7) Quick Failure Detection (TAP format)"
    echo "8) Verbose Test Output (detailed spec format)"
    echo "9) Tests with Timeout Issues"
    echo ""
    echo -e "${CLR_INFO}📈 PERFORMANCE TESTING:${CLR_RESET}"
    echo "10) Slow Tests (>1000ms)"
    echo "11) Concurrent Test Stress"
    echo ""
    echo "b) ← Back to Main Menu"
    echo "0) Exit"
    echo ""
}

# Quick actions submenu
show_quick_menu() {
    echo -e "${CLR_SUBMENU}=== 📊 QUICK ACTIONS & REPORTS ===${CLR_RESET}"
    echo "Fast operations and comprehensive reports"
    echo ""
    echo -e "${CLR_INFO}⚡ QUICK RUNNERS:${CLR_RESET}"
    echo "1) Smoke Test (critical paths only)"
    echo "2) Essential Tests (high-priority)"
    echo "3) New/Changed Tests Only"
    echo "4) Non-Integration Tests"
    echo ""
    echo -e "${CLR_INFO}📋 REPORTS & COVERAGE:${CLR_RESET}"
    echo "5) Full Coverage Report (coverage only)"
    echo "6) Coverage by Category (interactive)"
    echo "7) Test Statistics Summary"
    echo "8) Performance Metrics"
    echo ""
    echo -e "${CLR_INFO}🔧 MAINTENANCE TOOLS:${CLR_RESET}"
    echo "9) Clean Test Cache"
    echo "10) Reset Mock State"
    echo "11) Validate Test Structure"
    echo "12) Check Dependencies"
    echo ""
    echo "b) ← Back to Main Menu"
    echo "0) Exit"
    echo ""
}

# Execute test function with enhanced result reporting
run_test_suite() {
    local test_command="$1"
    local test_description="$2"
    local use_verbose="$3"
    
    echo -e "${CLR_INFO}🚀 Running: ${test_description}${CLR_RESET}"
    echo -e "${CLR_HEADER}Command: ${test_command}${CLR_RESET}"
    
    # Show coverage warning if experimental coverage is being used
    if [[ "$test_command" == *"--experimental-test-coverage"* ]]; then
        echo -e "${CLR_WARNING}⚠️  Using experimental Node.js test coverage - results may vary${CLR_RESET}"
    fi
    
    # Show output mode info
    if [[ "$use_verbose" == "verbose" ]]; then
        echo -e "${CLR_INFO}💡 Using verbose output mode${CLR_RESET}"
    else
        echo -e "${CLR_INFO}💡 Using concise output. For detailed errors, choose 'y' if tests fail${CLR_RESET}"
    fi
    
    echo -e "${CLR_HEADER}============================================================${CLR_RESET}"
    echo
    
    # Execute the test command and capture timing
    local start_time=$(date +%s)
    
    if [[ "$use_verbose" == "verbose" ]]; then
        # Show full output for verbose mode
        eval "$test_command"
        local result_code=$?
    else
        # For concise mode, capture output and convert TAP back to readable format if needed
        local temp_output=$(mktemp)
        eval "$test_command" > "$temp_output" 2>&1
        local result_code=$?
        
        # Check if we got TAP format (module-level errors force TAP)
        if grep -q "TAP version" "$temp_output"; then
            echo -e "${CLR_WARNING}⚠️  Module-level errors detected, converting TAP output...${CLR_RESET}"
            
            # Convert TAP to more readable format with colors
            cat "$temp_output" | awk '
            /^# Node\.js/ { next }
            /^# SyntaxError:/ { 
                gsub(/^# /, ""); 
                printf "\033[91m❌ %s\033[0m\n", $0; 
                next 
            }
            /^# TypeError/ { 
                gsub(/^# /, ""); 
                printf "\033[91m❌ %s\033[0m\n", $0; 
                next 
            }
            /^# Error \[ERR_/ { 
                gsub(/^# /, ""); 
                printf "\033[91m❌ %s\033[0m\n", $0; 
                next 
            }
            /^not ok [0-9]+ - / { 
                gsub(/^not ok [0-9]+ - /, ""); 
                gsub(/\\\\/, "\\"); 
                printf "\033[91m✖ %s\033[0m\n", $0;
                next 
            }
            /^# tests/ { 
                gsub(/^# /, ""); 
                printf "\033[94mℹ %s\033[0m\n", $0; 
                next 
            }
            /^# suites/ { 
                gsub(/^# /, ""); 
                printf "\033[94mℹ %s\033[0m\n", $0; 
                next 
            }
            /^# pass/ { 
                gsub(/^# /, ""); 
                printf "\033[92mℹ %s\033[0m\n", $0; 
                next 
            }
            /^# fail/ { 
                gsub(/^# /, ""); 
                printf "\033[91mℹ %s\033[0m\n", $0; 
                next 
            }
            /^# cancelled/ { 
                gsub(/^# /, ""); 
                printf "\033[93mℹ %s\033[0m\n", $0; 
                next 
            }
            /^# skipped/ { 
                gsub(/^# /, ""); 
                printf "\033[93mℹ %s\033[0m\n", $0; 
                next 
            }
            /^# todo/ { 
                gsub(/^# /, ""); 
                printf "\033[94mℹ %s\033[0m\n", $0; 
                next 
            }
            /^# duration_ms/ { 
                gsub(/^# /, ""); 
                printf "\033[94mℹ %s\033[0m\n", $0; 
                next 
            }
            /^#.*at / { next }
            /^#.*node:internal/ { next }
            /^TAP version/ { next }
            /^1\.\./ { next }
            /^  ---/ { next }
            /^  \.\.\./ { next }
            /^  duration_ms:/ { next }
            /^  location:/ { next }
            /^  failureType:/ { next }
            /^  exitCode:/ { next }
            /^  signal:/ { next }
            /^  error:/ { next }
            /^  code:/ { next }
            '
        else
            # Standard format, just filter out verbose stack traces
            cat "$temp_output" | grep -v -E "(^    at |node:internal/|^\s*\^$)"
        fi
        
        # Clean up temp file
        rm -f "$temp_output"
    fi
    
    local end_time=$(date +%s)
    local duration=$((end_time - start_time))
    
    echo
    echo -e "${CLR_HEADER}============================================================${CLR_RESET}"
    
    if [ $result_code -eq 0 ]; then
        echo -e "${CLR_SUCCESS}✅ Test suite completed successfully! (${duration}s)${CLR_RESET}"
    else
        echo -e "${CLR_ERROR}❌ Test suite failed (exit code: $result_code, ${duration}s)${CLR_RESET}"
        
        # Offer verbose re-run for failed tests if we're not already in verbose mode
        if [[ "$use_verbose" != "verbose" ]]; then
            echo -e "${CLR_WARNING}💡 Would you like to re-run failed tests with detailed output? (y/n)${CLR_RESET}"
            read -p "Re-run with details? " verbose_choice
            if [[ "$verbose_choice" =~ ^[Yy]$ ]]; then
                echo -e "${CLR_INFO}🔍 Re-running with detailed output...${CLR_RESET}"
                verbose_command="${test_command//$NODE_TEST/$NODE_TEST_REPORTER_SPEC}"
                echo -e "${CLR_HEADER}============================================================${CLR_RESET}"
                eval "$verbose_command"
                echo -e "${CLR_HEADER}============================================================${CLR_RESET}"
            fi
        else
            echo -e "${CLR_INFO}💡 Detailed output was already shown above${CLR_RESET}"
        fi
    fi
    echo
}

handle_facade_menu() {
    local choice="$1"
    
    case $choice in
        1) run_test_suite "$NODE_TEST $FACADE_TESTS/**/*.test.js" "All Facade Tests" ;;
        2) run_test_suite "$NODE_TEST $FACADE_UNIT/*.test.js" "All Facade Unit Tests" ;;
        3) run_test_suite "$NODE_TEST $FACADE_INTEGRATION/*.test.js" "All Facade Integration Tests" ;;
        4) select_individual_test "$FACADE_UNIT" "Facade Unit" ;;
        5) select_individual_test "$FACADE_INTEGRATION" "Facade Integration" ;;
        6) search_tests_by_pattern "$FACADE_TESTS" "Facade" ;;
        b|B) current_menu="main"; return 0 ;;
        0) echo -e "${CLR_INFO}👋 Goodbye!${CLR_RESET}"; exit 0 ;;
        *) echo -e "${CLR_ERROR}❌ Invalid selection. Please choose a valid option.${CLR_RESET}"; echo; return 1 ;;
    esac
}

# Enhanced menu handler for internal tests
handle_internal_menu() {
    local choice="$1"
    
    case $choice in
        1) run_test_suite "$NODE_TEST $INTERNAL_TESTS/**/*.test.js" "All Internal Platform Tests" ;;
        2) run_test_suite "$NODE_TEST $INTERNAL_ANALYSIS/*.test.js" "Analysis Subsystem Tests" ;;
        3) run_test_suite "$NODE_TEST $INTERNAL_LAYERS/*.test.js" "Layers Subsystem Tests" ;;
        4) run_test_suite "$NODE_TEST $INTERNAL_INFRASTRUCTURE/*.test.js" "Infrastructure Tests" ;;
        5) run_test_suite "$NODE_TEST $INTERNAL_UTILS/*.test.js" "Utils Subsystem Tests" ;;
        6) run_test_suite "$NODE_TEST $INTERNAL_INTEGRATION/*.test.js" "Internal Integration Tests" ;;
        7) select_individual_test "$INTERNAL_TESTS" "Internal" ;;
        8) select_subsystem_tests ;;
        9) search_tests_by_pattern "$INTERNAL_TESTS" "Internal" ;;
        b|B) current_menu="main"; return 0 ;;
        0) echo -e "${CLR_INFO}👋 Goodbye!${CLR_RESET}"; exit 0 ;;
        *) echo -e "${CLR_ERROR}❌ Invalid selection. Please choose a valid option.${CLR_RESET}"; echo; return 1 ;;
    esac
}

# Diagnostics menu handler
handle_diagnostics_menu() {
    local choice="$1"
    
    case $choice in
        1) find_tests_containing "should" "Tests with 'should' pattern" ;;
        2) find_tests_containing "error" "Tests with 'error' pattern" ;;
        3) run_test_suite "$NODE_TEST $TESTS_ROOT/**/integration*.test.js $TESTS_ROOT/**/*integration*.test.js" "Tests with 'integration' pattern" ;;
        4) find_tests_containing "mock" "Tests with 'mock' pattern" ;;
        5) find_tests_containing "validation" "Tests with 'validation' pattern" ;;
        6) find_tests_containing "deployment" "Tests with 'deployment' pattern" ;;
        7) run_test_suite "$NODE_TEST_REPORTER_TAP $TESTS_ROOT/**/*.test.js" "Quick Failure Detection (TAP format)" ;;
        8) run_test_suite "$NODE_TEST_REPORTER_SPEC $TESTS_ROOT/**/*.test.js" "Verbose Output (detailed spec format)" "verbose" ;;
        9) run_tests_with_timeout ;;
        10) analyze_test_performance ;;
        11) run_concurrent_stress_test ;;
        b|B) current_menu="main"; return 0 ;;
        0) echo -e "${CLR_INFO}👋 Goodbye!${CLR_RESET}"; exit 0 ;;
        *) echo -e "${CLR_ERROR}❌ Invalid selection. Please choose a valid option.${CLR_RESET}"; echo; return 1 ;;
    esac
}

# Quick actions menu handler
handle_quick_menu() {
    local choice="$1"
    
    case $choice in
        1) find_smoke_tests ;;
        2) run_test_suite "$NODE_TEST $FACADE_UNIT/registry.test.js $INTERNAL_LAYERS/builder.test.js $FACADE_INTEGRATION/multi-service.test.js" "Essential Tests (high-priority)" ;;
        3) show_unsupported_feature "changed-since detection" "Use git to identify changed test files manually" ;;
        4) find_non_integration_tests ;;
        5) run_coverage_only "$TESTS_ROOT/**/*.test.js" "Full Coverage Report" ;;
        6) 
            echo -e "${CLR_INFO}📊 Coverage by Category${CLR_RESET}"
            echo "Choose category:"
            echo "1) Facade Coverage  2) Internal Coverage  3) Analysis Coverage  4) Layers Coverage"
            read -p "Enter category (1-4): " cat_choice
            case $cat_choice in
                1) run_coverage_by_category "facade" "$FACADE_TESTS/**/*.test.js" "Facade Coverage" ;;
                2) run_coverage_by_category "internal" "$INTERNAL_TESTS/**/*.test.js" "Internal Coverage" ;;
                3) run_coverage_by_category "analysis" "$INTERNAL_ANALYSIS/*.test.js" "Analysis Coverage" ;;
                4) run_coverage_by_category "layers" "$INTERNAL_LAYERS/*.test.js" "Layers Coverage" ;;
                *) echo -e "${CLR_WARNING}Invalid category selection${CLR_RESET}" ;;
            esac ;;
        7) generate_test_statistics ;;
        8) run_test_suite "$NODE_TEST_REPORTER_TAP $TESTS_ROOT/**/*.test.js | grep -E '(slow|fast|duration|ms)'" "Performance Metrics Summary" ;;
        9) clean_test_cache ;;
        10) run_test_suite "$NODE_TEST $FACADE_UNIT/registry.test.js" "Mock State Reset via Registry" ;;
        11) validate_test_structure ;;
        12) check_jest_remnants ;;
        b|B) current_menu="main"; return 0 ;;
        0) echo -e "${CLR_INFO}👋 Goodbye!${CLR_RESET}"; exit 0 ;;
        *) echo -e "${CLR_ERROR}❌ Invalid selection. Please choose a valid option.${CLR_RESET}"; echo; return 1 ;;
    esac
}

# Main program loop with hierarchical navigation
main() {
    while true; do
        case $current_menu in
            "main")
                show_main_menu
                read -p "Enter your choice (0-8): " user_choice
                echo
                
                case $user_choice in
                    1) current_menu="facade" ;;
                    2) current_menu="internal" ;;
                    3) current_menu="diagnostics" ;;
                    4) current_menu="quick" ;;
                    5) run_test_suite "$NODE_TEST $TESTS_ROOT/**/*.test.js" "All DM Tests (350+ tests)" ;;
                    6) run_coverage_only "$TESTS_ROOT/**/*.test.js" "All Tests with Coverage" ;;
                    7) run_test_suite "$NODE_TEST $FACADE_UNIT/registry.test.js $INTERNAL_LAYERS/builder.test.js" "Quick Smoke Test (2 critical tests)" ;;
                    8) find_smoke_tests ;;
                    0) echo -e "${CLR_SUCCESS}👋 Exiting DM test debugger. Happy testing!${CLR_RESET}"; exit 0 ;;
                    *) echo -e "${CLR_ERROR}❌ Invalid selection. Please choose 0-8.${CLR_RESET}"; echo ;;
                esac
                ;;
            "facade")
                show_facade_menu
                read -p "Enter your choice (b=back, 0=exit): " user_choice
                echo
                handle_facade_menu "$user_choice"
                ;;
            "internal")
                show_internal_menu
                read -p "Enter your choice (b=back, 0=exit): " user_choice
                echo
                handle_internal_menu "$user_choice"
                ;;
            "diagnostics")
                show_diagnostics_menu
                read -p "Enter your choice (b=back, 0=exit): " user_choice
                echo
                handle_diagnostics_menu "$user_choice"
                ;;
            "quick")
                show_quick_menu
                read -p "Enter your choice (b=back, 0=exit): " user_choice
                echo
                handle_quick_menu "$user_choice"
                ;;
        esac
        
        # Only show "Press Enter to continue" if we just ran a test
        if [[ $user_choice != "b" && $user_choice != "0" && $user_choice =~ ^[0-9]+$ ]]; then
            read -p "Press Enter to continue..." 
            echo
        fi
    done
}

# Start the program
main
