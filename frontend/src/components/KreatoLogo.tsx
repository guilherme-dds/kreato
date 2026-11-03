import React, { useId } from "react";

interface KreatoLogoProps {
  size?: number;
}

export const KreatoLogo: React.FC<KreatoLogoProps> = ({ size = 40 }) => {
  const gradientId = useId();

  return (
    <svg width={size} height={size} viewBox="0 0 48 48" fill="none" aria-hidden="true" className="kreato-logo">
      <defs>
        <linearGradient id={gradientId} x1="0" y1="0" x2="48" y2="48" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="#7c5cff" />
          <stop offset="1" stopColor="#ff7a59" />
        </linearGradient>
      </defs>
      <rect width="48" height="48" rx="12" fill={`url(#${gradientId})`} />
      <path d="M15 11h6v10.5L30.5 11H38L27.5 22.5 38.5 37H31l-7.8-10.6L21 28.8V37h-6V11z" fill="#fff" />
    </svg>
  );
};
