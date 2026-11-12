"use client";

import Link from "next/link";
import type { VariantProps } from "class-variance-authority";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/**
 * A Next link styled as a button. buttonVariants lives in a client module, so
 * server components can't call it directly; they render this instead.
 */
export function LinkButton({
  href,
  variant,
  size,
  className,
  children,
}: { href: string; className?: string; children: React.ReactNode } & VariantProps<typeof buttonVariants>) {
  return (
    <Link href={href} className={cn(buttonVariants({ variant, size }), className)}>
      {children}
    </Link>
  );
}
