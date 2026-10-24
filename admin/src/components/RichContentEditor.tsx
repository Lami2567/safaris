'use client';

import React, { useState, useRef } from 'react';
import {
  Type,
  Heading,
  Image as ImageIcon,
  Video,
  Volume2,
  List,
  Quote,
  Link as LinkIcon,
  ArrowUp,
  ArrowDown,
  Trash2,
  UploadCloud,
  CheckCircle2,
  Loader2,
  Eye,
  Edit3,
  Mic,
  Square,
} from 'lucide-react';
import { uploadMediaToR2, validateExternalMediaUrl } from '@/lib/storage';

export interface ContentBlockItem {
  id: string;
  type: 'heading' | 'paragraph' | 'image' | 'video' | 'audio' | 'list' | 'quote' | 'link';
  order: number;
  text?: string;
  level?: 1 | 2 | 3;
  items?: string[];
  url?: string;
  sourceType?: 'CLOUDFLARE_R2' | 'EXTERNAL_URL';
  caption?: string;
  title?: string;
  author?: string;
}

interface RichContentEditorProps {
  blocks: ContentBlockItem[];
  onChange: (blocks: ContentBlockItem[]) => void;
}

export function RichContentEditor({ blocks, onChange }: RichContentEditorProps) {
  const [previewMode, setPreviewMode] = useState(false);
  const [uploadingBlockId, setUploadingBlockId] = useState<string | null>(null);
  const [uploadProgress, setUploadProgress] = useState<number>(0);
  const [blockErrors, setBlockErrors] = useState<Record<string, string>>({});
  const [recordingBlockId, setRecordingBlockId] = useState<string | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const recordedChunksRef = useRef<Blob[]>([]);

  const addBlock = (type: ContentBlockItem['type']) => {
    const newBlock: ContentBlockItem = {
      id: `blk_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      type,
      order: blocks.length + 1,
      text: '',
      level: type === 'heading' ? 2 : undefined,
      items: type === 'list' ? [''] : undefined,
      url: '',
      sourceType: 'CLOUDFLARE_R2',
      caption: '',
      title: '',
    };
    onChange([...blocks, newBlock]);
  };

  const updateBlock = (id: string, patch: Partial<ContentBlockItem>) => {
    const next = blocks.map((b) => (b.id === id ? { ...b, ...patch } : b));
    onChange(next);
  };

  const removeBlock = (id: string) => {
    const filtered = blocks
      .filter((b) => b.id !== id)
      .map((b, idx) => ({ ...b, order: idx + 1 }));
    onChange(filtered);
  };

  const moveBlock = (index: number, direction: -1 | 1) => {
    const targetIdx = index + direction;
    if (targetIdx < 0 || targetIdx >= blocks.length) return;
    const copy = [...blocks];
    const temp = copy[index];
    copy[index] = copy[targetIdx];
    copy[targetIdx] = temp;
    onChange(copy.map((b, idx) => ({ ...b, order: idx + 1 })));
  };

  const handleMediaFileUpload = async (
    block: ContentBlockItem,
    file: File
  ) => {
    setUploadingBlockId(block.id);
    setUploadProgress(0);
    setBlockErrors((prev) => ({ ...prev, [block.id]: '' }));

    try {
      const publicUrl = await uploadMediaToR2(file, 'tourism', (pct) => setUploadProgress(pct));
      updateBlock(block.id, {
        url: publicUrl,
        sourceType: 'CLOUDFLARE_R2',
        title: block.title || file.name.replace(/\.[^/.]+$/, ''),
      });
    } catch (err: any) {
      setBlockErrors((prev) => ({
        ...prev,
        [block.id]: err.message || 'Cloudflare R2 upload failed.',
      }));
    } finally {
      setUploadingBlockId(null);
    }
  };

  const handleStartVoiceRecord = async (block: ContentBlockItem) => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      recordedChunksRef.current = [];
      const recorder = new MediaRecorder(stream);
      mediaRecorderRef.current = recorder;

      recorder.ondataavailable = (e) => {
        if (e.data && e.data.size > 0) {
          recordedChunksRef.current.push(e.data);
        }
      };

      recorder.onstop = async () => {
        stream.getTracks().forEach((t) => t.stop());
        const blob = new Blob(recordedChunksRef.current, { type: 'audio/webm' });
        const file = new File([blob], `voice-guide-${Date.now()}.webm`, { type: 'audio/webm' });
        setRecordingBlockId(null);
        await handleMediaFileUpload(block, file);
      };

      recorder.start();
      setRecordingBlockId(block.id);
    } catch (err: any) {
      setBlockErrors((prev) => ({
        ...prev,
        [block.id]: 'Microphone access denied or unavailable. You can upload an audio file instead.',
      }));
    }
  };

  const handleStopVoiceRecord = () => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      mediaRecorderRef.current.stop();
    }
  };

  const handleValidateExternalUrl = async (block: ContentBlockItem) => {
    if (!block.url) return;
    setBlockErrors((prev) => ({ ...prev, [block.id]: '' }));
    try {
      const expected =
        block.type === 'image' ? 'IMAGE' : block.type === 'video' ? 'VIDEO' : block.type === 'audio' ? 'AUDIO' : undefined;
      const res = await validateExternalMediaUrl(block.url, expected);
      updateBlock(block.id, {
        url: res.url,
        sourceType: res.provider === 'CLOUDFLARE_R2' ? 'CLOUDFLARE_R2' : 'EXTERNAL_URL',
      });
    } catch (err: any) {
      setBlockErrors((prev) => ({ ...prev, [block.id]: err.message || 'Invalid media URL' }));
    }
  };

  return (
    <div className="space-y-4 border border-white/15 rounded-xl p-4 bg-white/[0.02]">
      {/* Toolbar Header */}
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-white/10 pb-3">
        <div>
          <h4 className="text-xs font-bold uppercase tracking-wider text-white flex items-center gap-2">
            Rich-Text Story &amp; Inline Multimedia Blocks (Cloudflare R2)
          </h4>
          <p className="text-[11px] text-white/50">
            Insert headings, paragraphs, photos, videos, and audio guides in any sequence. Mobile app renders blocks in exact order.
          </p>
        </div>
        <button
          type="button"
          onClick={() => setPreviewMode(!previewMode)}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-semibold border border-white/20 hover:bg-white/10 text-white transition-colors"
        >
          {previewMode ? <Edit3 className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
          {previewMode ? 'Edit Blocks' : 'Live Mobile Preview'}
        </button>
      </div>

      {/* Block Insertion Buttons */}
      {!previewMode && (
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-[10px] font-mono uppercase text-white/40 mr-1">+ Insert Block:</span>
          {[
            { type: 'heading', label: 'Heading', icon: Heading },
            { type: 'paragraph', label: 'Paragraph', icon: Type },
            { type: 'image', label: 'Photo (R2 / URL)', icon: ImageIcon },
            { type: 'video', label: 'Video (R2 / URL)', icon: Video },
            { type: 'audio', label: 'Audio / Voice Guide', icon: Volume2 },
            { type: 'list', label: 'Bullet List', icon: List },
            { type: 'quote', label: 'Highlight Quote', icon: Quote },
            { type: 'link', label: 'Action Link', icon: LinkIcon },
          ].map((btn) => {
            const Icon = btn.icon;
            return (
              <button
                key={btn.type}
                type="button"
                onClick={() => addBlock(btn.type as ContentBlockItem['type'])}
                className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-[11px] font-medium bg-white/5 hover:bg-white/15 border border-white/15 text-white transition-colors"
              >
                <Icon className="w-3.5 h-3.5 text-amber-400" />
                {btn.label}
              </button>
            );
          })}
        </div>
      )}

      {/* Preview Mode */}
      {previewMode ? (
        <div className="p-5 rounded-xl border border-white/15 bg-black/60 space-y-4">
          {blocks.length === 0 ? (
            <p className="text-xs text-white/40 italic">No content blocks added yet.</p>
          ) : (
            blocks.map((b) => (
              <div key={b.id} className="space-y-1.5">
                {b.type === 'heading' && (
                  <h3 className={`font-bold text-white ${b.level === 1 ? 'text-xl' : b.level === 3 ? 'text-sm' : 'text-base'}`}>
                    {b.text || 'Untitled Heading'}
                  </h3>
                )}
                {b.type === 'paragraph' && (
                  <p className="text-xs text-white/80 leading-relaxed whitespace-pre-line">{b.text}</p>
                )}
                {b.type === 'quote' && (
                  <blockquote className="border-l-2 border-amber-400 pl-3 py-1 italic text-xs text-amber-200/90">
                    “{b.text}” {b.author ? <span className="not-italic text-white/50">— {b.author}</span> : null}
                  </blockquote>
                )}
                {b.type === 'list' && (
                  <ul className="list-disc list-inside text-xs text-white/80 space-y-1">
                    {(b.items || []).map((it, i) => (
                      <li key={i}>{it}</li>
                    ))}
                  </ul>
                )}
                {b.type === 'image' && b.url && (
                  <figure className="space-y-1">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={b.url} alt={b.caption || 'Inline photo'} className="w-full max-h-64 object-cover rounded-lg border border-white/15" />
                    {b.caption && <figcaption className="text-[11px] text-white/50">{b.caption}</figcaption>}
                  </figure>
                )}
                {b.type === 'video' && b.url && (
                  <div className="space-y-1">
                    <video src={b.url} controls className="w-full max-h-64 rounded-lg border border-white/15 bg-black" />
                    {b.caption && <p className="text-[11px] text-white/50">{b.caption}</p>}
                  </div>
                )}
                {b.type === 'audio' && b.url && (
                  <div className="p-3 rounded-lg border border-white/15 bg-white/5 space-y-1.5">
                    <p className="text-xs font-semibold text-amber-300 flex items-center gap-1.5">
                      <Volume2 className="w-4 h-4" /> {b.title || 'Audio Safari Guide'}
                    </p>
                    <audio src={b.url} controls className="w-full h-9" />
                    {b.caption && <p className="text-[11px] text-white/50">{b.caption}</p>}
                  </div>
                )}
                {b.type === 'link' && b.url && (
                  <a
                    href={b.url}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1.5 text-xs text-amber-400 underline"
                  >
                    <LinkIcon className="w-3.5 h-3.5" />
                    {b.title || b.url}
                  </a>
                )}
              </div>
            ))
          )}
        </div>
      ) : (
        /* Editor Mode */
        <div className="space-y-3">
          {blocks.length === 0 && (
            <div className="text-center py-6 border border-dashed border-white/15 rounded-lg text-xs text-white/40">
              No rich content blocks yet. Click any button above to insert text, Cloudflare R2 images, videos, or voice recordings.
            </div>
          )}

          {blocks.map((block, idx) => {
            const isUploading = uploadingBlockId === block.id;
            const errMsg = blockErrors[block.id];

            return (
              <div
                key={block.id}
                className="p-3.5 rounded-lg border border-white/15 bg-black/50 space-y-2.5"
              >
                {/* Block Header */}
                <div className="flex items-center justify-between border-b border-white/10 pb-2">
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-white/10 text-amber-300 uppercase">
                      #{idx + 1} • {block.type}
                    </span>
                    {block.url && block.sourceType === 'CLOUDFLARE_R2' && (
                      <span className="text-[10px] font-mono text-emerald-400 flex items-center gap-1">
                        <CheckCircle2 className="w-3 h-3" /> Cloudflare R2
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      disabled={idx === 0}
                      onClick={() => moveBlock(idx, -1)}
                      className="p-1 text-white/50 hover:text-white disabled:opacity-25"
                      title="Move Up"
                    >
                      <ArrowUp className="w-3.5 h-3.5" />
                    </button>
                    <button
                      type="button"
                      disabled={idx === blocks.length - 1}
                      onClick={() => moveBlock(idx, 1)}
                      className="p-1 text-white/50 hover:text-white disabled:opacity-25"
                      title="Move Down"
                    >
                      <ArrowDown className="w-3.5 h-3.5" />
                    </button>
                    <button
                      type="button"
                      onClick={() => removeBlock(block.id)}
                      className="p-1 text-red-400 hover:text-red-300 ml-1"
                      title="Remove Block"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>

                {/* Heading Block */}
                {block.type === 'heading' && (
                  <div className="flex gap-2">
                    <select
                      value={block.level || 2}
                      onChange={(e) => updateBlock(block.id, { level: Number(e.target.value) as 1 | 2 | 3 })}
                      className="bg-black border border-white/15 rounded px-2 py-1.5 text-xs text-white"
                    >
                      <option value={1}>H1 Large</option>
                      <option value={2}>H2 Section</option>
                      <option value={3}>H3 Subheading</option>
                    </select>
                    <input
                      type="text"
                      value={block.text || ''}
                      onChange={(e) => updateBlock(block.id, { text: e.target.value })}
                      placeholder="Section heading text..."
                      className="flex-1 bg-black border border-white/15 rounded px-3 py-1.5 text-xs text-white font-semibold"
                    />
                  </div>
                )}

                {/* Paragraph Block */}
                {block.type === 'paragraph' && (
                  <textarea
                    rows={3}
                    value={block.text || ''}
                    onChange={(e) => updateBlock(block.id, { text: e.target.value })}
                    placeholder="Write rich narrative paragraph..."
                    className="w-full bg-black border border-white/15 rounded p-2.5 text-xs text-white"
                  />
                )}

                {/* Quote Block */}
                {block.type === 'quote' && (
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
                    <input
                      type="text"
                      value={block.text || ''}
                      onChange={(e) => updateBlock(block.id, { text: e.target.value })}
                      placeholder="Quote text..."
                      className="md:col-span-2 bg-black border border-white/15 rounded px-3 py-1.5 text-xs text-white"
                    />
                    <input
                      type="text"
                      value={block.author || ''}
                      onChange={(e) => updateBlock(block.id, { author: e.target.value })}
                      placeholder="Attribution / Ranger name (optional)"
                      className="bg-black border border-white/15 rounded px-3 py-1.5 text-xs text-white"
                    />
                  </div>
                )}

                {/* Bullet List Block */}
                {block.type === 'list' && (
                  <textarea
                    rows={3}
                    value={(block.items || []).join('\n')}
                    onChange={(e) =>
                      updateBlock(block.id, {
                        items: e.target.value.split('\n'),
                      })
                    }
                    placeholder="Enter one bullet item per line..."
                    className="w-full bg-black border border-white/15 rounded p-2.5 text-xs text-white font-mono"
                  />
                )}

                {/* Link Block */}
                {block.type === 'link' && (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                    <input
                      type="text"
                      value={block.title || ''}
                      onChange={(e) => updateBlock(block.id, { title: e.target.value })}
                      placeholder="Link label (e.g. UWA Gorilla Permit Guidelines)"
                      className="bg-black border border-white/15 rounded px-3 py-1.5 text-xs text-white"
                    />
                    <input
                      type="url"
                      value={block.url || ''}
                      onChange={(e) => updateBlock(block.id, { url: e.target.value, sourceType: 'EXTERNAL_URL' })}
                      placeholder="https://..."
                      className="bg-black border border-white/15 rounded px-3 py-1.5 text-xs text-white font-mono"
                    />
                  </div>
                )}

                {/* Multimedia Blocks: Image, Video, Audio */}
                {(block.type === 'image' || block.type === 'video' || block.type === 'audio') && (
                  <div className="space-y-2.5">
                    <div className="flex flex-wrap items-center gap-2">
                      {/* Method 1: Upload to Cloudflare R2 */}
                      <label className="cursor-pointer inline-flex items-center gap-1.5 px-3 py-1.5 rounded bg-white text-black text-xs font-semibold hover:bg-white/90 transition-colors">
                        {isUploading ? (
                          <>
                            <Loader2 className="w-3.5 h-3.5 animate-spin" />
                            Uploading to Cloudflare R2 ({uploadProgress}%)...
                          </>
                        ) : (
                          <>
                            <UploadCloud className="w-3.5 h-3.5" />
                            Upload {block.type.toUpperCase()} to Cloudflare R2
                          </>
                        )}
                        <input
                          type="file"
                          className="hidden"
                          accept={
                            block.type === 'image'
                              ? 'image/png,image/jpeg,image/webp,image/gif,image/svg+xml'
                              : block.type === 'video'
                              ? 'video/mp4,video/webm,video/quicktime'
                              : 'audio/mpeg,audio/mp3,audio/wav,audio/ogg,audio/aac,audio/mp4,audio/webm'
                          }
                          onChange={(e) => {
                            const f = e.target.files?.[0];
                            if (f) handleMediaFileUpload(block, f);
                          }}
                        />
                      </label>

                      {/* Inline Voice Recorder for Audio Blocks */}
                      {block.type === 'audio' && (
                        recordingBlockId === block.id ? (
                          <button
                            type="button"
                            onClick={handleStopVoiceRecord}
                            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded bg-red-500 text-white text-xs font-semibold animate-pulse"
                          >
                            <Square className="w-3.5 h-3.5" /> Stop &amp; Upload Recording to R2
                          </button>
                        ) : (
                          <button
                            type="button"
                            onClick={() => handleStartVoiceRecord(block)}
                            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded border border-white/20 bg-white/5 hover:bg-white/10 text-white text-xs font-medium"
                          >
                            <Mic className="w-3.5 h-3.5 text-amber-400" /> Record Voice Guide
                          </button>
                        )
                      )}
                    </div>

                    {/* Method 2: Paste External or Cloudflare R2 URL */}
                    <div className="flex items-center gap-2">
                      <input
                        type="text"
                        value={block.url || ''}
                        onChange={(e) => updateBlock(block.id, { url: e.target.value })}
                        placeholder={`Or paste Cloudflare R2 / external ${block.type} URL (https://...)`}
                        className="flex-1 bg-black border border-white/15 rounded px-2.5 py-1.5 text-xs font-mono text-white"
                      />
                      <button
                        type="button"
                        onClick={() => handleValidateExternalUrl(block)}
                        className="px-2.5 py-1.5 rounded border border-white/20 text-[11px] text-white/80 hover:bg-white/10"
                      >
                        Validate URL
                      </button>
                    </div>

                    {/* Title & Caption */}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                      <input
                        type="text"
                        value={block.title || ''}
                        onChange={(e) => updateBlock(block.id, { title: e.target.value })}
                        placeholder={`${block.type} title (optional)`}
                        className="bg-black border border-white/15 rounded px-2.5 py-1.5 text-xs text-white"
                      />
                      <input
                        type="text"
                        value={block.caption || ''}
                        onChange={(e) => updateBlock(block.id, { caption: e.target.value })}
                        placeholder="Caption / credit shown beneath media..."
                        className="bg-black border border-white/15 rounded px-2.5 py-1.5 text-xs text-white"
                      />
                    </div>

                    {/* Media Preview */}
                    {block.url && block.type === 'image' && (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={block.url} alt={block.caption || 'Preview'} className="h-32 rounded border border-white/15 object-cover" />
                    )}
                    {block.url && block.type === 'video' && (
                      <video src={block.url} controls className="h-36 rounded border border-white/15 bg-black" />
                    )}
                    {block.url && block.type === 'audio' && (
                      <audio src={block.url} controls className="w-full h-9" />
                    )}

                    {errMsg && <p className="text-[11px] text-red-400">{errMsg}</p>}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
