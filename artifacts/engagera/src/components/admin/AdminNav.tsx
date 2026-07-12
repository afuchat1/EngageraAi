import React from "react";
import { Link, useLocation } from "wouter";

const TABS = [
  { href: "/admin", label: "Overview" },
  { href: "/admin/dataset", label: "Dataset" },
  { href: "/admin/reviewer", label: "Reviewer" },
  { href: "/admin/models", label: "Models & Training" },
  { href: "/admin/analytics", label: "API Analytics" },
  { href: "/admin/storage", label: "Storage" },
];

export function AdminNav() {
  const [location] = useLocation();
  return (
    <div className="flex items-center gap-1 mb-8 overflow-x-auto scrollbar-thin -mx-1 px-1">
      {TABS.map((t) => {
        const active = t.href === "/admin" ? location === "/admin" : location.startsWith(t.href);
        return (
          <Link key={t.href} href={t.href}>
            <div
              className={`px-3.5 py-2 rounded-xl text-sm font-medium whitespace-nowrap cursor-pointer transition-colors ${
                active ? "bg-white text-black" : "text-white/50 hover:text-white hover:bg-white/[0.07]"
              }`}
            >
              {t.label}
            </div>
          </Link>
        );
      })}
    </div>
  );
}
