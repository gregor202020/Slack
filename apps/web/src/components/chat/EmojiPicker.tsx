'use client'

const EMOJI_LIST = [
  '\u{1F44D}', // thumbs up
  '\u{2764}\u{FE0F}', // red heart
  '\u{1F602}', // face with tears of joy
  '\u{1F525}', // fire
  '\u{1F440}', // eyes
  '\u{1F389}', // party popper
  '\u{2705}', // check mark
  '\u{274C}', // cross mark
  '\u{1F64F}', // folded hands
  '\u{1F4AF}', // hundred points
  '\u{1F680}', // rocket
  '\u{1F60D}', // heart eyes
  '\u{1F622}', // crying face
  '\u{1F914}', // thinking face
  '\u{1F44F}', // clapping hands
  '\u{1F60E}', // smiling with sunglasses
]

interface EmojiPickerProps {
  onSelect: (emoji: string) => void
}

export function EmojiPicker({ onSelect }: EmojiPickerProps) {
  return (
    <div className="absolute right-0 top-full mt-1 z-50 bg-smoke-800 border border-smoke-600 rounded-lg shadow-xl p-2 w-[200px]" role="listbox" aria-label="Emoji picker">
      <div className="grid grid-cols-4 gap-1">
        {EMOJI_LIST.map((emoji) => (
          <button
            key={emoji}
            onClick={() => onSelect(emoji)}
            role="option"
            aria-label={`React with ${emoji}`}
            className="p-1.5 rounded hover:bg-smoke-700 text-lg leading-none transition-colors cursor-pointer"
          >
            {emoji}
          </button>
        ))}
      </div>
    </div>
  )
}
