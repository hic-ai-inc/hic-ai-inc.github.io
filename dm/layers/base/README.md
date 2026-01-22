# HIC Base Layer Universal Utilities

Universal utilities included in every HIC Lambda function via the base layer.

## 📁 Current Utilities

### safe-logger.js
Secure logging utility with sanitization and structured output.

### safe-json-parse.js  
Safe JSON parsing with error handling and fallback values.

## 🔮 Future Utilities (Planned)

### cloudwatch-metrics.js
Custom CloudWatch metrics for Lambda monitoring.

### error-handler.js
Standardized error handling and reporting.

### config-manager.js
Environment-specific configuration management.

### tracing-utils.js
X-Ray tracing and performance monitoring utilities.

## 📦 Adding New Utilities

To add a new universal utility:

1. **Add the .js file** to this directory
2. **Update package.json** `files` array to include the new file
3. **Run build script** - automatically includes all .js files
4. **No script changes needed** - dynamic file discovery

## 🎯 Design Principles

- **Universal**: Every Lambda function gets these utilities
- **Lightweight**: Keep utilities small and focused
- **Zero dependencies**: No external packages in base utilities
- **Self-contained**: Each utility works independently

## 🔧 Usage in Lambda Functions

```javascript
// Import from base layer
const { safeLogger } = require('hic-base-layer/safe-logger');
const { safeJsonParse } = require('hic-base-layer/safe-json-parse');

exports.handler = async (event) => {
    const logger = safeLogger('my-function');
    const data = safeJsonParse(event.body, { source: 'api-request' });
    // Function logic here
};
```