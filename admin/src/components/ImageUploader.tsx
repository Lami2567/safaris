'use client';

import React, { useState, useRef } from 'react';
import { UploadCloud, CheckCircle2, AlertCircle, X, Image as ImageIcon, Loader2 } from 'lucide-react';
import { uploadImageToR2 } from '@/lib/storage';

interface ImageUploaderProps {
  value: string;
  onChange: (url: string) => void;
  folder?: 'banners' | 'tourism' | 'places' | 'fleet' | 'general';
  label?: string;
  recommendedSize?: string;
}

export function ImageUploader({
  value,
  onChange,
  folder = 'general',
  label = 'Card Image',
  recommendedSize = '1200 x 600 px (Max 10MB)',
}: ImageUploaderProps) {
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      setError('Please select an image file (PNG, JPG, WEBP, or SVG).');
      return;
    }

    if (file.size > 15 * 1024 * 1024) {
      setError('Image file size must be less than 15MB.');
      return;
    }

    setUploading(true);
    setProgress(0);
    setError(null);

    try {
      const publicUrl = await uploadImageToR2(file, folder, pct => setProgress(pct));
      onChange(publicUrl);
    } catch (err: any) {
      setError(err.message || 'Direct upload to Cloudflare R2 failed.');
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handleRemove = () => {
    onChange('');
    setError(null);
  };

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <label className="text-xs text-white/60 uppercase font-mono">{label}</label>
        <span className="text-[10px] text-white/40 font-mono">{recommendedSize}</span>
      </div>

      {value ? (
        <div className="relative group rounded-lg overflow-hidden border border-white/20 bg-black aspect-video max-h-48 flex items-center justify-center">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={value}
            alt="Uploaded asset"
            className="w-full h-full object-cover"
            onError={() => setError('Image failed to load from URL. Verify your Cloudflare R2 Public URL configuration.')}
          />
          <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-3">
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="px-3 py-1.5 bg-white/20 hover:bg-white/30 text-white rounded text-xs font-semibold backdrop-blur-sm transition-colors"
            >
              Replace Image
            </button>
            <button
              type="button"
              onClick={handleRemove}
              className="p-1.5 bg-red-500/20 hover:bg-red-500/30 text-red-400 rounded transition-colors"
              title="Remove image"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
          <div className="absolute bottom-2 left-2 px-2 py-0.5 rounded bg-black/70 border border-white/10 text-[10px] font-mono text-emerald-400 flex items-center gap-1.5 backdrop-blur-sm">
            <CheckCircle2 className="w-3 h-3" />
            Direct CDN Attached
          </div>
        </div>
      ) : (
        <div
          onClick={() => !uploading && fileInputRef.current?.click()}
          className={`border border-dashed rounded-lg p-5 flex flex-col items-center justify-center gap-2 cursor-pointer transition-colors ${
            uploading
              ? 'border-[#E5A93C]/50 bg-[#E5A93C]/5'
              : 'border-white/20 hover:border-white/40 bg-white/[0.02] hover:bg-white/[0.04]'
          }`}
        >
          {uploading ? (
            <div className="w-full max-w-xs space-y-2 text-center">
              <Loader2 className="w-6 h-6 text-[#E5A93C] animate-spin mx-auto" />
              <p className="text-xs text-white/80 font-medium">Uploading directly to Cloudflare R2...</p>
              <div className="w-full bg-white/10 rounded-full h-1.5 overflow-hidden">
                <div
                  className="bg-[#E5A93C] h-full transition-all duration-200"
                  style={{ width: `${progress}%` }}
                />
              </div>
              <p className="text-[10px] font-mono text-white/40">{progress}% completed</p>
            </div>
          ) : (
            <>
              <div className="w-10 h-10 rounded-full bg-white/[0.05] border border-white/10 flex items-center justify-center text-white/60">
                <UploadCloud className="w-5 h-5" />
              </div>
              <div className="text-center">
                <p className="text-xs font-semibold text-white">Click to upload image directly to Cloudflare</p>
                <p className="text-[11px] text-white/40 mt-0.5">PNG, JPG, WEBP, or SVG • Bypasses server bandwidth</p>
              </div>
            </>
          )}
        </div>
      )}

      {/* Manual URL Input Fallback */}
      <div className="flex items-center gap-2 pt-1">
        <input
          type="text"
          value={value}
          onChange={e => onChange(e.target.value)}
          placeholder="Or paste direct Cloudflare CDN image URL (https://...)"
          className="flex-1 bg-[#141518] border border-white/15 rounded px-2.5 py-1.5 text-[11px] font-mono text-white placeholder:text-white/30 focus:outline-none focus:border-[#E5A93C]"
        />
        {value && (
          <button
            type="button"
            onClick={handleRemove}
            className="p-1.5 text-white/40 hover:text-white"
            title="Clear URL"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        )}
      </div>

      {error && (
        <div className="flex items-center gap-2 p-2 rounded bg-red-500/10 border border-red-500/30 text-red-400 text-xs">
          <AlertCircle className="w-4 h-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      <input
        ref={fileInputRef}
        type="file"
        accept="image/png,image/jpeg,image/jpg,image/webp,image/gif,image/svg+xml"
        onChange={handleFileSelect}
        className="hidden"
      />
    </div>
  );
}
