# Create-Zip Test Suite Refactoring Plan

**Date**: September 1, 2025  
**File**: `dm/tests/internal/utils/create-zip.test.js`  
**Current State**: 1,600+ lines, 69/69 tests passing  
**Goal**: Production-grade test suite with improved maintainability, performance, and organization

## Executive Summary

The create-zip test suite has grown to over 1,600 lines with significant code duplication, inconsistent patterns, and organizational issues. This plan outlines a systematic 5-phase refactoring approach to transform it into a production-grade test suite while maintaining 100% test coverage throughout the process.

## Current Issues Identified

### Code Quality Issues

- **15+ similar helper functions** with overlapping functionality
- **Magic numbers and strings** scattered throughout the code
- **Inconsistent test patterns** and setup/teardown procedures
- **Limited error context** in assertions and debugging

### Organizational Issues

- **Tests scattered** without clear logical grouping
- **No clear separation** between different test concerns
- **Redundant test setup** code repeated across test suites
- **Inconsistent naming patterns** for similar functionality

### Performance Issues

- **Redundant file system operations** creating unnecessary overhead
- **Inefficient cleanup patterns** with potential resource leaks
- **Hard-coded test sizes** without environment-based scaling
- **No performance monitoring** or resource usage tracking

### Maintenance Issues

- **Limited inline documentation** making code hard to understand
- **No centralized configuration** for test parameters
- **Inconsistent error handling** patterns across different test types
- **No automated validation** of test suite health

## Refactoring Plan Overview

### Multi-Session Strategy

Given the file's complexity and size, this refactoring will be split across **5 GitHub Copilot sessions** to maintain context and ensure quality at each step.

### Success Metrics

- ✅ Maintain 69/69 tests passing throughout refactoring
- ✅ Reduce code duplication by ~40%
- ✅ Improve test execution performance by ~20%
- ✅ Achieve 100% JSDoc coverage for helper functions
- ✅ Standardize all test patterns and error handling

---

## Phase 1: Foundation & Structure

**Session**: 1 (Current)  
**Estimated Effort**: 30-40% of total work  
**Dependencies**: None

### 1.1 Test Configuration & Constants Consolidation

**Current Problem**: Magic numbers and configuration scattered throughout 1,600+ lines

**Solution**: Create centralized configuration object

```javascript
const TEST_CONFIG = {
  paths: {
    tempRoot:
      process.env.HIC_TEST_TMP_ROOT ||
      path.join(process.cwd(), ".tmp-tests", "create-zip"),
    defaultSource: "layer",
    defaultOutput: "layer.zip",
  },
  limits: {
    lightFileCount: 10,
    heavyFileCount: process.env.RUN_HEAVY_TESTS === "1" ? 100 : 10,
    lightDepth: 5,
    heavyDepth: process.env.RUN_HEAVY_TESTS === "1" ? 20 : 5,
    longNameLength: process.env.RUN_HEAVY_TESTS === "1" ? 100 : 40,
    maxTestDuration: 5000,
    cleanupRetries: 5,
    cleanupDelay: 25,
  },
  fileContent: {
    simpleJs: "export const test = {};",
    largeMockData: "x".repeat(100),
    deepFileContent: "deep content",
  },
  commands: {
    powershell: {
      noProfile: "-NoProfile",
      nonInteractive: "-NonInteractive",
      command: "-Command",
    },
  },
};
```

**Benefits**:

- Single source of truth for all test parameters
- Easy environment-based configuration
- Improved maintainability and consistency

### 1.2 Helper Function Consolidation

**Current Problem**: 15+ similar helper functions with overlapping responsibilities

**Solution**: Consolidate into 4 core helper classes

#### TestPathManager Class

```javascript
class TestPathManager {
  constructor(config = TEST_CONFIG) {
    this.config = config;
    this.tempDirs = [];
  }

  createTempDir(prefix = "cz-") {
    // Unified temp directory creation using project-scoped root
  }

  createTestPaths(tempDir, sourceName, outputName) {
    // Standardized path creation with validation
  }

  cleanup() {
    // Enhanced cleanup with Windows compatibility and retry logic
  }

  verifyAccess() {
    // Access verification for temp root directory
  }
}
```

