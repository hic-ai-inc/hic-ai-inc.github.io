#!/bin/bash
# PLG Website Test Debugging Commands - Interactive hierarchical test runner
# Uses HIC custom testing framework with ESM loader for layer imports

cd "$(dirname "$0")/.." || { echo "Error: Failed to change to PLG website directory"; exit 1; }

# Color definitions
declare -r CLR_ERROR='\e[91m'      # Bright red
declare -r CLR_SUCCESS='\e[92m'    # Bright green  
declare -r CLR_WARNING='\e[93m'    # Bright yellow
declare -r CLR_INFO='\e[94m'       # Bright blue
declare -r CLR_HEADER='\e[95m'     # Bright magenta
declare -r CLR_SUBMENU='\e[96m'    # Bright cyan
declare -r CLR_RESET='\e[0m'       # Reset

# Test path constants
declare -r TESTS_ROOT="__tests__"
declare -r UNIT_TESTS="$TESTS_ROOT/unit"
declare -r UNIT_LIB="$UNIT_TESTS/lib"
declare -r UNIT_API="$UNIT_TESTS/api"
declare -r UNIT_MIDDLEWARE="$UNIT_TESTS/middleware"
declare -r INTEGRATION_TESTS="$TESTS_ROOT/integration"
declare -r FIXTURES="$TESTS_ROOT/fixtures"

# Test commands - using HIC test framework with ESM loader
declare -r TEST_LOADER="../dm/facade/utils/test-loader.js"
declare -r NODE_TEST="node --loader $TEST_LOADER --test"
declare -r NODE_TEST_COVERAGE="node --loader $TEST_LOADER --test --experimental-test-coverage"
declare -r NODE_TEST_REPORTER_TAP="node --loader $TEST_LOADER --test --test-reporter=tap"
declare -r NODE_TEST_REPORTER_SPEC="node --loader $TEST_LOADER --test --test-reporter=spec"

# Global state for menu navigation
current_menu="main"

# ============================================================================
# HELPER FUNCTIONS
# ============================================================================

# Dynamic test discovery
list_test_files() {
    local test_dir="$1"
    local pattern="${2:-*.test.js}"
    find "$test_dir" -name "$pattern" 2>/dev/null | sort
}

# Select and run individual test file
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

# Run single test file by path
run_single_test() {
    local test_path="$1"
    if [ -f "$test_path" ]; then
        run_test_suite "$NODE_TEST $test_path" "$(basename $test_path)"
    else
        echo -e "${CLR_ERROR}❌ Test file not found: $test_path${CLR_RESET}"
    fi
}

# Search for tests by pattern
search_tests_by_pattern() {
    local base_dir="$1"
    local category_name="$2"
    
    echo -e "${CLR_INFO}🔍 Search for tests in ${category_name}${CLR_RESET}"
    read -p "Enter search pattern (e.g., 'stripe', 'auth', 'license'): " pattern
    
    if [ -n "$pattern" ]; then
        local matching_tests=$(grep -r "$pattern" "$base_dir" --include="*.test.js" -l 2>/dev/null | tr '\n' ' ')
        if [ -n "$matching_tests" ]; then
            run_test_suite "$NODE_TEST $matching_tests" "Tests matching '$pattern'"
        else
            echo -e "${CLR_WARNING}⚠️  No tests found matching '$pattern' in $base_dir${CLR_RESET}"
        fi
    fi
}

# Find tests containing specific term
find_tests_containing() {
    local search_term="$1"
    local description="$2"
    
    echo -e "${CLR_INFO}🔍 Finding tests containing '$search_term'...${CLR_RESET}"
    local matching_tests=$(grep -r "$search_term" $TESTS_ROOT/ --include="*.test.js" -l 2>/dev/null | tr '\n' ' ')
    if [ -n "$matching_tests" ]; then
        run_test_suite "$NODE_TEST $matching_tests" "$description"
    else
        echo -e "${CLR_WARNING}⚠️  No tests found containing '$search_term'${CLR_RESET}"
    fi
}

