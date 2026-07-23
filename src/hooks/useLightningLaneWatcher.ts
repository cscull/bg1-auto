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

export type LightningLaneWatchState =
  | { status: 'watching'; watch: LightningLaneWatch }
  | {
      status: 'matched';
      watch: LightningLaneWatch;
      returnTime: ParkTime;
    }
  | undefined;

export function isTimeInRange(time: ParkTime, start: ParkTime, end: ParkTime) {
  return +time >= +start && +time <= +end;
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

  const start = useCallback((watch: LightningLaneWatch) => {
    setState({ status: 'watching', watch });
  }, []);

  const stop = useCallback(() => setState(undefined), []);

  useEffect(() => {
    setState(undefined);
  }, [scopeKey]);

  useEffect(() => {
    if (!enabled || state?.status !== 'watching') return;
    const intervalId = setInterval(() => {
      if (!document.hidden) {
        refreshExperiences(LIGHTNING_LANE_WATCH_INTERVAL_MS);
      }
    }, LIGHTNING_LANE_WATCH_INTERVAL_MS);
    return () => clearInterval(intervalId);
  }, [enabled, refreshExperiences, state]);

  useEffect(() => {
    if (state?.status !== 'watching') return;
    const experience = experiences.find(
      (exp): exp is FlexExperience =>
        exp.id === state.watch.experienceId && !!exp.flex
    );
    const returnTime = experience?.flex.nextAvailableTime;
    if (
      experience?.flex.available !== false &&
      returnTime &&
      isTimeInRange(returnTime, state.watch.start, state.watch.end)
    ) {
      setState({ status: 'matched', watch: state.watch, returnTime });
    }
  }, [experiences, state]);

  return { state, start, stop };
}
