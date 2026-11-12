import { ClimbLoader } from "@/components/brand/climb-loader";

// Shown the moment a link is clicked, while the next page renders on the server.
export default function Loading() {
  return (
    <div className="flex min-h-[60vh] items-center justify-center">
      <ClimbLoader size="lg" label="Climbing to the next page…" className="flex-col gap-3 text-sm" />
    </div>
  );
}
