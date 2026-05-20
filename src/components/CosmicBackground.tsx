"use client";

import React from "react";

export function CosmicBackground() {
  return (
    <div className="fixed inset-0 w-full h-full overflow-hidden pointer-events-none z-0 select-none bg-[#05060f]">
      {/* 1. Digital Grid Overlay */}
      <div className="absolute inset-0 bg-cosmic-grid opacity-30 mix-blend-overlay" />

      {/* 2. Ambient Aurora Glows */}
      <div className="absolute inset-0">
        {/* Cyan/Teal Blob */}
        <div className="absolute top-[10%] left-[20%] w-[500px] h-[500px] rounded-full bg-cyan-500/10 blur-[130px] animate-float-aurora-1" />
        
        {/* Magenta/Pink Blob */}
        <div className="absolute bottom-[20%] right-[10%] w-[600px] h-[600px] rounded-full bg-pink-500/10 blur-[150px] animate-float-aurora-2" />
        
        {/* Violet/Indigo Blob */}
        <div className="absolute top-[40%] right-[30%] w-[550px] h-[550px] rounded-full bg-indigo-600/10 blur-[140px] animate-float-aurora-3" />

        {/* Soft Gold/Orange center highlight for premium warmth */}
        <div className="absolute top-[60%] left-[40%] w-[400px] h-[400px] rounded-full bg-amber-500/[0.04] blur-[120px] animate-pulse" />
      </div>

      {/* 3. Sparkling Cosmic Stars */}
      <div className="absolute inset-0">
        {/* Star group 1 */}
        <div className="absolute top-[15%] left-[25%] w-1.5 h-1.5 bg-white rounded-full opacity-60 animate-star-sparkle shadow-[0_0_8px_#fff]" style={{ animationDelay: "0s" }} />
        <div className="absolute top-[35%] left-[75%] w-1 h-1 bg-white rounded-full opacity-40 animate-star-sparkle" style={{ animationDelay: "1.5s" }} />
        <div className="absolute top-[75%] left-[15%] w-2 h-2 bg-indigo-300 rounded-full opacity-50 animate-star-sparkle shadow-[0_0_10px_#a5b4fc]" style={{ animationDelay: "0.8s" }} />

        {/* Star group 2 */}
        <div className="absolute top-[20%] right-[20%] w-1 h-1 bg-white rounded-full opacity-35 animate-star-sparkle" style={{ animationDelay: "2.2s" }} />
        <div className="absolute top-[65%] right-[35%] w-1.5 h-1.5 bg-cyan-200 rounded-full opacity-50 animate-star-sparkle shadow-[0_0_8px_#a5f3fc]" style={{ animationDelay: "1.1s" }} />
        <div className="absolute bottom-[15%] right-[15%] w-2 h-2 bg-pink-300 rounded-full opacity-45 animate-star-sparkle shadow-[0_0_12px_#fbcfe8]" style={{ animationDelay: "2.7s" }} />

        {/* Deep space dust elements */}
        <div className="absolute top-[45%] left-[45%] w-[3px] h-[3px] bg-white rounded-full opacity-20 animate-pulse" />
        <div className="absolute top-[80%] left-[60%] w-[2px] h-[2px] bg-white rounded-full opacity-30 animate-pulse" style={{ animationDelay: "1s" }} />
        <div className="absolute top-[10%] right-[40%] w-[3px] h-[3px] bg-white rounded-full opacity-15 animate-pulse" style={{ animationDelay: "3s" }} />
      </div>

      {/* 4. Glass overlay to smoothly blend card intersections */}
      <div className="absolute inset-0 bg-gradient-to-t from-[#05060f]/60 via-transparent to-[#05060f]/30" />
    </div>
  );
}