# Generate test statistics
generate_test_statistics() {
    echo -e "${CLR_INFO}📊 Generating Test Statistics...${CLR_RESET}"
    echo ""
    echo "Total test files:" $(find $TESTS_ROOT/ -name "*.test.js" 2>/dev/null | wc -l)
    echo "Unit tests:" $(find $UNIT_TESTS/ -name "*.test.js" 2>/dev/null | wc -l)
    echo "  - Library tests:" $(find $UNIT_LIB/ -name "*.test.js" 2>/dev/null | wc -l)
    echo "  - API tests:" $(find $UNIT_API/ -name "*.test.js" 2>/dev/null | wc -l)
    echo "  - Middleware tests:" $(find $UNIT_MIDDLEWARE/ -name "*.test.js" 2>/dev/null | wc -l)
    echo "Integration tests:" $(find $INTEGRATION_TESTS/ -name "*.test.js" 2>/dev/null | wc -l)
    echo ""
}

# Clean test cache
clean_test_cache() {
    echo -e "${CLR_WARNING}🧹 Cleaning test cache and temporary files...${CLR_RESET}"
    rm -rf coverage/ .nyc_output/ node_modules/.cache/ .next/cache/ 2>/dev/null || true
    echo -e "${CLR_SUCCESS}✅ Test cache cleaned${CLR_RESET}"
    echo ""
}

# ============================================================================
# TEST EXECUTION
# ============================================================================

run_test_suite() {
    local test_command="$1"
    local test_description="$2"
    local use_verbose="$3"
    
    echo -e "${CLR_INFO}🚀 Running: ${test_description}${CLR_RESET}"
    echo -e "${CLR_HEADER}Command: ${test_command}${CLR_RESET}"
    
    # Show coverage warning if experimental coverage is being used
    if [[ "$test_command" == *"--experimental-test-coverage"* ]]; then
        echo -e "${CLR_WARNING}⚠️  Using experimental Node.js test coverage${CLR_RESET}"
    fi
    
    echo -e "${CLR_HEADER}============================================================${CLR_RESET}"
    echo ""
    
    # Execute the test command
    local start_time=$(date +%s)
    
    eval "$test_command"
    local result_code=$?
    
    local end_time=$(date +%s)
    local duration=$((end_time - start_time))
    
    echo ""
    echo -e "${CLR_HEADER}============================================================${CLR_RESET}"
    
    if [ $result_code -eq 0 ]; then
        echo -e "${CLR_SUCCESS}✅ ${test_description} completed successfully (${duration}s)${CLR_RESET}"
    else
        echo -e "${CLR_ERROR}❌ ${test_description} failed with exit code ${result_code} (${duration}s)${CLR_RESET}"
        echo -e "${CLR_INFO}💡 Tip: Run individual tests to isolate failures${CLR_RESET}"
    fi
    echo ""
    
    return $result_code
}

# Run coverage only (no test output, just coverage report)
run_coverage_only() {
    local test_path="$1"
    local description="$2"
    
    echo -e "${CLR_INFO}📊 Generating coverage report: ${description}${CLR_RESET}"
    echo -e "${CLR_WARNING}⚠️  Running in coverage-only mode${CLR_RESET}"
    echo -e "${CLR_HEADER}============================================================${CLR_RESET}"
    
    $NODE_TEST_COVERAGE $test_path 2>&1 | awk '
        /^# start of coverage report/ { coverage_started = 1; next }
        coverage_started && /^#/ {
            gsub(/^# /, "");
            if ($0 ~ /100\.00.*100\.00.*100\.00/) {
                printf "\033[92m✅ %s\033[0m\n", $0;
            } else if ($0 ~ /[89][0-9]\.[0-9][0-9]/) {
                printf "\033[93m📊 %s\033[0m\n", $0;
            } else if ($0 ~ /[0-7][0-9]\.[0-9][0-9]/) {
                printf "\033[91m⚠️  %s\033[0m\n", $0;
            } else {
                printf "\033[96m%s\033[0m\n", $0;
            }
        }
    '
    
    echo -e "${CLR_HEADER}============================================================${CLR_RESET}"
    echo -e "${CLR_SUCCESS}✅ Coverage report generated${CLR_RESET}"
    echo ""
}

