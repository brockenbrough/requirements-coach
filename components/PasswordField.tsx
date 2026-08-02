'use client';

import { useId, useState } from 'react';

function EyeIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7Z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  );
}

function EyeOffIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 3l18 18" />
      <path d="M10.6 5.2A10.6 10.6 0 0 1 12 5c6.5 0 10 7 10 7a15.6 15.6 0 0 1-3.2 4.1M6.6 6.6C4 8.3 2 12 2 12s3.5 7 10 7c1.4 0 2.6-.2 3.7-.6" />
      <path d="M9.9 9.9a3 3 0 0 0 4.2 4.2" />
    </svg>
  );
}

// Login/register sit on the dark background; the profile page's "Change password" form
// sits inside a light card. Same component, same show/hide behavior — only the palette
// (and, since the light side matches the page's other inputs, the corner radius) differs.
const VARIANT_STYLES = {
  dark: {
    label: 'text-[#A79FC9]',
    input: 'rounded-brand-md border-[#332b6b] bg-[#1b1642] text-[#F3F1FF] focus:border-[#7C4DFF]',
    toggle: 'rounded-r-brand-md text-[#A79FC9] hover:text-[#2DD4BF] focus-visible:outline-[#2DD4BF]',
  },
  light: {
    label: 'text-gray-600',
    input: 'rounded-xl border-gray-200 bg-white text-brand-navy focus:border-brand-purple',
    toggle: 'rounded-r-xl text-gray-400 hover:text-brand-purple focus-visible:outline-brand-purple',
  },
} as const;

export function PasswordField({
  label,
  value,
  onChange,
  placeholder,
  autoComplete,
  variant = 'dark',
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  autoComplete?: string;
  variant?: 'dark' | 'light';
}) {
  const id = useId();
  const [visible, setVisible] = useState(false);
  const [spinKey, setSpinKey] = useState(0);
  const styles = VARIANT_STYLES[variant];

  function toggle() {
    setVisible((v) => !v);
    setSpinKey((k) => k + 1);
  }

  return (
    <label htmlFor={id} className={`block text-sm font-bold ${styles.label}`}>
      {label}
      <div className="relative mt-1">
        <input
          id={id}
          type={visible ? 'text' : 'password'}
          value={value}
          onChange={(event) => onChange(event.target.value)}
          required
          autoComplete={autoComplete}
          placeholder={placeholder}
          className={`w-full border px-4 py-3 pr-11 outline-none ring-0 transition ${styles.input}`}
        />
        <button
          type="button"
          onClick={toggle}
          aria-label={visible ? 'Hide password' : 'Show password'}
          aria-pressed={visible}
          className={`pw-toggle-btn absolute inset-y-0 right-0 flex w-11 items-center justify-center transition-colors focus-visible:outline focus-visible:outline-2 ${styles.toggle}`}
        >
          <span key={spinKey} className="pw-icon-spin relative inline-flex">
            {visible ? <EyeOffIcon /> : <EyeIcon />}
            {visible ? (
              <>
                <span className="pw-spark pw-spark-1" aria-hidden="true" />
                <span className="pw-spark pw-spark-2" aria-hidden="true" />
                <span className="pw-spark pw-spark-3" aria-hidden="true" />
              </>
            ) : null}
          </span>
        </button>
        <style jsx>{`
          .pw-icon-spin {
            animation: pw-spin 0.35s ease-out;
          }
          @keyframes pw-spin {
            0% {
              transform: rotate(0deg) scale(1);
            }
            55% {
              transform: rotate(190deg) scale(0.75);
            }
            100% {
              transform: rotate(360deg) scale(1);
            }
          }
          .pw-spark {
            position: absolute;
            top: 50%;
            left: 50%;
            width: 4px;
            height: 4px;
            border-radius: 9999px;
            background: #ffd666;
            opacity: 0;
            animation: pw-spark-burst 0.5s ease-out;
          }
          .pw-spark-1 {
            animation-delay: 0.02s;
            --dx: -11px;
            --dy: -9px;
          }
          .pw-spark-2 {
            animation-delay: 0.06s;
            --dx: 11px;
            --dy: -7px;
          }
          .pw-spark-3 {
            animation-delay: 0.04s;
            --dx: 0px;
            --dy: 12px;
          }
          @keyframes pw-spark-burst {
            0% {
              opacity: 0;
              transform: translate(-50%, -50%) scale(0.3);
            }
            35% {
              opacity: 1;
            }
            100% {
              opacity: 0;
              transform: translate(calc(-50% + var(--dx)), calc(-50% + var(--dy))) scale(1);
            }
          }
          @media (prefers-reduced-motion: reduce) {
            .pw-icon-spin {
              animation: none;
            }
            .pw-spark {
              animation: none;
              display: none;
            }
          }
        `}</style>
      </div>
    </label>
  );
}
