'use client';

import React, { useState, useRef } from 'react';
import { Image as ImageIcon, Link as LinkIcon, UploadCloud, Loader2, X, CheckCircle2, AlertCircle } from 'lucide-react';
import { uploadImageToR2 } from '@/lib/storage';

interface ImagePlaceholderProps {
  label?: string;
  aspectRatio?: '16:9' | '4:3' | '1:1' | 'banner';
  value?: string;
  onChange?: (val: string) => void;
  hint?: string;
  folder?: 'tourism' | 'banners' | 'places' | 'fleet' | 'general';
  showUrlInput?: boolean;
}

export const ImagePlaceholder: React.FC<ImagePlaceholderProps> = ({
  label = '',
  aspectRatio = '16:9',
  value = '',
  onChange,
  hint = 'Click to upload image directly to Cloudflare R2',
  folder = 'tourism',
  showUrlInput = false,
}) => {
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const aspectClass =
    aspectRatio === 'banner'
      ? 'aspect-[21/9]'
      : aspectRatio === '4:3'
      ? 'aspect-[4/3]'
      : aspectRatio === '1:1'
      ? 'aspect-square'
      : 'aspect-video';

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      setError('Please select an image file (PNG, JPG, WEBP, or SVG).');
      return;
    }

    if (file.size > 15 * 1024 * 1024) {
      setError('File size must be less than 15MB.');
      return;
    }

    setUploading(true);
    setProgress(0);
    setError(null);

    try {
      const publicUrl = await uploadImageToR2(file, folder, pct => setProgress(pct));
      if (onChange) onChange(publicUrl);
    } catch (err: any) {
      setError(err.message || 'Direct upload to Cloudflare R2 failed.');
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handleRemove = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (onChange) onChange('');
    setError(null);
  };

  return (
    <div className="w-full">
      {label ? (
        <div className="flex items-center justify-between mb-2">
          <label className="text-xs uppercase tracking-widest text-white/50 font-medium font-mono">
            {label}
          </label>
          <span className="text-[10px] text-white/30 uppercase tracking-wider font-mono">
            {aspectRatio.toUpperCase()}
          </span>
        </div>
      ) : null}

      <div
        onClick={() => !uploading && fileInputRef.current?.click()}
        className={`w-full ${aspectClass} rounded-lg border transition-all relative overflow-hidden group cursor-pointer flex flex-col items-center justify-center text-center ${
          uploading
            ? 'border-white/50 bg-white/[0.05]'
            : value
            ? 'border-white/20 bg-black'
            : 'border-dashed border-white/20 bg-white/[0.02] hover:border-white/40 hover:bg-white/[0.05]'
        }`}
      >
        {uploading ? (
          <div className="w-full max-w-xs space-y-2 p-4 text-center z-10">
            <Loader2 className="w-6 h-6 text-white animate-spin mx-auto" />
            <p className="text-xs text-white font-medium">Uploading to Cloudflare CDN...</p>
            <div className="w-full bg-white/10 rounded-full h-1.5 overflow-hidden">
              <div
                className="bg-white h-full transition-all duration-200"
                style={{ width: `${progress}%` }}
              />
            </div>
            <p className="text-[10px] font-mono text-white/50">{progress}%</p>
          </div>
        ) : value ? (
          <>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={value}
              alt="Card Asset"
              className="absolute inset-0 w-full h-full object-cover transition-transform group-hover:scale-105 duration-300"
              onError={() => setError('Image failed to load. Check Cloudflare public URL.')}
            />
            <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-2 z-10 p-2">
              <span className="px-3 py-1.5 bg-white text-black hover:bg-white/90 rounded text-xs font-semibold backdrop-blur-sm transition-colors">
                Change Photo
              </span>
              <button
                type="button"
                onClick={handleRemove}
                className="p-1.5 bg-red-500/20 hover:bg-red-500/40 text-red-400 rounded transition-colors"
                title="Remove image"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="absolute bottom-2 left-2 px-2 py-0.5 rounded bg-black/80 border border-white/10 text-[9px] font-mono text-emerald-400 flex items-center gap-1 backdrop-blur-sm z-10">
              <CheckCircle2 className="w-3 h-3" />
              CDN Attached
            </div>
          </>
        ) : (
          <div className="flex flex-col items-center justify-center p-4">
            <div className="w-10 h-10 rounded-full border border-white/15 flex items-center justify-center mb-2 bg-white/[0.04] text-white/60 group-hover:text-white transition-colors">
              <UploadCloud className="w-5 h-5" />
            </div>
            <p className="text-xs font-semibold text-white">Click to upload photo</p>
            <p className="text-[11px] text-white/40 max-w-xs mt-0.5">{hint}</p>
          </div>
        )}
      </div>

      {error && (
        <div className="flex items-center gap-2 p-2 mt-2 rounded bg-red-500/10 border border-red-500/30 text-red-400 text-xs">
          <AlertCircle className="w-4 h-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {showUrlInput && onChange && (
        <div className="flex items-center gap-2 mt-2">
          <div className="relative flex-1">
            <LinkIcon className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-white/40" />
            <input
              type="text"
              placeholder="Or paste direct Cloudflare CDN image URL (https://...)"
              value={value}
              onChange={(e) => onChange(e.target.value)}
              className="w-full pl-9 pr-3 py-1.5 text-xs bg-black border border-white/15 rounded-md text-white placeholder-white/30 focus:border-white focus:outline-none transition-colors font-mono"
            />
          </div>
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
};
