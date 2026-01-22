/**
 * Spy utilities for function mocking
 * Provides Jest-like spying functionality
 */

export function createSpy(name = "spy") {
  const calls = [];
  let returnValue;
  let implementation;
  const queuedImplementations = [];

  const spy = (...args) => {
    calls.push(args);
    spy.called = true;
    spy.callCount++;

    // Check for queued implementations first (for "once" methods)
    if (queuedImplementations.length > 0) {
      const queuedImpl = queuedImplementations.shift();
      return queuedImpl(...args);
    }

    if (implementation) {
      return implementation(...args);
    }
    return returnValue;
  };

  // Spy properties
  spy.called = false;
  spy.callCount = 0;
  spy.calls = calls;
  spy.returnValue = undefined;
  spy.queuedImplementations = queuedImplementations;

  // Set name property carefully to avoid read-only issues
  Object.defineProperty(spy, "name", {
    value: name,
    writable: false,
    configurable: true,
  });

  // Jest-like methods
  spy.calledWith = (...args) => {
    return calls.some((call) => JSON.stringify(call) === JSON.stringify(args));
  };

  spy.mockReturnValue = (value) => {
    returnValue = value;
    spy.returnValue = value; // Also set property for spyOn wrapper access
    return spy;
  };

  spy.mockImplementation = (fn) => {
    implementation = fn;
    spy.implementation = fn; // Also set property for spyOn wrapper access
    return spy;
  };

  spy.mockResolvedValue = (value) => {
    implementation = async () => value;
    spy.implementation = implementation; // Also set property for spyOn wrapper access
    return spy;
  };

  spy.mockRejectedValue = (error) => {
    implementation = async () => {
      throw error;
    };
    spy.implementation = implementation; // Also set property for spyOn wrapper access
    return spy;
  };

  // "Once" methods for single-use implementations
  spy.mockReturnValueOnce = (value) => {
    queuedImplementations.push(() => value);
    return spy;
  };

  spy.mockResolvedValueOnce = (value) => {
    queuedImplementations.push(async () => value);
    return spy;
  };

  spy.mockRejectedValueOnce = (error) => {
    queuedImplementations.push(async () => {
      throw error;
    });
    return spy;
  };

  spy.mockImplementationOnce = (fn) => {
    queuedImplementations.push(fn);
    return spy;
  };

  spy.reset = () => {
    spy.called = false;
    spy.callCount = 0;
    spy.calls.length = 0;
    returnValue = undefined;
    implementation = undefined;
    queuedImplementations.length = 0;
  };

  return spy;
}

export function spyOn(object, method) {
  const original = object[method];
  const spy = createSpy(method);

  spy.mockRestore = () => {
    // Try to restore, but handle read-only properties gracefully
    try {
      object[method] = original;
    } catch (error) {
      // If we can't restore (e.g., read-only property), that's okay
      // The spy will be cleaned up by test framework
    }
  };

  // Try to override the original method, handling read-only properties
  try {
    object[method] = (...args) => {
      spy.called = true;
      spy.callCount++;
      spy.calls.push(args);

      // Check for queued implementations first (for "once" methods)
      if (spy.queuedImplementations && spy.queuedImplementations.length > 0) {
        const queuedImpl = spy.queuedImplementations.shift();
        return queuedImpl(...args);
      }

      if (spy.implementation) {
        return spy.implementation(...args);
      }

      return spy.returnValue !== undefined
        ? spy.returnValue
        : original.apply(object, args);
    };
  } catch (error) {
    // If we can't override (read-only property), create a wrapper approach
    if (
      error.message.includes("read only") ||
      error.message.includes("Cannot assign")
    ) {
      // For read-only properties, we need a different approach
      // We'll modify the spy to work without actually replacing the method
      spy.mockImplementation = (fn) => {
        spy.implementation = fn;
        // Store the implementation but don't override the actual method
        return spy;
      };

      // Override the object's method descriptor if possible
      try {
        Object.defineProperty(object, method, {
          value: (...args) => {
            spy.called = true;
            spy.callCount++;
            spy.calls.push(args);

            if (spy.implementation) {
              return spy.implementation(...args);
            }

            return spy.returnValue !== undefined
              ? spy.returnValue
              : original.apply(object, args);
          },
          writable: true,
          configurable: true,
        });
      } catch (descriptorError) {
        // If we still can't override, throw a more helpful error
        throw new Error(
          `Cannot spy on '${method}' - property is not configurable. Consider mocking the entire module instead.`
        );
      }
    } else {
      throw error;
    }
  }

  return spy;
}
