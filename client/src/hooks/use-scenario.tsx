import { createContext, useContext, useState, useEffect, type ReactNode } from "react";

interface ScenarioContextType {
  activeScenarioId: number | null;
  setActiveScenarioId: (id: number) => void;
}

const ScenarioContext = createContext<ScenarioContextType>({
  activeScenarioId: null,
  setActiveScenarioId: () => {},
});

export function ScenarioProvider({ children }: { children: ReactNode }) {
  const [activeScenarioId, setId] = useState<number | null>(() => {
    const stored = localStorage.getItem("activeScenarioId");
    return stored ? Number(stored) : null;
  });

  const setActiveScenarioId = (id: number) => {
    localStorage.setItem("activeScenarioId", String(id));
    setId(id);
  };

  return (
    <ScenarioContext.Provider value={{ activeScenarioId, setActiveScenarioId }}>
      {children}
    </ScenarioContext.Provider>
  );
}

export function useScenario() {
  return useContext(ScenarioContext);
}
