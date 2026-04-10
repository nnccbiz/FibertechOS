'use client';

import { useRef, useState } from 'react';

interface PhotoUploadProps {
  label: string;
  maxFiles?: number;
  onUpload: (files: File[]) => void;
}

export default function PhotoUpload({ label, maxFiles = 5, onUpload }: PhotoUploadProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [previews, setPreviews] = useState<string[]>([]);

  function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? []).slice(0, maxFiles);
    if (files.length === 0) return;

    const urls = files.map((f) => URL.createObjectURL(f));
    setPreviews((prev) => [...prev, ...urls].slice(0, maxFiles));
    onUpload(files);
  }

  function removePreview(index: number) {
    setPreviews((prev) => prev.filter((_, i) => i !== index));
  }

  return (
    <div className="space-y-2">
      <label className="block text-lg font-medium text-gray-700">{label}</label>
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        capture="environment"
        multiple
        onChange={handleChange}
        className="hidden"
      />
      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        className="flex items-center gap-2 px-4 py-3 border-2 border-dashed border-gray-300 rounded-lg text-gray-600 hover:border-blue-400 hover:text-blue-600 w-full justify-center text-2xl"
      >
        📷 צלם / העלה תמונה
      </button>
      {previews.length > 0 && (
        <div className="flex gap-2 flex-wrap">
          {previews.map((url, i) => (
            <div key={i} className="relative w-20 h-20">
              <img src={url} alt="" className="w-full h-full object-cover rounded" />
              <button
                type="button"
                onClick={() => removePreview(i)}
                className="absolute -top-1 -right-1 w-5 h-5 bg-red-500 text-white rounded-full text-sm flex items-center justify-center"
              >
                ×
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
