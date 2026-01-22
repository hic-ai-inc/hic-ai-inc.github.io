# Changelog

All notable changes to the HIC Dependency Manager will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added
- Comprehensive backup system for layer ZIPs and configuration files
- `prepare-version-update.sh` - Safe version update preparation with rollback capability
- `deploy-layer-update.sh` - Module-by-module layer deployment with dry-run support
- `rollback-layers.sh` - Module rollback with layer restoration capability
- `list-deployed-layers.sh` - AWS layer deployment status with auto-discovery
- `list-layer-backups.sh` - Layer backup management and restoration
- `validate-all-dependencies.sh` - Comprehensive dependency health checks
- Auto-discovery of layers from build scripts (zero maintenance)
- Backup directory structure for historical layer tracking
- Input validation and error handling across all scripts

### Changed
- Moved legacy dependency scripts to `/legacy/` directory
- Reorganized directory structure for better maintainability
- Consolidated testing directories (`/testing/` → `/examples/`)
- Moved implementation docs to `/docs/implementation/`
- Enhanced error handling with automatic rollback on failures

### Fixed
- Environment variable extraction and validation in all scripts
- Proper backup creation and restoration workflows
- Script dependencies and prerequisite checking

## [1.0.0] - 2025-08-20

### Added
- Complete modular Lambda layer system (7 specialized layers)
- Centralized version management via `versions.env`
- Modular testing infrastructure with selective mock building
- Build and deploy orchestration scripts
- Comprehensive dependency analysis tools
- Module conversion utilities for existing projects
- Layer compatibility validation
- Security scanning for hardcoded credentials

### Infrastructure
- `hic-base-layer` - Core utilities (safe-logger, safe-json-parse)
- `hic-dynamodb-layer` - DynamoDB + util-dynamodb
- `hic-messaging-layer` - SQS + SNS operations
- `hic-storage-layer` - S3 operations
- `hic-sfn-layer` - Step Functions
- `hic-bedrock-layer` - Bedrock Runtime
- `hic-config-layer` - Secrets Manager + SSM

### Testing
- Jest infrastructure with shared configuration
- Modular mock system for AWS services
- npm link deployment for global access
- Selective mock building capability

### Documentation
- Root cause analysis of dependency bloat
- Implementation strategies and cleanup plans
- Testing isolation strategies
- Migration guides for existing modules

### Impact
- 99% package size reduction for Lambda functions
- Eliminated 10x dependency bloat across 81 Lambda functions
- Reduced deployment times from minutes to seconds
- Zero testing dependencies in production Lambda packages