"use client";

import { Check } from "lucide-react";

type Props = {
  label: string;
  value: string;
  selected: boolean;
  onSelect: (value: string) => void;
  name: string;
};

export function OptionCard({ label, value, selected, onSelect, name }: Props) {
  return (
    <label
      className="relative block cursor-pointer transition-colors"
      style={{
        border: `1.5px solid ${selected ? "#7A2535" : "rgba(25,16,16,0.15)"}`,
        background: selected ? "#F7F4EE" : "#FFFFFF",
        padding: "1.25rem 1.5rem",
        borderRadius: 0,
      }}
      onMouseEnter={(e) => {
        if (!selected) e.currentTarget.style.borderColor = "#2E8E8E";
      }}
      onMouseLeave={(e) => {
        if (!selected)
          e.currentTarget.style.borderColor = "rgba(25,16,16,0.15)";
      }}
    >
      <input
        type="radio"
        name={name}
        value={value}
        checked={selected}
        onChange={() => onSelect(value)}
        className="sr-only"
      />
      <span
        style={{
          fontFamily: "'Fedra Sans Std', sans-serif",
          fontWeight: 350,
          fontSize: "1rem",
          color: "#191010",
        }}
      >
        {label}
      </span>
      {selected && (
        <Check
          size={18}
          color="#2E8E8E"
          strokeWidth={2.5}
          className="absolute right-4 top-1/2 -translate-y-1/2"
        />
      )}
    </label>
  );
}
