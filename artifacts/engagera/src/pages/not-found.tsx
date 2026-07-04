import React from "react";
import { Link } from "wouter";
import PublicLayout from "@/components/layout/PublicLayout";

export default function NotFound() {
  return (
    <PublicLayout>
      <div className="max-w-md mx-auto mt-32 text-center p-6 border border-white/15">
        <h1 className="text-6xl font-mono tracking-tighter mb-4 font-bold">404</h1>
        <p className="text-white/60 mb-8">The requested resource could not be found.</p>
        <Link href="/" className="inline-block py-2 px-6 bg-white text-black font-medium hover:bg-white/90 transition-colors">
          Return Home
        </Link>
      </div>
    </PublicLayout>
  );
}
