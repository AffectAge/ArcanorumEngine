import { useEffect, useMemo, useRef, useState, type ChangeEvent, type ReactNode } from "react";
import { ImagePlus, X } from "lucide-react";
import { cn } from "./classNames";

type GameImageUploadCardProps = {
  label: string;
  file?: File | null;
  src?: string | null;
  accept?: string;
  disabled?: boolean;
  fallbackIcon?: ReactNode;
  clearLabel?: string;
  onFileChange: (file: File | null) => void | boolean | Promise<void | boolean>;
  className?: string;
};

export function GameImageUploadCard({
  label,
  file = null,
  src = null,
  accept = "image/*",
  disabled = false,
  fallbackIcon,
  clearLabel,
  onFileChange,
  className = "",
}: GameImageUploadCardProps) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [objectUrl, setObjectUrl] = useState<string | null>(null);

  useEffect(() => {
    if (!file) {
      setObjectUrl(null);
      return undefined;
    }

    const nextUrl = URL.createObjectURL(file);
    setObjectUrl(nextUrl);
    return () => URL.revokeObjectURL(nextUrl);
  }, [file]);

  const previewSrc = useMemo(() => objectUrl ?? src, [objectUrl, src]);
  const hasPreview = Boolean(previewSrc);

  async function handleChange(event: ChangeEvent<HTMLInputElement>) {
    const result = await onFileChange(event.currentTarget.files?.[0] ?? null);
    if (result === false && inputRef.current) {
      inputRef.current.value = "";
    }
  }

  function handleClear() {
    onFileChange(null);
    if (inputRef.current) inputRef.current.value = "";
  }

  function handlePick() {
    inputRef.current?.click();
  }

  return (
    <span className={cn("arc-kit-image-upload", disabled && "arc-kit-image-upload--disabled", className)}>
      <input
        ref={inputRef}
        type="file"
        className="sr-only"
        accept={accept}
        disabled={disabled}
        onChange={handleChange}
      />
      <button type="button" className="arc-kit-image-upload__card" disabled={disabled} aria-label={label} onClick={handlePick}>
        {hasPreview ? <img src={previewSrc ?? undefined} alt="" /> : <span className="arc-kit-image-upload__icon">{fallbackIcon ?? <ImagePlus size={42} aria-hidden="true" />}</span>}
      </button>
      {hasPreview && clearLabel ? (
        <button type="button" className="arc-kit-image-upload__clear" disabled={disabled} aria-label={clearLabel} onClick={handleClear}>
          <X size={14} aria-hidden="true" />
        </button>
      ) : null}
    </span>
  );
}
