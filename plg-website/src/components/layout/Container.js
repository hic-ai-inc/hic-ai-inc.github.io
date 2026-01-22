/**
 * Container Component
 *
 * Consistent max-width container for page content.
 */

export default function Container({
  children,
  className = "",
  size = "default",
  ...props
}) {
  const sizes = {
    sm: "max-w-3xl",
    default: "max-w-7xl",
    lg: "max-w-screen-2xl",
    full: "max-w-full",
  };

  return (
    <div
      className={`mx-auto px-4 sm:px-6 lg:px-8 ${sizes[size]} ${className}`}
      {...props}
    >
      {children}
    </div>
  );
}

/**
 * Section Component
 *
 * Page section with consistent vertical spacing.
 */
export function Section({ children, className = "", id, ...props }) {
  return (
    <section id={id} className={`py-16 lg:py-24 ${className}`} {...props}>
      <Container>{children}</Container>
    </section>
  );
}
