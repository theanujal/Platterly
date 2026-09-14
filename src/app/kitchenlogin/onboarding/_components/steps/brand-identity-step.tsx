import { Label } from "@/components/ui/label";

interface BrandIdentityStepProps {
  onLogoChange: (event: React.ChangeEvent<HTMLInputElement>) => void;
  logoError: string | null;
}

// The caterer's own business logo upload — unrelated to Platterly's own
// platform brand (see src/components/app-shell/app-sidebar.tsx / auth-layout.tsx).
export function BrandIdentityStep({ onLogoChange, logoError }: BrandIdentityStepProps) {
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="logo">Logo (PNG or JPG, up to 2MB)</Label>
        <input id="logo" type="file" accept="image/png,image/jpeg" onChange={onLogoChange} />
      </div>
      {logoError && (
        <p role="alert" className="text-sm text-destructive">
          {logoError}
        </p>
      )}
    </div>
  );
}
