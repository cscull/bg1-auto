import { useCallback, useEffect, useRef, useState } from 'react';

import Button from '@/components/Button';
import RefreshIcon from '@/icons/RefreshIcon';

const MIN_INTERVAL_MS = 1000;
const MAX_INTERVAL_MS = 4000;

function randomInterval() {
  return MIN_INTERVAL_MS + Math.random() * (MAX_INTERVAL_MS - MIN_INTERVAL_MS);
}

interface Props {
  name: string;
  onClick: () => void;
}

export default function AutoRefreshButton({ name, onClick }: Props) {
  const [active, setActive] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const onClickRef = useRef(onClick);
  onClickRef.current = onClick;

  const clearTimer = useCallback(() => {
    if (timerRef.current !== null) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  useEffect(() => {
    if (!active) {
      clearTimer();
      return;
    }

    function scheduleNext() {
      timerRef.current = setTimeout(() => {
        onClickRef.current();
        scheduleNext();
      }, randomInterval());
    }

    // Do an initial refresh immediately, then start the random interval cycle
    onClickRef.current();
    scheduleNext();

    return clearTimer;
  }, [active, clearTimer]);

  return (
    <Button
      title={`Auto-Refresh ${name} (${active ? 'ON' : 'OFF'})`}
      onClick={() => setActive(prev => !prev)}
    >
      <div className={active ? 'animate-spin' : ''}>
        <RefreshIcon />
      </div>
      <span className="ml-0.5 text-xs">{active ? 'ON' : 'OFF'}</span>
    </Button>
  );
}