#### MockFactory Class

```javascript
class MockFactory {
  createRunner(name = "mockRunner", returnValue = Buffer.alloc(0)) {
    // Unified mock runner creation with customizable behavior
  }

  createConsoleSpies(methods = ["log", "error", "warn"]) {
    // Console spy management with automatic cleanup
  }

  createCliSpies() {
    // CLI-specific spies (log, error, exit) with proper restoration
  }

  createProcessSpies() {
    // Process-related spies (chdir, etc.) with state management
  }
}
```

#### TestDataBuilder Class

```javascript
class TestDataBuilder {
  constructor(pathManager, config = TEST_CONFIG) {
    this.pathManager = pathManager;
    this.config = config;
  }

  createFileStructure(type, basePath, options = {}) {
    // Unified file structure creation (simple, nested, withHidden, large)
  }

  createLambdaLayer(layerDir, runtime = "nodejs", options = {}) {
    // Lambda-specific layer structures with runtime support
  }

  createRuntimeLayer(type, basePath, options = {}) {
    // Runtime-specific layers (nodejs, python, mixed)
  }
}
```

#### AssertionHelpers Class

```javascript
class AssertionHelpers {
  assertValidPowerShellCommand(command) {
    // Standardized PowerShell command validation
  }

  assertRunnerCalled(runner, expectedTimes = 1, expectedArgs = null) {
    // Enhanced runner assertion with argument validation
  }

  assertErrorPattern(error, pattern, context = "") {
    // Improved error assertion with context information
  }

  assertFileSystemState(path, expectedState) {
    // File system state validation
  }
}
```

**Benefits**:

- ~40% reduction in code duplication
- Clear separation of concerns
- Consistent patterns across all tests
- Easier testing and maintenance of helper functions themselves

---

## Phase 2: Test Suite Organization

**Session**: 2  
**Estimated Effort**: 25-30% of total work  
**Dependencies**: Phase 1 complete

### 2.1 Logical Test Suite Grouping

**Current Problem**: Tests scattered without clear organization across 1,600+ lines

**Solution**: Reorganize into 6 clear test suites

1. **Basic Functionality Tests**

   - Core createZip functionality
   - Basic path handling
   - Standard success scenarios

2. **Path Handling Tests**

   - Absolute vs relative paths
   - Long path names
   - Unicode characters
   - Windows-specific path issues

3. **Error Scenario Tests**

   - Invalid inputs
   - File system errors
   - Permission issues
   - Edge cases

4. **CLI Integration Tests**

   - Command-line interface
   - Argument parsing
   - Exit codes and error handling

5. **Performance & Edge Case Tests**

   - Large directories
   - Deep nesting
   - Performance monitoring
   - Resource usage

6. **Lambda Layer Tests**
   - Lambda-specific functionality
   - Runtime-specific layers
   - Node modules handling

### 2.2 Standardized Test Patterns

**Current Problem**: Inconsistent test structure and setup/teardown

**Solution**: Implement StandardTestSuite base class

```javascript
class StandardTestSuite {
  constructor(suiteName, pathManager, mockFactory, assertionHelpers) {
    this.name = suiteName;
    this.pathManager = pathManager;
    this.mockFactory = mockFactory;
    this.assertions = assertionHelpers;
  }

  runStandardTest(testName, setupFn, testFn, options = {}) {
    // Standardized test execution with:
    // - Consistent setup/teardown
    // - Error handling
    // - Performance monitoring
    // - Resource cleanup
  }

  runErrorTest(testName, setupFn, expectedError, options = {}) {
    // Standardized error test execution with:
    // - Proper error capture
    // - Context preservation
    // - Cleanup on failure
  }

  runPerformanceTest(testName, setupFn, testFn, expectedMaxDuration) {
    // Performance test with timing and resource monitoring
  }
}
```

**Benefits**:

- Consistent test structure across all suites
- Reduced boilerplate code
- Better error handling and reporting
- Easier addition of new test types

---

## Phase 3: Error Handling & Validation