# ============================================================================
# MENU DISPLAYS
# ============================================================================

show_main_menu() {
    clear
    echo -e "${CLR_HEADER}"
    echo "╔══════════════════════════════════════════════════════════════╗"
    echo "║           PLG Website Test Debugger                          ║"
    echo "║       Interactive Test Runner with HIC Framework             ║"
    echo "╚══════════════════════════════════════════════════════════════╝"
    echo -e "${CLR_RESET}"
    echo ""
    echo -e "${CLR_INFO}📁 TEST CATEGORIES:${CLR_RESET}"
    echo "1) 📚 Library Tests (stripe, keygen, auth0)"
    echo "2) 🌐 API Route Tests"
    echo "3) 🛡️  Middleware Tests"
    echo "4) 🔗 Integration Tests"
    echo ""
    echo -e "${CLR_INFO}🎯 QUICK ACTIONS:${CLR_RESET}"
    echo "5) ▶️  Run All Tests"
    echo "6) 📊 Run All Tests with Coverage"
    echo "7) 🚀 Quick Smoke Test"
    echo "8) 🔍 Search Tests by Pattern"
    echo ""
    echo -e "${CLR_INFO}🛠️  UTILITIES:${CLR_RESET}"
    echo "9) 📈 Test Statistics"
    echo "10) 🧹 Clean Test Cache"
    echo ""
    echo "0) Exit"
    echo ""
}

show_lib_menu() {
    echo -e "${CLR_SUBMENU}=== 📚 LIBRARY TESTS ===${CLR_RESET}"
    echo "Tests for PLG library modules (Stripe, Keygen, Auth0)"
    echo ""
    echo -e "${CLR_INFO}🎯 INDIVIDUAL LIBRARIES:${CLR_RESET}"
    echo "1) Stripe Library Tests"
    echo "2) Keygen Library Tests"
    echo "3) Auth0 Library Tests"
    echo ""
    echo -e "${CLR_INFO}📦 BATCH OPERATIONS:${CLR_RESET}"
    echo "4) Run All Library Tests"
    echo "5) Run All Library Tests with Coverage"
    echo "6) Select Individual Test File"
    echo "7) Search Library Tests"
    echo ""
    echo "b) ← Back to Main Menu"
    echo "0) Exit"
    echo ""
}

show_api_menu() {
    echo -e "${CLR_SUBMENU}=== 🌐 API ROUTE TESTS ===${CLR_RESET}"
    echo "Tests for API endpoints"
    echo ""
    echo -e "${CLR_INFO}🎯 API CATEGORIES:${CLR_RESET}"
    echo "1) Auth API Tests (/api/auth/*)"
    echo "2) Billing API Tests (/api/billing/*)"
    echo "3) License API Tests (/api/license/*)"
    echo "4) User API Tests (/api/user/*)"
    echo ""
    echo -e "${CLR_INFO}📦 BATCH OPERATIONS:${CLR_RESET}"
    echo "5) Run All API Tests"
    echo "6) Run All API Tests with Coverage"
    echo "7) Select Individual Test File"
    echo "8) Search API Tests"
    echo ""
    echo "b) ← Back to Main Menu"
    echo "0) Exit"
    echo ""
}

show_middleware_menu() {
    echo -e "${CLR_SUBMENU}=== 🛡️  MIDDLEWARE TESTS ===${CLR_RESET}"
    echo "Tests for route protection and middleware"
    echo ""
    echo "1) Run All Middleware Tests"
    echo "2) Run with Coverage"
    echo "3) Select Individual Test File"
    echo ""
    echo "b) ← Back to Main Menu"
    echo "0) Exit"
    echo ""
}

