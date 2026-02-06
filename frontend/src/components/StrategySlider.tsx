import { useState, useCallback, type ChangeEvent } from 'react';
import { cn } from '@/lib/utils';

export interface StrategySliderProps {
  label: string;
  value: number;
  onChange: (value: number) => void;
  min?: number;
  max?: number;
  step?: number;
  unit?: string;
  description?: string;
  disabled?: boolean;
  className?: string;
}

export function StrategySlider({
  label,
  value,
  onChange,
  min = 0,
  max = 100,
  step = 1,
  unit = '%',
  description,
  disabled = false,
  className,
}: StrategySliderProps) {
  const [isFocused, setIsFocused] = useState(false);

  const handleChange = useCallback(
    (e: ChangeEvent<HTMLInputElement>) => {
      onChange(Number(e.target.value));
    },
    [onChange]
  );

  const percentage = ((value - min) / (max - min)) * 100;

  return (
    <div className={cn('space-y-2', className)}>
      <div className="flex items-center justify-between">
        <label className="text-sm font-medium text-neutral-300">{label}</label>
        <div
          className={cn(
            'px-2 py-0.5 rounded-md text-sm font-mono font-medium',
            'bg-yellfi-dark-elevated border',
            isFocused
              ? 'border-yellfi-yellow-500/50 text-yellfi-yellow-400'
              : 'border-white/10 text-white'
          )}
        >
          {value}
          {unit}
        </div>
      </div>

      <div className="relative">
        <div className="h-2 rounded-full bg-yellfi-dark-elevated overflow-hidden">
          <div
            className="h-full rounded-full bg-gradient-to-r from-yellfi-yellow-500 to-yellfi-yellow-400 transition-all duration-150"
            style={{ width: `${percentage}%` }}
          />
        </div>
        <input
          type="range"
          min={min}
          max={max}
          step={step}
          value={value}
          onChange={handleChange}
          onFocus={() => setIsFocused(true)}
          onBlur={() => setIsFocused(false)}
          disabled={disabled}
          className={cn(
            'absolute inset-0 w-full h-full opacity-0 cursor-pointer',
            disabled && 'cursor-not-allowed'
          )}
        />
        <div
          className={cn(
            'absolute top-1/2 -translate-y-1/2 w-4 h-4 rounded-full',
            'bg-yellfi-yellow-500 border-2 border-yellfi-dark-primary',
            'shadow-lg transition-all duration-150',
            isFocused && 'scale-125 shadow-glow-yellow',
            disabled && 'opacity-50'
          )}
          style={{ left: `calc(${percentage}% - 8px)` }}
        />
      </div>

      <div className="flex justify-between text-xs text-neutral-500">
        <span>
          {min}
          {unit}
        </span>
        <span>
          {max}
          {unit}
        </span>
      </div>

      {description && <p className="text-xs text-neutral-400">{description}</p>}
    </div>
  );
}
