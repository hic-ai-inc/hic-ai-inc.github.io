/**
 * Input Component
 *
 * Form input with label and error state.
 */

export default function Input({ label, error, className = "", id, ...props }) {
  const inputId = id || props.name;

  return (
    <div className="w-full">
      {label && (
        <label
          htmlFor={inputId}
          className="block text-sm font-medium text-frost-white mb-2"
        >
          {label}
        </label>
      )}
      <input
        id={inputId}
        className={`input ${error ? "border-error focus:border-error" : ""} ${className}`}
        {...props}
      />
      {error && <p className="mt-1 text-sm text-error">{error}</p>}
    </div>
  );
}

export function Textarea({
  label,
  error,
  className = "",
  id,
  rows = 4,
  ...props
}) {
  const inputId = id || props.name;

  return (
    <div className="w-full">
      {label && (
        <label
          htmlFor={inputId}
          className="block text-sm font-medium text-frost-white mb-2"
        >
          {label}
        </label>
      )}
      <textarea
        id={inputId}
        rows={rows}
        className={`input resize-none ${error ? "border-error focus:border-error" : ""} ${className}`}
        {...props}
      />
      {error && <p className="mt-1 text-sm text-error">{error}</p>}
    </div>
  );
}

export function Select({
  label,
  error,
  options = [],
  className = "",
  id,
  placeholder,
  ...props
}) {
  const inputId = id || props.name;

  return (
    <div className="w-full">
      {label && (
        <label
          htmlFor={inputId}
          className="block text-sm font-medium text-frost-white mb-2"
        >
          {label}
        </label>
      )}
      <select
        id={inputId}
        className={`input ${error ? "border-error focus:border-error" : ""} ${className}`}
        {...props}
      >
        {placeholder && (
          <option value="" disabled>
            {placeholder}
          </option>
        )}
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
      {error && <p className="mt-1 text-sm text-error">{error}</p>}
    </div>
  );
}
