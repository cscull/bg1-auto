import { useCallback, useEffect, useState } from 'react';

import { Experience, FlexExperience } from '@/api/ll';
import { ParkTime } from '@/datetime';

export const LIGHTNING_LANE_WATCH_INTERVAL_MS = 60_000;

export interface LightningLaneWatch {
  experienceId: Experience['id'];
  experienceName: Experience['name'];
  start: ParkTime;
  end: ParkTime;
}

interface LightningLaneWatchProgress {
  watch: LightningLaneWatch;
  lastObservedTime?: ParkTime;
  lastCheckedAt: number;
  checkCount: number;
}

export type LightningLaneWatchState =
  | ({
      status: 'watching';
      nextRefreshAt: number;
    } & LightningLaneWatchProgress)
  | ({
      status: 'matched';
      returnTime: ParkTime;
    } & LightningLaneWatchProgress)
  | undefined;

export function isTimeInRange(time: ParkTime, start: ParkTime, end: ParkTime) {
  return +time >= +start && +time <= +end;
}

function getReturnTime(experiences: Experience[], experienceId: string) {
  const experience = experiences.find(
    (exp): exp is FlexExperience => exp.id === experienceId && !!exp.flex
  );
  if (experience?.flex.available === false) return;
  return experience?.flex.nextAvailableTime;
}

export default function useLightningLaneWatcher({
  enabled,
  experiences,
  refreshExperiences,
  scopeKey,
}: {
  enabled: boolean;
  experiences: Experience[];
  refreshExperiences: (timeSinceLastCallMS?: number) => void;
  scopeKey: string;
}) {
  const [state, setState] = useState<LightningLaneWatchState>();

  const start = useCallback(
    (watch: LightningLaneWatch) => {
      const now = Date.now();
      const returnTime = getReturnTime(experiences, watch.experienceId);
      const progress = {
        watch,
        lastObservedTime: returnTime,
        lastCheckedAt: now,
        checkCount: 1,
      };
      if (returnTime && isTimeInRange(returnTime, watch.start, watch.end)) {
        setState({
          status: 'matched',
          ...progress,
          returnTime,
        });
        return;
      }
      setState({
        status: 'watching',
        ...progress,
        nextRefreshAt: now + LIGHTNING_LANE_WATCH_INTERVAL_MS,
      });
    },
    [experiences]
  );

  const stop = useCallback(() => setState(undefined), []);

  const refreshNow = useCallback(() => {
    refreshExperiences();
    setState(current => {
      if (current?.status !== 'watching') return current;
      return {
        ...current,
        nextRefreshAt: Date.now() + LIGHTNING_LANE_WATCH_INTERVAL_MS,
      };
    });
  }, [refreshExperiences]);

  const continueWatching = useCallback(() => {
    refreshExperiences();
    setState(current => {
      if (current?.status !== 'matched') return current;
      return {
        status: 'watching',
        watch: current.watch,
        lastObservedTime: current.returnTime,
        lastCheckedAt: current.lastCheckedAt,
        checkCount: current.checkCount,
        nextRefreshAt: Date.now() + LIGHTNING_LANE_WATCH_INTERVAL_MS,
      };
    });
  }, [refreshExperiences]);

  useEffect(() => {
    setState(undefined);
  }, [scopeKey]);

  const nextRefreshAt =
    state?.status === 'watching' ? state.nextRefreshAt : undefined;
  const isWatching = state?.status === 'watching';

  useEffect(() => {
    if (!enabled || nextRefreshAt === undefined) return;
    const timeoutId = setTimeout(
      () => {
        const now = Date.now();
        setState(current => {
          if (current?.status !== 'watching') return current;
          return {
            ...current,
            nextRefreshAt: now + LIGHTNING_LANE_WATCH_INTERVAL_MS,
          };
        });
        if (!document.hidden) {
          refreshExperiences(LIGHTNING_LANE_WATCH_INTERVAL_MS);
        }
      },
      Math.max(0, nextRefreshAt - Date.now())
    );
    return () => clearTimeout(timeoutId);
  }, [enabled, nextRefreshAt, refreshExperiences]);

  useEffect(() => {
    setState(current => {
      if (current?.status !== 'watching') return current;
      const returnTime = getReturnTime(experiences, current.watch.experienceId);
      const progress = {
        watch: current.watch,
        lastObservedTime: returnTime,
        lastCheckedAt: Date.now(),
        checkCount: current.checkCount + 1,
      };
      if (
        returnTime &&
        isTimeInRange(returnTime, current.watch.start, current.watch.end)
      ) {
        return {
          status: 'matched',
          ...progress,
          returnTime,
        };
      }
      return {
        status: 'watching',
        ...progress,
        nextRefreshAt: current.nextRefreshAt,
      };
    });
  }, [experiences]);

  useEffect(() => {
    if (!isWatching) return;
    const handleVisibilityChange = () => {
      if (!document.hidden) {
        setState(current => {
          if (current?.status !== 'watching') return current;
          return {
            ...current,
            nextRefreshAt: Math.min(current.nextRefreshAt, Date.now()),
          };
        });
      }
    };
    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () =>
      document.removeEventListener('visibilitychange', handleVisibilityChange);
  }, [isWatching]);

  return { state, start, stop, refreshNow, continueWatching };
}
