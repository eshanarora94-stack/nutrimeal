"use client";

import { useState, useCallback } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

export interface IngredientSearchResult {
  fdcId: number;
  description: string;
  foodCategory?: string;
  dataType?: string;
}

interface Props {
  onSelect: (ingredient: IngredientSearchResult) => void;
  placeholder?: string;
}

export function IngredientSearch({ onSelect, placeholder = "Search ingredients…" }: Props) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<IngredientSearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);

  const search = useCallback(async (q: string) => {
    if (q.trim().length < 2) { setResults([]); setOpen(false); return; }
    setLoading(true);
    try {
      const res = await fetch(`/api/foods/search?q=${encodeURIComponent(q)}&pageSize=8`);
      const data = await res.json();
      setResults(data.foods ?? []);
      setOpen(true);
    } catch {
      setResults([]);
    } finally {
      setLoading(false);
    }
  }, []);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    setQuery(val);
    const timer = setTimeout(() => search(val), 300);
    return () => clearTimeout(timer);
  };

  const handleSelect = (item: IngredientSearchResult) => {
    onSelect(item);
    setQuery(item.description);
    setOpen(false);
  };

  return (
    <div className="relative">
      <Input
        value={query}
        onChange={handleChange}
        placeholder={placeholder}
        autoComplete="off"
      />
      {loading && (
        <p className="absolute right-3 top-2.5 text-xs text-muted-foreground">Searching…</p>
      )}
      {open && results.length > 0 && (
        <ul className="absolute z-50 mt-1 w-full rounded-md border bg-popover shadow-md">
          {results.map((item) => (
            <li key={item.fdcId}>
              <Button
                variant="ghost"
                className="w-full justify-start gap-2 rounded-none px-3 py-2 text-sm"
                onClick={() => handleSelect(item)}
              >
                <span className="truncate">{item.description}</span>
                {item.foodCategory && (
                  <Badge variant="secondary" className="ml-auto shrink-0 text-xs">
                    {item.foodCategory}
                  </Badge>
                )}
              </Button>
            </li>
          ))}
        </ul>
      )}
      {open && results.length === 0 && !loading && query.length >= 2 && (
        <div className="absolute z-50 mt-1 w-full rounded-md border bg-popover px-3 py-2 text-sm text-muted-foreground shadow-md">
          No results for &ldquo;{query}&rdquo;
        </div>
      )}
    </div>
  );
}
