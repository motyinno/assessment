import { ClimbLoader } from "@/components/brand/climb-loader";
import { cn } from "@/lib/utils";

/** Whole-page wait: the climbing mountain, centred, with an optional caption. */
export function PageLoader({ label, className }: { label?: React.ReactNode; className?: string }) {
  return (
    <div className={cn("flex min-h-[50vh] items-center justify-center", className)}>
      <ClimbLoader size="xl" label={label} className="flex-col gap-3 text-sm" />
    </div>
  );
}
