"use client";

import { useState } from "react";

// 상품 썸네일 — 탭하면 확대 이미지(라이트박스) 표시
export default function Thumb({ src, alt = "" }: { src: string | null; alt?: string }) {
  const [open, setOpen] = useState(false);
  if (!src) return <div className="thumb" />;
  return (
    <>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        className="thumb thumb-zoom"
        src={src}
        alt={alt}
        onClick={(e) => {
          e.stopPropagation();
          setOpen(true);
        }}
      />
      {open && (
        <div
          className="lightbox"
          onClick={(e) => {
            e.stopPropagation();
            setOpen(false);
          }}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={src} alt={alt} />
          <span className="lightbox-hint">탭하면 닫혀요</span>
        </div>
      )}
    </>
  );
}
