import { motion } from "framer-motion";

interface BeaconLogoProps {
  size?: number;
  className?: string;
  animated?: boolean;
}

export default function BeaconLogo({
  size = 120,
  className = "",
  animated = true,
}: BeaconLogoProps) {
  const Wrapper = animated ? motion.div : "div";
  const wrapperProps = animated
    ? ({
        initial: { opacity: 0, scale: 0.88 },
        animate: { opacity: 1, scale: 1 },
        transition: { duration: 0.6, ease: "easeOut" },
      } as React.ComponentProps<typeof motion.div>)
    : {};

  return (
    // @ts-expect-error – motion/div conditional props
    <Wrapper
      className={`inline-flex flex-col items-center gap-3 ${className}`}
      {...wrapperProps}
    >
      {/* SVG beacon icon */}
      <svg
        width={size}
        height={size}
        viewBox="0 0 120 120"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        style={{ filter: "drop-shadow(0 0 18px rgba(139,92,246,0.55))" }}
      >
        <defs>
          {/* Radial gradient for the main orb */}
          <radialGradient id="orb-grad" cx="50%" cy="45%" r="55%">
            <stop offset="0%" stopColor="#c4b5fd" />
            <stop offset="50%" stopColor="#7c3aed" />
            <stop offset="100%" stopColor="#3b0764" stopOpacity="0.6" />
          </radialGradient>

          {/* Gradient for beam rays */}
          <linearGradient id="beam-v" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#22d3ee" stopOpacity="0.9" />
            <stop offset="100%" stopColor="#7c3aed" stopOpacity="0" />
          </linearGradient>
          <linearGradient id="beam-l" x1="1" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#a78bfa" stopOpacity="0.7" />
            <stop offset="100%" stopColor="#7c3aed" stopOpacity="0" />
          </linearGradient>
          <linearGradient id="beam-r" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="#a78bfa" stopOpacity="0.7" />
            <stop offset="100%" stopColor="#7c3aed" stopOpacity="0" />
          </linearGradient>

          {/* Glow filter */}
          <filter id="glow" x="-20%" y="-20%" width="140%" height="140%">
            <feGaussianBlur in="SourceGraphic" stdDeviation="3" result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>

          {/* Rim glow filter */}
          <filter id="rim" x="-30%" y="-30%" width="160%" height="160%">
            <feGaussianBlur in="SourceGraphic" stdDeviation="5" />
          </filter>
        </defs>

        {/* ── Outer pulse rings ── */}
        <circle
          cx="60"
          cy="68"
          r="38"
          stroke="#7c3aed"
          strokeWidth="1"
          strokeOpacity="0.18"
          fill="none"
        />
        <circle
          cx="60"
          cy="68"
          r="28"
          stroke="#8b5cf6"
          strokeWidth="1"
          strokeOpacity="0.22"
          fill="none"
        />

        {/* ── Beacon base / stand ── */}
        <ellipse cx="60" cy="92" rx="14" ry="4" fill="#2a1a5e" />
        <rect x="57" y="76" width="6" height="18" rx="3" fill="#4c1d95" />
        {/* base platform */}
        <rect x="46" y="90" width="28" height="5" rx="2.5" fill="#3b1a72" />

        {/* ── Main light cone (upward beams) ── */}
        {/* Center thin beam */}
        <polygon points="60,70 57,10 63,10" fill="url(#beam-v)" opacity="0.7" />
        {/* Left beam */}
        <polygon points="58,69 20,5 40,12" fill="url(#beam-l)" opacity="0.45" />
        {/* Right beam */}
        <polygon
          points="62,69 80,12 100,5"
          fill="url(#beam-r)"
          opacity="0.45"
        />

        {/* ── Glow rim behind orb ── */}
        <circle
          cx="60"
          cy="68"
          r="16"
          fill="#7c3aed"
          filter="url(#rim)"
          opacity="0.5"
        />

        {/* ── Main orb ── */}
        <circle
          cx="60"
          cy="68"
          r="14"
          fill="url(#orb-grad)"
          filter="url(#glow)"
        />

        {/* ── Orb specular highlight ── */}
        <ellipse cx="56" cy="63" rx="5" ry="3.5" fill="white" opacity="0.2" />

        {/* ── Cyan inner star / spark ── */}
        <circle cx="60" cy="68" r="3.5" fill="#22d3ee" opacity="0.85" />
        <circle cx="60" cy="68" r="1.5" fill="white" />

        {/* ── Orbit ring ── */}
        <ellipse
          cx="60"
          cy="68"
          rx="22"
          ry="6"
          stroke="#a78bfa"
          strokeWidth="1"
          strokeOpacity="0.35"
          fill="none"
          strokeDasharray="4 3"
        />
      </svg>
    </Wrapper>
  );
}

// React import needed for JSX
import React from "react";