**Session**: 3  
**Estimated Effort**: 15-20% of total work  
**Dependencies**: Phase 2 complete

### 3.1 Centralized Error Testing Framework

**Current Problem**: Inconsistent error handling patterns across different test types

**Solution**: Unified error testing framework

```javascript
class ErrorTestFramework {
  constructor(pathManager, mockFactory, assertions) {
    this.pathManager = pathManager;
    this.mockFactory = mockFactory;
    this.assertions = assertions;
  }

  testErrorScenario(scenario, expectedPattern, setupFn, options = {}) {
    // Unified error testing with:
    // - Proper setup and teardown
    // - Enhanced error context
    // - Pattern matching with helpful diagnostics
    // - Cleanup on both success and failure
  }

  testValidationFailure(input, expectedValidationError, validator) {
    // Standardized input validation testing
  }

  testFileSystemError(fsErrorType, expectedBehavior) {
    // File system error simulation and testing
  }

  testTimeoutScenario(timeoutDuration, expectedTimeoutBehavior) {
    // Timeout testing with proper cleanup
  }
}
```

### 3.2 Enhanced Assertions & Diagnostics

**Current Problem**: Basic assertions with limited error context

**Improvements**:

- **Better error messages** with context about what was being tested
- **Standardized assertion patterns** across all test types
- **Enhanced debugging information** for test failures
- **Assertion chaining** for complex validation scenarios

```javascript
// Example enhanced assertion
this.assertions
  .assertValidPowerShellCommand(command)
  .withContext("Testing long path scenario")
  .shouldContain("Compress-Archive")
  .shouldEscapeSpecialCharacters()
  .shouldHandleLongPaths();
```

**Benefits**:

- Faster debugging of test failures
- More informative error messages
- Consistent error reporting patterns
- Better test maintainability

---

## Phase 4: Performance & Resource Management

**Session**: 4  
**Estimated Effort**: 10-15% of total work  
**Dependencies**: Phase 3 complete

### 4.1 File System Operation Optimization

**Current Problems**:

- Redundant file creation across tests
- Inefficient cleanup patterns
- Resource leaks in error scenarios
- No lazy loading of test data

**Solutions**:

- **Lazy file system operations** - create files only when needed
- **Resource pooling** for temp directories - reuse when possible
- **Enhanced cleanup** with retry logic and Windows compatibility
- **File system operation caching** for repeated structures

```javascript
class OptimizedFileSystemManager {
  constructor() {
    this.cachedStructures = new Map();
    this.resourcePool = new Map();
  }

  getCachedStructure(structureType, options) {
    // Return cached structure if available, create if needed
  }

  borrowTempDirectory(prefix) {
    // Resource pooling for temp directories
  }

  returnTempDirectory(dir) {
    // Return directory to pool after cleanup
  }
}
```

### 4.2 Performance Monitoring & Metrics

**Add comprehensive performance tracking**:

- Test execution time monitoring
- Resource usage tracking (memory, file handles)
- Cleanup efficiency metrics
- Performance regression detection

```javascript
class PerformanceMonitor {
  startTest(testName) {
    // Begin performance monitoring
  }

  endTest(testName) {
    // End monitoring and collect metrics
  }

  reportMetrics() {
    // Generate performance report
  }

  checkForRegressions() {
    // Compare against performance baselines
  }
}
```

**Benefits**:

- ~20% improvement in test execution time
- Better resource utilization
- Early detection of performance regressions
- Optimized CI/CD pipeline performance

---

## Phase 5: Documentation & Maintenance

**Session**: 5  
**Estimated Effort**: 10-15% of total work  
**Dependencies**: Phase 4 complete

### 5.1 Comprehensive Documentation

**Current Problem**: Limited inline documentation (< 20% coverage)

**Goal**: 100% JSDoc coverage for all helper functions

**Documentation Standards**:

```javascript
/**
 * Creates a standardized test environment with proper cleanup
 * @param {string} testName - Descriptive name for the test
 * @param {Function} setupFn - Function to set up test conditions
 * @param {Function} testFn - Main test logic
 * @param {Object} options - Test configuration options
 * @param {boolean} options.skipCleanup - Skip automatic cleanup
 * @param {number} options.timeout - Test timeout in milliseconds
 * @param {boolean} options.performanceMonitoring - Enable performance tracking
 * @returns {Object} Test results and metrics
 * @throws {Error} When test setup fails or test assertions fail
 * @example
 * runStandardTest("basic zip creation",
 *   (paths) => createSimpleSource(paths.src),
 *   (paths) => expect(buildPsCommand(paths.src, paths.out)).toMatch(/Compress-Archive/)
 * );
 */
```

**Additional Documentation**:

- **Test Suite Architecture Guide** - How the refactored test suite works
- **Troubleshooting Guide** - Common issues and solutions
- **Performance Tuning Guide** - Optimizing test execution
- **Contributing Guide** - How to add new tests consistently

### 5.2 Maintenance Tools

**Add automated maintenance capabilities**:

```javascript
class TestSuiteHealthChecker {
  validateConfiguration() {
    // Ensure all configuration is valid
  }

  checkResourceLeaks() {
    // Verify no temp files or handles are leaked
  }

  validateTestCoverage() {
    // Ensure all code paths are tested
  }

  reportHealth() {
    // Generate test suite health report
  }
}
```

**Automated Tools**:

- Configuration validation on test startup
- Resource leak detection
- Test coverage verification
- Performance baseline updates

**Benefits**:

- Self-maintaining test suite
- Early detection of configuration issues
- Consistent test quality over time
- Easier onboarding for new team members

---

## Implementation Strategy

### Session Breakdown

| Session | Phase          | Focus                     | Duration  | Success Criteria                                  |
| ------- | -------------- | ------------------------- | --------- | ------------------------------------------------- |
| 1       | Foundation     | Config + Helper Classes   | 2-3 hours | 4 helper classes implemented, 69/69 tests passing |
| 2       | Organization   | Test Suite Structure      | 2-3 hours | 6 logical test suites, StandardTestSuite pattern  |
| 3       | Error Handling | ErrorTestFramework        | 1-2 hours | Unified error patterns, enhanced assertions       |
| 4       | Performance    | Optimization + Monitoring | 1-2 hours | 20% performance improvement, resource monitoring  |
| 5       | Documentation  | Docs + Maintenance        | 1-2 hours | 100% JSDoc coverage, maintenance tools            |

### Risk Mitigation

- **Incremental approach** - Each phase builds on the previous
- **Test coverage maintenance** - 69/69 tests must pass after each session
- **Rollback capability** - Each phase can be reverted independently
- **Context preservation** - Detailed documentation for each session transition

### Quality Gates

After each phase:

- ✅ All 69 tests must pass
- ✅ No new ESLint errors
- ✅ Performance must not degrade
- ✅ Code coverage must not decrease

---

## Expected Outcomes

### Quantitative Improvements

- **40% reduction** in code duplication
- **20% improvement** in test execution time
- **100% JSDoc coverage** for helper functions
- **60% reduction** in boilerplate test code
- **90% reduction** in magic numbers and hard-coded values

### Qualitative Improvements

- **Enhanced maintainability** through clear separation of concerns
- **Improved readability** with consistent patterns and documentation
- **Better error handling** with informative error messages and context
- **Production-ready quality** with comprehensive testing and monitoring
- **Future-proof design** that easily accommodates new test requirements

### Team Benefits

- **Faster development** of new tests using standardized patterns
- **Easier debugging** with enhanced error reporting and context
- **Reduced cognitive load** with well-organized, documented code
- **Consistent quality** through automated validation and maintenance tools

---

## Conclusion

This comprehensive refactoring plan transforms a complex, hard-to-maintain test file into a production-grade test suite. The multi-session approach ensures we maintain test coverage while systematically improving code quality, performance, and maintainability.

The plan prioritizes the most impactful changes first (foundation and structure) while building toward advanced features (performance monitoring and automated maintenance). Each phase delivers immediate value while setting up the foundation for subsequent improvements.

**Next Step**: Begin Phase 1 implementation with TEST_CONFIG consolidation and helper class creation.
