/**
 * Card Component
 *
 * Reusable card container with optional hover effects.
 */

export default function Card({
  children,
  hover = false,
  className = "",
  ...props
}) {
  const hoverClass = hover ? "card-hover cursor-pointer" : "";

  return (
    <div className={`card ${hoverClass} ${className}`} {...props}>
      {children}
    </div>
  );
}

export function CardHeader({ children, className = "" }) {
  return <div className={`mb-4 ${className}`}>{children}</div>;
}

export function CardTitle({ children, className = "" }) {
  return (
    <h3 className={`text-xl font-semibold text-frost-white ${className}`}>
      {children}
    </h3>
  );
}

export function CardDescription({ children, className = "" }) {
  return (
    <p className={`text-slate-grey text-sm mt-1 ${className}`}>{children}</p>
  );
}

export function CardContent({ children, className = "" }) {
  return <div className={className}>{children}</div>;
}

export function CardFooter({ children, className = "" }) {
  return (
    <div className={`mt-4 pt-4 border-t border-card-border ${className}`}>
      {children}
    </div>
  );
}
