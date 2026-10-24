import type { Branding } from "@/lib/brand";
import { cn } from "@/lib/utils";

/** Logo and site name: the default "Sympl CM" wordmark, or the custom logo and name. */
export function BrandMark({ branding, size = "sidebar", collapsed = false }: { branding: Branding; size?: "sidebar" | "login"; collapsed?: boolean }) {
  const text = size === "login" ? "text-3xl" : "text-lg";
  const logo = size === "login" ? "h-10 max-w-[160px]" : "h-7 max-w-[56px]";

  if (!branding.custom) {
    if (collapsed) return <span className="text-lg font-bold text-white mx-auto">S</span>;
    return (
      <span className={cn(text, "font-bold text-white tracking-tight")}>
        Sympl <span className="text-blue-400">CM</span>
      </span>
    );
  }
  // Long names drop a size and wrap instead of being cut off
  const long = branding.siteName.length > (size === "login" ? 18 : 16);
  const nameClass =
    size === "login"
      ? cn(long ? "text-2xl" : "text-3xl", "text-left leading-tight break-words")
      : cn(long ? "text-sm leading-tight line-clamp-2" : "text-lg truncate", "break-words");
  return (
    <span className={cn("flex min-w-0 items-center gap-2", collapsed && "mx-auto", size === "login" && "justify-center gap-3")}>
      {branding.logoUrl && (
        // eslint-disable-next-line @next/next/no-img-element -- served from the database at a versioned URL
        <img src={branding.logoUrl} alt="" className={cn(logo, "w-auto shrink-0 object-contain")} />
      )}
      {collapsed ? (
        !branding.logoUrl && <span className="text-lg font-bold text-white">{branding.siteName.charAt(0).toUpperCase()}</span>
      ) : (
        <span className={cn(nameClass, "min-w-0 font-bold text-white tracking-tight")} title={branding.siteName}>{branding.siteName}</span>
      )}
    </span>
  );
}
