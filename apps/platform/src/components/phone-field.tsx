"use client";

import "react-phone-number-input/style.css";
import PhoneInput from "react-phone-number-input";

/**
 * The same country-flag phone input Caterly's sign-up used (react-phone-number-input, India first, any country allowed, the calling code is fixed and
 * only the national number is typed). Gives back "+919876543210", or "" while empty. Styled to sit in the Platform's `pa-field` rows.
 */
export function PhoneField({ id, value, onChange, disabled, describedBy, invalid }: { id: string; value: string; onChange: (v: string) => void; disabled?: boolean; describedBy?: string; invalid?: boolean }) {
  return (
    <PhoneInput
      id={id}
      international
      defaultCountry="IN"
      countryCallingCodeEditable={false}
      limitMaxLength
      value={value.startsWith("+") ? value : undefined}
      onChange={(v) => onChange(v ?? "")}
      disabled={disabled}
      className="pa-phone"
      countrySelectProps={{ "aria-label": "Country calling code" }}
      numberInputProps={{ "aria-describedby": describedBy, "aria-invalid": invalid, name: "phone", autoComplete: "tel-national" }}
    />
  );
}
