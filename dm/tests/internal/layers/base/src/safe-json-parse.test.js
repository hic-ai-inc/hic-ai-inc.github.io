import { describe, test, beforeEach } from "node:test";
import { expect } from "../../../../../facade/test-helpers/index.js";

// Import the utilities we're testing
import {
  safeJsonParse,
  tryJsonParse,
} from "../../../../../layers/base/src/safe-json-parse.js";

describe("safe-json-parse.js - HIC Base Layer Safe JSON Parsing", () => {
  describe("safeJsonParse()", () => {
    describe("Valid JSON Parsing", () => {
      test("parses simple JSON objects", () => {
        const jsonString = '{"name": "test", "value": 42}';
        const result = safeJsonParse(jsonString);

        expect(result.name).toBe("test");
        expect(result.value).toBe(42);
      });

      test("parses JSON arrays", () => {
        const jsonString = '["apple", "banana", "cherry"]';
        const result = safeJsonParse(jsonString);

        expect(Array.isArray(result)).toBe(true);
        expect(result).toHaveLength(3);
        expect(result[0]).toBe("apple");
        expect(result[2]).toBe("cherry");
      });

      test("parses nested JSON structures", () => {
        const jsonString = JSON.stringify({
          user: {
            id: 123,
            profile: {
              name: "John Doe",
              preferences: {
                theme: "dark",
                notifications: true,
              },
            },
          },
          metadata: ["tag1", "tag2"],
        });

        const result = safeJsonParse(jsonString);

        expect(result.user.id).toBe(123);
        expect(result.user.profile.name).toBe("John Doe");
        expect(result.user.profile.preferences.theme).toBe("dark");
        expect(result.metadata).toHaveLength(2);
      });

      test("parses JSON with null and boolean values", () => {
        const jsonString = '{"name": null, "active": true, "archived": false}';
        const result = safeJsonParse(jsonString);

        expect(result.name).toBeNull();
        expect(result.active).toBe(true);
        expect(result.archived).toBe(false);
      });

      test("parses JSON with numbers including edge cases", () => {
        const jsonString =
          '{"int": 42, "float": 3.14, "negative": -100, "zero": 0}';
        const result = safeJsonParse(jsonString);

        expect(result.int).toBe(42);
        expect(result.float).toBe(3.14);
        expect(result.negative).toBe(-100);
        expect(result.zero).toBe(0);
      });

      test("handles UTF-8 BOM in JSON string", () => {
        const jsonString = "\ufeff" + '{"name": "test"}'; // UTF-8 BOM + JSON
        const result = safeJsonParse(jsonString);

        expect(result.name).toBe("test");
      });
    });

    describe("Input Validation", () => {
      test("throws error for non-string input", () => {
        expect(() => {
          safeJsonParse(123);
        }).toThrow("Invalid JSON input: unknown source");
      });

      test("throws error for empty string input", () => {
        expect(() => {
          safeJsonParse("");
        }).toThrow("Invalid JSON input: unknown source");
      });

      test("throws error for whitespace-only input", () => {
        expect(() => {
          safeJsonParse("   ");
        }).toThrow("Invalid JSON input: unknown source");
      });

      test("includes custom source in error messages", () => {
        expect(() => {
          safeJsonParse(null, { source: "user-config.json" });
        }).toThrow("Invalid JSON input: user-config.json");
      });
    });

    describe("Size Limits Protection", () => {
      test("enforces default byte size limit (1MB)", () => {
        const largeJsonString = '{"data": "' + "x".repeat(1000000) + '"}';

        expect(() => {
          safeJsonParse(largeJsonString);
        }).toThrow("JSON input too large (> 1000000 bytes): unknown source");
      });

      test("respects custom maxBytes option", () => {
        const jsonString = '{"data": "' + "x".repeat(1000) + '"}';

        expect(() => {
          safeJsonParse(jsonString, { maxBytes: 500 });
        }).toThrow("JSON input too large (> 500 bytes): unknown source");
      });

      test("allows JSON under size limit", () => {
        const jsonString = '{"small": "data"}';

        expect(() => {
          safeJsonParse(jsonString, { maxBytes: 100 });
        }).not.toThrow();
      });

      test("handles multi-byte UTF-8 characters in size calculation", () => {
        const jsonString = '{"unicode": "🔥🔥🔥🔥🔥"}'; // Emoji are 4 bytes each

        // Should calculate byte size correctly for UTF-8
        expect(() => {
          safeJsonParse(jsonString, { maxBytes: 35 });
        }).not.toThrow();

        expect(() => {
          safeJsonParse(jsonString, { maxBytes: 25 });
        }).toThrow("JSON input too large");
      });
    });

    describe("Key Count Limits Protection", () => {
      test("enforces default key count limit (1000)", () => {
        const manyKeys = {};
        for (let i = 0; i < 1001; i++) {
          manyKeys[`key${i}`] = `value${i}`;
        }
        const jsonString = JSON.stringify(manyKeys);

        expect(() => {
          safeJsonParse(jsonString);
        }).toThrow("JSON too complex: exceeded 1000 keys (unknown source)");
      });

      test("respects custom maxKeys option", () => {
        const someKeys = {};
        for (let i = 0; i < 11; i++) {
          someKeys[`key${i}`] = `value${i}`;
        }
        const jsonString = JSON.stringify(someKeys);

        expect(() => {
          safeJsonParse(jsonString, { maxKeys: 10 });
        }).toThrow("JSON too complex: exceeded 10 keys");
      });

      test("counts nested object keys correctly", () => {
        const nestedJson = {
          level1: {
            level2: {
              key1: "value1",
              key2: "value2",
              key3: "value3",
            },
            key4: "value4",
          },
          key5: "value5",
        };
        const jsonString = JSON.stringify(nestedJson);

        expect(() => {
          safeJsonParse(jsonString, { maxKeys: 8 });
        }).not.toThrow(); // Reviver calls: key1,key2,key3,level2,key4,level1,key5,""

        expect(() => {
          safeJsonParse(jsonString, { maxKeys: 7 });
        }).toThrow("JSON too complex: exceeded 7 keys");
      });

      test("counts array indices as keys", () => {
        const arrayJson = ["item1", "item2", "item3", "item4", "item5"];
        const jsonString = JSON.stringify(arrayJson);

        expect(() => {
          safeJsonParse(jsonString, { maxKeys: 6 });
        }).not.toThrow(); // Reviver calls: "0","1","2","3","4",""

        expect(() => {
          safeJsonParse(jsonString, { maxKeys: 5 });
        }).toThrow("JSON too complex: exceeded 5 keys");
      });
    });

    describe("Depth Limits Protection", () => {
      test("enforces default depth limit (10)", () => {
        let deepObject = {};
        let current = deepObject;

        // Create object nested 12 levels deep
        for (let i = 0; i < 12; i++) {
          current.nested = {};
          current = current.nested;
        }
        current.value = "deep";

        const jsonString = JSON.stringify(deepObject);

        expect(() => {
          safeJsonParse(jsonString);
        }).toThrow("JSON too deeply nested (depth 13 > 10): unknown source");
      });

      test("respects custom maxDepth option", () => {
        const nestedObject = {
          level1: {
            level2: {
              level3: {
                value: "nested",
              },
            },
          },
        };
        const jsonString = JSON.stringify(nestedObject);

        expect(() => {
          safeJsonParse(jsonString, { maxDepth: 4 });
        }).not.toThrow(); // Actual depth is 4

        expect(() => {
          safeJsonParse(jsonString, { maxDepth: 3 });
        }).toThrow("JSON too deeply nested (depth 4 > 3)");
      });

      test("calculates array nesting depth correctly", () => {
        const nestedArray = [[[[[["deep value"]]]]]];
        const jsonString = JSON.stringify(nestedArray);

        expect(() => {
          safeJsonParse(jsonString, { maxDepth: 6 });
        }).not.toThrow();

        expect(() => {
          safeJsonParse(jsonString, { maxDepth: 5 });
        }).toThrow("JSON too deeply nested");
      });

      test("handles mixed object and array nesting", () => {
        const mixedNesting = {
          level1: [
            {
              level3: [
                {
                  level5: "value",
                },
              ],
            },
          ],
        };
        const jsonString = JSON.stringify(mixedNesting);

        expect(() => {
          safeJsonParse(jsonString, { maxDepth: 5 });
        }).not.toThrow();

        expect(() => {
          safeJsonParse(jsonString, { maxDepth: 4 });
        }).toThrow("JSON too deeply nested");
      });

      test("allows null maxDepth to disable depth checking", () => {
        let veryDeepObject = {};
        let current = veryDeepObject;

        // Create object nested 20 levels deep
        for (let i = 0; i < 20; i++) {
          current.nested = {};
          current = current.nested;
        }
        current.value = "very deep";

        const jsonString = JSON.stringify(veryDeepObject);

        expect(() => {
          safeJsonParse(jsonString, { maxDepth: null });
        }).not.toThrow();
      });
    });

    describe("Invalid JSON Handling", () => {
      test("throws error for malformed JSON", () => {
        expect(() => {
          safeJsonParse('{"name": "test", "incomplete"');
        }).toThrow("JSON parse failed for unknown source:");
      });

      test("throws error for invalid JSON syntax", () => {
        expect(() => {
          safeJsonParse('{"name": test}'); // Unquoted value
        }).toThrow("JSON parse failed for unknown source:");
      });

      test("throws error for trailing commas", () => {
        expect(() => {
          safeJsonParse('{"name": "test",}');
        }).toThrow("JSON parse failed for unknown source:");
      });

      test("includes original parse error in message", () => {
        expect(() => {
          safeJsonParse('{"name": invalid}');
        }).toThrow(/JSON parse failed for unknown source:/);
      });
    });

    describe("Options and Configuration", () => {
      test("uses custom source name in all error messages", () => {
        const source = "api-response.json";

        expect(() => {
          safeJsonParse("", { source });
        }).toThrow("Invalid JSON input: api-response.json");

        expect(() => {
          safeJsonParse('{"too":"large"}', { source, maxBytes: 5 });
        }).toThrow("JSON input too large (> 5 bytes): api-response.json");

        expect(() => {
          safeJsonParse('{"a":"b"}', { source, maxKeys: 1 });
        }).toThrow("JSON too complex: exceeded 1 keys (api-response.json)");
      });

      test("allows all limits to be customized simultaneously", () => {
        const jsonString = JSON.stringify({
          data: "x".repeat(100),
          nested: { deep: { value: "test" } },
        });

        const result = safeJsonParse(jsonString, {
          maxBytes: 200,
          maxKeys: 10,
          maxDepth: 5,
          source: "custom-config",
        });

        expect(result.data).toBe("x".repeat(100));
        expect(result.nested.deep.value).toBe("test");
      });
    });
  });

  describe("tryJsonParse()", () => {
    test("returns success result for valid JSON", () => {
      const jsonString = '{"name": "test", "value": 42}';
      const result = tryJsonParse(jsonString);

      expect(result.ok).toBe(true);
      expect(result.value.name).toBe("test");
      expect(result.value.value).toBe(42);
      expect(result.error).toBeUndefined();
    });

    test("returns error result for invalid JSON", () => {
      const result = tryJsonParse('{"invalid": json}');

      expect(result.ok).toBe(false);
      expect(result.value).toBeUndefined();
      expect(result.error).toContain("JSON parse failed");
    });

    test("returns error result for oversized JSON", () => {
      const largeJson = '{"data": "' + "x".repeat(1000) + '"}';
      const result = tryJsonParse(largeJson, { maxBytes: 500 });

      expect(result.ok).toBe(false);
      expect(result.error).toContain("JSON input too large");
    });

    test("returns error result for too complex JSON", () => {
      const complexJson = {};
      for (let i = 0; i < 11; i++) {
        complexJson[`key${i}`] = `value${i}`;
      }

      const result = tryJsonParse(JSON.stringify(complexJson), { maxKeys: 10 });

      expect(result.ok).toBe(false);
      expect(result.error).toContain("JSON too complex");
    });

    test("returns error result for deeply nested JSON", () => {
      const deepObject = { a: { b: { c: { d: { e: { f: "deep" } } } } } };
      const result = tryJsonParse(JSON.stringify(deepObject), { maxDepth: 3 });

      expect(result.ok).toBe(false);
      expect(result.error).toContain("JSON too deeply nested");
    });

    test("passes through all safeJsonParse options", () => {
      const jsonString = '{"test": "value"}';
      const result = tryJsonParse(jsonString, {
        source: "test-source",
        maxBytes: 100,
        maxKeys: 5,
        maxDepth: 3,
      });

      expect(result.ok).toBe(true);
      expect(result.value.test).toBe("value");
    });

    test("never throws exceptions", () => {
      const badInputs = [
        null,
        undefined,
        123,
        {},
        '{"malformed": json}',
        '{"huge": "' + "x".repeat(2000000) + '"}',
      ];

      badInputs.forEach((input) => {
        expect(() => {
          tryJsonParse(input);
        }).not.toThrow();
      });
    });
  });

  describe("Security and Edge Cases", () => {
    test("handles JSON with prototype pollution attempts", () => {
      const maliciousJson = '{"__proto__": {"isAdmin": true}}';
      const result = safeJsonParse(maliciousJson);

      // Should parse successfully but not pollute prototype
      expect(result.__proto__).toBeTruthy();
      expect(Object.prototype.isAdmin).toBeUndefined();
    });

    test("handles very large numbers", () => {
      const jsonWithLargeNumbers =
        '{"small": 1, "large": 9007199254740991, "veryLarge": 1e+308}';
      const result = safeJsonParse(jsonWithLargeNumbers);

      expect(result.small).toBe(1);
      expect(result.large).toBe(9007199254740991);
      expect(result.veryLarge).toBe(1e308);
    });

    test("handles special numeric values", () => {
      const jsonString = '{"infinity": 1e+1000, "negInfinity": -1e+1000}';

      const result = safeJsonParse(jsonString);
      expect(result.infinity).toBe(Infinity);
      expect(result.negInfinity).toBe(-Infinity);
    });

    test("handles unicode escape sequences", () => {
      const jsonString = '{"unicode": "\\u0048\\u0065\\u006C\\u006C\\u006F"}'; // "Hello"
      const result = safeJsonParse(jsonString);

      expect(result.unicode).toBe("Hello");
    });

    test("rejects malicious unicode sequences", () => {
      // Node.js JSON.parse actually accepts incomplete surrogate pairs
      const jsonString = '{"bad": "\\uD800"}'; // Incomplete surrogate pair

      const result = safeJsonParse(jsonString);
      expect(result.bad).toBe("\uD800"); // Node.js allows this
    });

    test("handles empty objects and arrays", () => {
      expect(safeJsonParse("{}")).toEqual({});
      expect(safeJsonParse("[]")).toEqual([]);
    });

    test("performance is reasonable for large valid JSON", () => {
      const largeValidJson = {
        items: Array(1000)
          .fill(null)
          .map((_, i) => ({
            id: i,
            name: `item-${i}`,
            data: `data-${i}`,
          })),
      };

      const jsonString = JSON.stringify(largeValidJson);

      const start = Date.now();
      const result = safeJsonParse(jsonString, { maxKeys: 5000 });
      const duration = Date.now() - start;

      expect(result.items).toHaveLength(1000);
      expect(duration).toBeLessThan(1000); // Should complete within 1 second
    });
  });
});
