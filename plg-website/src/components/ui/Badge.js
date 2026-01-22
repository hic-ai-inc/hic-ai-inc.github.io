/**
 * Badge Component
 *
 * Status indicators and labels.
 */

const variants = {
  default: "bg-card-bg text-frost-white border border-card-border",
  success: "badge-success",
  warning: "badge-warning",
  error: "badge-error",
  info: "badge-info",
};

export default function Badge({
  children,
  variant = "default",
  className = "",
  ...props
}) {
  return (
    <span className={`badge ${variants[variant]} ${className}`} {...props}>
      {children}
    </span>
  );
}
