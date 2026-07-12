import React from "react";
import { Link } from "wouter";

export default function NotFound() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-black text-white px-4">
      <div className="text-center max-w-sm">
        <p className="text-[80px] font-light tracking-tighter leading-none text-white/10 select-none mb-6">
          404
        </p>
        <h1 className="text-xl font-semibold tracking-tight mb-2">Page not found</h1>
        <p className="text-sm text-white/40 mb-8">
          The page you're looking for doesn't exist or has been moved.
        </p>
        <Link
          href="/"
          className="inline-flex items-center gap-2 px-5 py-2.5 bg-white text-black text-sm font-semibold rounded-xl hover:bg-white/90 transition-colors"
        >
          Go home
        </Link>
      </div>
    </div>
  );
}
