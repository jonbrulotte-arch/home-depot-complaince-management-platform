import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";

export function StatCard({ icon: Icon, label, value, tone = "blue" }: { icon: React.ElementType; label: string; value: React.ReactNode; tone?: "blue" | "red" | "amber" | "green" }) {
  const tones = {
    blue: "bg-blue-50 text-blue-600",
    red: "bg-red-50 text-red-600",
    amber: "bg-amber-50 text-amber-600",
    green: "bg-green-50 text-green-600",
  };
  return (
    <Card>
      <CardContent className="p-6">
        <div className="flex items-center gap-4">
          <div className={cn("h-12 w-12 rounded-lg flex items-center justify-center", tones[tone])}>
            <Icon className="h-6 w-6" />
          </div>
          <div>
            <p className="text-sm text-gray-500">{label}</p>
            <p className="text-2xl font-bold text-gray-900">{value}</p>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
