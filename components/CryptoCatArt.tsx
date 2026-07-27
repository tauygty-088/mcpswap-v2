// Placeholder preview art for the Crypto Cats collection (the mint-preview
// card only — actual minted NFTs render their real on-chain tokenURI image).
export function CryptoCatArt({ label }: { label?: string }) {
  return (
    <svg viewBox="0 0 400 400" xmlns="http://www.w3.org/2000/svg" className="w-full h-full">
      <defs>
        <radialGradient id="ccBg" cx="50%" cy="40%" r="70%">
          <stop offset="0%" stopColor="#2a1a4a" />
          <stop offset="100%" stopColor="#0a0b0d" />
        </radialGradient>
        <filter id="ccGlow">
          <feGaussianBlur stdDeviation="4" result="blur" />
          <feMerge>
            <feMergeNode in="blur" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
      </defs>
      <rect width="400" height="400" fill="url(#ccBg)" />
      {/* ears */}
      <polygon points="130,120 105,55 170,100" fill="#7c3aed" />
      <polygon points="270,120 295,55 230,100" fill="#7c3aed" />
      <polygon points="143,108 128,75 163,101" fill="#c084fc" opacity="0.6" />
      <polygon points="257,108 272,75 237,101" fill="#c084fc" opacity="0.6" />
      {/* head */}
      <ellipse cx="200" cy="200" rx="105" ry="95" fill="#4a3580" />
      {/* eyes */}
      <ellipse cx="172" cy="190" rx="16" ry="18" fill="#00ff88" filter="url(#ccGlow)" />
      <ellipse cx="228" cy="190" rx="16" ry="18" fill="#00ff88" filter="url(#ccGlow)" />
      <ellipse cx="172" cy="190" rx="6" ry="11" fill="#1a0a00" />
      <ellipse cx="228" cy="190" rx="6" ry="11" fill="#1a0a00" />
      {/* nose + mouth */}
      <polygon points="200,215 192,224 208,224" fill="#c084fc" />
      <path d="M192 225 Q200 233 208 225" stroke="#c084fc" strokeWidth="2" fill="none" />
      {/* whiskers */}
      <line x1="120" y1="215" x2="180" y2="219" stroke="rgba(255,255,255,0.4)" strokeWidth="1.5" />
      <line x1="120" y1="224" x2="180" y2="224" stroke="rgba(255,255,255,0.3)" strokeWidth="1.5" />
      <line x1="280" y1="215" x2="220" y2="219" stroke="rgba(255,255,255,0.4)" strokeWidth="1.5" />
      <line x1="280" y1="224" x2="220" y2="224" stroke="rgba(255,255,255,0.3)" strokeWidth="1.5" />
      {/* tail */}
      <path
        d="M290 300 Q340 270 330 320 Q320 350 300 330"
        stroke="#4a3580"
        strokeWidth="20"
        fill="none"
        strokeLinecap="round"
      />
      {label && (
        <>
          <rect x="55" y="355" width="290" height="28" rx="8" fill="rgba(167,139,250,0.1)" stroke="rgba(167,139,250,0.4)" strokeWidth="0.5" />
          <text x="200" y="374" fontFamily="monospace" fontSize="12" fill="#c084fc" textAnchor="middle" fontWeight="700" letterSpacing="1">
            {label}
          </text>
        </>
      )}
    </svg>
  );
}
