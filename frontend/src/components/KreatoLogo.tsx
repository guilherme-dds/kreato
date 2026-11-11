import React, { useId } from "react";

interface KreatoLogoProps {
  size?: number;
}

/** Marca do Kreato: uma claquete em nanquim com o K no corpo e o ponto REC no canto */
export const KreatoLogo: React.FC<KreatoLogoProps> = ({ size = 40 }) => {
  const clipId = useId();

  return (
    <svg width={size} height={size} viewBox="0 0 48 48" fill="none" aria-hidden="true" className="kreato-logo">
      <defs>
        <clipPath id={clipId}>
          <rect width="48" height="48" rx="9" />
        </clipPath>
      </defs>
      <g clipPath={`url(#${clipId})`}>
        <rect width="48" height="48" fill="#1b1a17" />
        {/* Barras da claquete */}
        <path d="M4 0h7l-4 12H0zM18 0h7l-4 12h-7zM32 0h7l-4 12h-7zM46 0h7l-4 12h-7z" fill="#f6f4ee" />
        <rect y="12" width="48" height="2" fill="#f6f4ee" opacity="0.35" />
      </g>
      <path d="M14.5 19h4.6v8.1l7.3-8.1h5.8l-8.1 8.8L33 40h-5.8l-6-8.2-2.1 2.2V40h-4.6V19z" fill="#f6f4ee" />
      <circle cx="37.5" cy="22.5" r="2.5" fill="#e0412b" />
    </svg>
  );
};
