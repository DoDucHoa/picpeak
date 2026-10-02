import React from 'react';

interface SupportContactProps {
  /** The Branding support address. Nothing renders without one. */
  email: string | null | undefined;
  label: string;
  className?: string;
  style?: React.CSSProperties;
  linkStyle?: React.CSSProperties;
}

/**
 * "Need help? Contact <address>" under the login forms. It used to fall back
 * to support@example.com, which showed customers an address nobody reads, so
 * the line now appears only once an operator sets a support email.
 */
export const SupportContact: React.FC<SupportContactProps> = ({ email, label, className, style, linkStyle }) => {
  const address = email?.trim();
  if (!address) return null;
  return (
    <p className={className} style={style}>
      {label}{' '}
      <a href={`mailto:${address}`} className="hover:underline" style={linkStyle}>
        {address}
      </a>
    </p>
  );
};