show_integration_menu() {
    echo -e "${CLR_SUBMENU}=== 🔗 INTEGRATION TESTS ===${CLR_RESET}"
    echo "End-to-end workflow tests"
    echo ""
    echo "1) Run All Integration Tests"
    echo "2) Run with Coverage"
    echo "3) Select Individual Test File"
    echo ""
    echo "b) ← Back to Main Menu"
    echo "0) Exit"
    echo ""
}

# ============================================================================
# MENU HANDLERS
# ============================================================================

handle_lib_menu() {
    local choice="$1"
    
    case $choice in
        1) run_test_suite "$NODE_TEST $UNIT_LIB/stripe.test.js" "Stripe Library Tests" ;;
        2) run_test_suite "$NODE_TEST $UNIT_LIB/keygen.test.js" "Keygen Library Tests" ;;
        3) run_test_suite "$NODE_TEST $UNIT_LIB/auth0.test.js" "Auth0 Library Tests" ;;
        4) run_test_suite "$NODE_TEST $UNIT_LIB/*.test.js" "All Library Tests" ;;
        5) run_coverage_only "$UNIT_LIB/*.test.js" "Library Tests Coverage" ;;
        6) select_individual_test "$UNIT_LIB" "Library" ;;
        7) search_tests_by_pattern "$UNIT_LIB" "Library Tests" ;;
        b|B) current_menu="main"; return 0 ;;
        0) echo -e "${CLR_INFO}👋 Goodbye!${CLR_RESET}"; exit 0 ;;
        *) echo -e "${CLR_ERROR}❌ Invalid selection.${CLR_RESET}"; echo; return 1 ;;
    esac
}

handle_api_menu() {
    local choice="$1"
    
    case $choice in
        1) run_test_suite "$NODE_TEST $UNIT_API/auth/*.test.js" "Auth API Tests" ;;
        2) run_test_suite "$NODE_TEST $UNIT_API/billing/*.test.js" "Billing API Tests" ;;
        3) run_test_suite "$NODE_TEST $UNIT_API/license/*.test.js" "License API Tests" ;;
        4) run_test_suite "$NODE_TEST $UNIT_API/user/*.test.js" "User API Tests" ;;
        5) run_test_suite "$NODE_TEST $UNIT_API/**/*.test.js" "All API Tests" ;;
        6) run_coverage_only "$UNIT_API/**/*.test.js" "API Tests Coverage" ;;
        7) select_individual_test "$UNIT_API" "API" ;;
        8) search_tests_by_pattern "$UNIT_API" "API Tests" ;;
        b|B) current_menu="main"; return 0 ;;
        0) echo -e "${CLR_INFO}👋 Goodbye!${CLR_RESET}"; exit 0 ;;
        *) echo -e "${CLR_ERROR}❌ Invalid selection.${CLR_RESET}"; echo; return 1 ;;
    esac
}

handle_middleware_menu() {
    local choice="$1"
    
    case $choice in
        1) run_test_suite "$NODE_TEST $UNIT_MIDDLEWARE/*.test.js" "All Middleware Tests" ;;
        2) run_coverage_only "$UNIT_MIDDLEWARE/*.test.js" "Middleware Tests Coverage" ;;
        3) select_individual_test "$UNIT_MIDDLEWARE" "Middleware" ;;
        b|B) current_menu="main"; return 0 ;;
        0) echo -e "${CLR_INFO}👋 Goodbye!${CLR_RESET}"; exit 0 ;;
        *) echo -e "${CLR_ERROR}❌ Invalid selection.${CLR_RESET}"; echo; return 1 ;;
    esac
}

