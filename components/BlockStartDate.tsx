'use client';
import { useEffect, useState } from 'react';
import { CalendarDays } from 'lucide-react';
import { centralToday } from '../lib/domain';
import { trainingStartLabel } from '../lib/onboarding';

export default function BlockStartDate({ date, today }: { date: string | null; today: string }) {
  const [day, setDay] = useState(today);
  useEffect(() => {
    const update = () => setDay(centralToday());
    update();
    const timer = window.setInterval(update, 60_000);
    return () => window.clearInterval(timer);
  }, []);
  return <p className="training-start-indicator"><CalendarDays size={18} aria-hidden="true" /><span>{trainingStartLabel(date, day)}</span></p>;
}
