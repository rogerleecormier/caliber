import { createContext, useContext, useState, useCallback, ReactNode } from "react";

export type SearchStatus = "idle" | "running" | "completed" | "error";

export interface SearchState {
  id: string;
  status: SearchStatus;
  message: string;
  jobsFound: number;
  startTime: number | null;
  endTime: number | null;
  errors: string[];
}

interface SearchStatusContextType {
  searches: SearchState[];
  startSearch: (id: string, message: string) => void;
  updateSearch: (id: string, status: SearchStatus, message: string) => void;
  setJobsFound: (id: string, count: number) => void;
  addError: (id: string, error: string) => void;
  clearSearch: (id: string) => void;
  clearAll: () => void;
  getLatestSearch: () => SearchState | null;
}

const SearchStatusContext = createContext<SearchStatusContextType | undefined>(undefined);

export function SearchStatusProvider({ children }: { children: ReactNode }) {
  const [searches, setSearches] = useState<Map<string, SearchState>>(new Map());

  const startSearch = useCallback((id: string, message: string) => {
    setSearches((prev) => {
      const newSearches = new Map(prev);
      newSearches.set(id, {
        id,
        status: "running",
        message,
        jobsFound: 0,
        startTime: Date.now(),
        endTime: null,
        errors: [],
      });
      return newSearches;
    });
  }, []);

  const updateSearch = useCallback((id: string, status: SearchStatus, message: string) => {
    setSearches((prev) => {
      const newSearches = new Map(prev);
      const existing = newSearches.get(id);
      if (existing) {
        newSearches.set(id, {
          ...existing,
          status,
          message,
          endTime: (status === "completed" || status === "error") ? Date.now() : null,
        });
      }
      return newSearches;
    });
  }, []);

  const setJobsFound = useCallback((id: string, count: number) => {
    setSearches((prev) => {
      const newSearches = new Map(prev);
      const existing = newSearches.get(id);
      if (existing) {
        newSearches.set(id, { ...existing, jobsFound: count });
      }
      return newSearches;
    });
  }, []);

  const addError = useCallback((id: string, error: string) => {
    setSearches((prev) => {
      const newSearches = new Map(prev);
      const existing = newSearches.get(id);
      if (existing) {
        newSearches.set(id, {
          ...existing,
          errors: [...existing.errors, error],
        });
      }
      return newSearches;
    });
  }, []);

  const clearSearch = useCallback((id: string) => {
    setSearches((prev) => {
      const newSearches = new Map(prev);
      newSearches.delete(id);
      return newSearches;
    });
  }, []);

  const clearAll = useCallback(() => {
    setSearches(new Map());
  }, []);

  const getLatestSearch = useCallback((): SearchState | null => {
    if (searches.size === 0) return null;

    let latest: SearchState | null = null;
    let latestTime = 0;

    for (const search of searches.values()) {
      const time = search.endTime || search.startTime || 0;
      if (time > latestTime) {
        latestTime = time;
        latest = search;
      }
    }
    return latest;
  }, [searches]);

  const value: SearchStatusContextType = {
    searches: Array.from(searches.values()),
    startSearch,
    updateSearch,
    setJobsFound,
    addError,
    clearSearch,
    clearAll,
    getLatestSearch,
  };

  return (
    <SearchStatusContext.Provider value={value}>
      {children}
    </SearchStatusContext.Provider>
  );
}

export function useSearchStatusContext() {
  const context = useContext(SearchStatusContext);
  if (!context) {
    throw new Error("useSearchStatusContext must be used within SearchStatusProvider");
  }
  return context;
}