handle_integration_menu() {
    local choice="$1"
    
    case $choice in
        1) run_test_suite "$NODE_TEST $INTEGRATION_TESTS/*.test.js" "All Integration Tests" ;;
        2) run_coverage_only "$INTEGRATION_TESTS/*.test.js" "Integration Tests Coverage" ;;
        3) select_individual_test "$INTEGRATION_TESTS" "Integration" ;;
        b|B) current_menu="main"; return 0 ;;
        0) echo -e "${CLR_INFO}👋 Goodbye!${CLR_RESET}"; exit 0 ;;
        *) echo -e "${CLR_ERROR}❌ Invalid selection.${CLR_RESET}"; echo; return 1 ;;
    esac
}

# ============================================================================
# MAIN PROGRAM
# ============================================================================

main() {
    while true; do
        case $current_menu in
            "main")
                show_main_menu
                read -p "Enter your choice (0-10): " user_choice
                echo ""
                
                case $user_choice in
                    1) current_menu="lib" ;;
                    2) current_menu="api" ;;
                    3) current_menu="middleware" ;;
                    4) current_menu="integration" ;;
                    5) run_test_suite "$NODE_TEST $TESTS_ROOT/**/*.test.js" "All PLG Tests" ;;
                    6) run_coverage_only "$TESTS_ROOT/**/*.test.js" "All PLG Tests Coverage" ;;
                    7) 
                        # Quick smoke test - run core lib tests
                        if [ -f "$UNIT_LIB/stripe.test.js" ]; then
                            run_test_suite "$NODE_TEST $UNIT_LIB/stripe.test.js" "Quick Smoke Test (Stripe)"
                        else
                            echo -e "${CLR_WARNING}⚠️  No smoke test files found yet. Create tests first!${CLR_RESET}"
                        fi
                        ;;
                    8) 
                        read -p "Enter search pattern: " pattern
                        if [ -n "$pattern" ]; then
                            find_tests_containing "$pattern" "Tests matching '$pattern'"
                        fi
                        ;;
                    9) generate_test_statistics ;;
                    10) clean_test_cache ;;
                    0) echo -e "${CLR_SUCCESS}👋 Exiting PLG test debugger. Happy testing!${CLR_RESET}"; exit 0 ;;
                    *) echo -e "${CLR_ERROR}❌ Invalid selection. Please choose 0-10.${CLR_RESET}"; echo ;;
                esac
                ;;
            "lib")
                show_lib_menu
                read -p "Enter your choice (b=back, 0=exit): " user_choice
                echo ""
                handle_lib_menu "$user_choice"
                ;;
            "api")
                show_api_menu
                read -p "Enter your choice (b=back, 0=exit): " user_choice
                echo ""
                handle_api_menu "$user_choice"
                ;;
            "middleware")
                show_middleware_menu
                read -p "Enter your choice (b=back, 0=exit): " user_choice
                echo ""
                handle_middleware_menu "$user_choice"
                ;;
            "integration")
                show_integration_menu
                read -p "Enter your choice (b=back, 0=exit): " user_choice
                echo ""
                handle_integration_menu "$user_choice"
                ;;
        esac
        
        # Pause after running tests
        if [[ $user_choice != "b" && $user_choice != "B" && $user_choice != "0" && $user_choice =~ ^[0-9]+$ ]]; then
            read -p "Press Enter to continue..." 
            echo ""
        fi
    done
}

# Allow running single test file from command line
# Usage: ./debug-tests.sh path/to/test.test.js
if [ -n "$1" ]; then
    if [ -f "$1" ]; then
        run_single_test "$1"
    elif [ -f "$TESTS_ROOT/$1" ]; then
        run_single_test "$TESTS_ROOT/$1"
    else
        echo -e "${CLR_ERROR}❌ Test file not found: $1${CLR_RESET}"
        echo "Usage: $0 [test-file.test.js]"
        echo "       $0  (interactive mode)"
        exit 1
    fi
else
    main
fi
