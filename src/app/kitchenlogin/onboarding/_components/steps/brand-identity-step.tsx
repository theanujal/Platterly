import { Label } from "@/components/ui/label";
import { ImageDropzone } from "@/components/ui/image-dropzone";

interface BrandIdentityStepProps {
  onLogoSelect: (file: File | null) => void;
  logoError: string | null;
}

// The caterer's own business logo upload — unrelated to Platterly's own
// platform brand (see src/components/app-shell/app-sidebar.tsx / auth-layout.tsx).
export function BrandIdentityStep({ onLogoSelect, logoError }: BrandIdentityStepProps) {
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="logo">Logo</Label>
        <ImageDropzone id="logo" value={null} onFileSelect={onLogoSelect} maxSizeMB={2} error={logoError} />
      </div>
    </div>
  );
}
