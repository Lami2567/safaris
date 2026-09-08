'use client';

import React from 'react';
import { Image as ImageIcon, Link as LinkIcon } from 'lucide-react';

interface ImagePlaceholderProps {
  label?: string;
  aspectRatio?: '16:9' | '4:3' | '1:1' | 'banner';
  value?: string;
  onChange?: (val: string) => void;
  hint?: string;
}

export const ImagePlaceholder: React.FC<ImagePlaceholderProps> = ({
  label = 'Asset Image',
  aspectRatio = '16:9',
  value = '',
  onChange,
  hint = 'High-resolution images will be provided. Placeholder container is ready.',
}) => {
  const aspectClass =
    aspectRatio === 'banner'
      ? 'aspect-[21/9]'
      : aspectRatio === '4:3'
      ? 'aspect-[4/3]'
      : aspectRatio === '1:1'
      ? 'aspect-square'
      : 'aspect-video';

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <label className="text-xs uppercase tracking-widest text-white/50 font-medium">
          {label}
        </label>
        <span className="text-[10px] text-white/30 uppercase tracking-wider font-mono">
          {aspectRatio.toUpperCase()}
        </span>
      </div>

      <div
        className={`w-full ${aspectClass} rounded-lg border border-dashed border-white/20 bg-white/[0.02] flex flex-col items-center justify-center p-4 text-center hover:border-white/40 transition-colors relative overflow-hidden group`}
      >
        {value ? (
          <div className="absolute inset-0 flex flex-col items-center justify-center p-2 bg-black/90">
            <ImageIcon className="w-8 h-8 text-white/60 mb-2" />
            <p className="text-xs text-white/80 truncate max-w-[90%] font-mono">{value}</p>
            <span className="text-[10px] text-white/40 mt-1">Click below to change URL/Asset</span>
          </div>
        ) : (
          <>
            <div className="w-10 h-10 rounded-full border border-white/15 flex items-center justify-center mb-2 bg-white/[0.04]">
              <ImageIcon className="w-5 h-5 text-white/60" />
            </div>
            <p className="text-xs font-medium text-white/70">[Image Placeholder]</p>
            <p className="text-[11px] text-white/40 max-w-xs mt-1">{hint}</p>
          </>
        )}
      </div>

      {onChange && (
        <div className="flex items-center gap-2 mt-1">
          <div className="relative flex-1">
            <LinkIcon className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-white/40" />
            <input
              type="text"
              placeholder="Paste future image URL or filename..."
              value={value}
              onChange={(e) => onChange(e.target.value)}
              className="w-full pl-9 pr-3 py-1.5 text-xs bg-black border border-white/15 rounded-md text-white placeholder-white/30 focus:border-white focus:outline-none transition-colors"
            />
          </div>
        </div>
      )}
    </div>
  );
};
