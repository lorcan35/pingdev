import { ActionCardData } from './types';

interface ActionCardProps {
  card: ActionCardData;
}

export default function ActionCard({ card }: ActionCardProps) {
  return (
    <div className="mt-2 bg-zinc-900 border border-zinc-700 rounded-xl overflow-hidden">
      {card.imageUrl && (
        <div className="w-full h-32 bg-zinc-800 flex items-center justify-center overflow-hidden">
          <img
            src={card.imageUrl}
            alt={card.title}
            className="w-full h-full object-cover"
            onError={(e) => {
              (e.target as HTMLImageElement).style.display = 'none';
            }}
          />
        </div>
      )}
      <div className="p-3">
        <h4 className="text-sm font-semibold text-zinc-100">{card.title}</h4>
        <p className="text-xs text-zinc-400 mt-1 leading-relaxed">{card.description}</p>
        {card.buttons.length > 0 && (
          <div className="flex gap-2 mt-3 flex-wrap">
            {card.buttons.map((btn, i) => (
              <button
                key={i}
                onClick={btn.onClick}
                className="px-3 py-1.5 text-xs font-medium rounded-lg bg-zinc-800
                  text-cyan-400 border border-zinc-700 hover:bg-zinc-700
                  active:scale-95 transition-all"
              >
                {btn.icon && <span className="mr-1">{btn.icon}</span>}
                {btn.label}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
