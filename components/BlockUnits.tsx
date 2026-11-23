'use client';
import './units-time.css';
import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { type DistanceUnit } from '../lib/workout-form';
const Context = createContext<{ unit: DistanceUnit; setUnit: (unit: DistanceUnit) => void }>({ unit: 'mi', setUnit: () => {} });
export const useBlockUnits = () => useContext(Context);
export function BlockUnitsProvider({ accountKey, children }: { accountKey: string; children: ReactNode }) {
  const [unit, update] = useState<DistanceUnit>('mi');
  const key = `forrest-runs:units:${accountKey}`;
  useEffect(() => { update('mi'); try { const value = localStorage.getItem(key); if (value === 'mi' || value === 'km') update(value); } catch {} }, [key]);
  function setUnit(value: DistanceUnit) { update(value); try { localStorage.setItem(key, value); } catch {} }
  return <Context.Provider value={{ unit, setUnit }}>{children}</Context.Provider>;
}
export function UnitsControl() {
  const { unit, setUnit } = useBlockUnits();
  return <label className="block-units-control">Units<select aria-label="Units" value={unit} onChange={event => setUnit(event.target.value as DistanceUnit)}><option value="mi">mi</option><option value="km">km</option></select></label>;
}
