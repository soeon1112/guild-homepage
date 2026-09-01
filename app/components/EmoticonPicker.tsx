"use client";

import { EMOTICON_IDS, getEmoticonUrl } from "@/src/lib/emoticons";

export function EmoticonPicker({ onSelect }: { onSelect: (id: string) => void }) {
  return (
    <div className="grid grid-cols-4 gap-2 p-3 bg-cream rounded-t-xl overflow-y-auto max-h-[280px]" style={{ background: "#fef5e6" }}>
      {EMOTICON_IDS.map((id) => (
        <button
          key={id}
          type="button"
          onClick={() => onSelect(id)}
          className="aspect-square hover:opacity-70 transition"
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={getEmoticonUrl(id)} alt="" className="w-full h-full object-contain" />
        </button>
      ))}
    </div>
  );
}
