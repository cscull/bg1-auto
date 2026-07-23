import { act, renderHook } from '@testing-library/react';

import { FlexExperience } from '@/api/ll';
import { ParkTime } from '@/datetime';

import useLightningLaneWatcher, {
  LIGHTNING_LANE_WATCH_INTERVAL_MS,
  isTimeInRange,
} from './useLightningLaneWatcher';

const experience = (time?: ParkTime): FlexExperience =>
  ({
    id: 'ride-1',
    name: 'Space Ride',
    flex: { available: !!time, nextAvailableTime: time },
  }) as FlexExperience;

describe('isTimeInRange', () => {
  it('includes the start and end of the range', () => {
    const start = new ParkTime(10);
    const end = new ParkTime(11);
    expect(isTimeInRange(start, start, end)).toBe(true);
    expect(isTimeInRange(end, start, end)).toBe(true);
    expect(isTimeInRange(new ParkTime(11, 1), start, end)).toBe(false);
  });

  it('uses the park day for ranges after midnight', () => {
    expect(
      isTimeInRange(new ParkTime(1), new ParkTime(23), new ParkTime(2))
    ).toBe(true);
  });
});

describe('useLightningLaneWatcher', () => {
  it('polls while active and stops after a match', () => {
    jest.useFakeTimers();
    Object.defineProperty(document, 'hidden', {
      configurable: true,
      value: false,
    });
    const refreshExperiences = jest.fn();
    const { result, rerender } = renderHook(
      ({ experiences }) =>
        useLightningLaneWatcher({
          enabled: true,
          experiences,
          refreshExperiences,
          scopeKey: 'park:date',
        }),
      { initialProps: { experiences: [experience(new ParkTime(9))] } }
    );

    act(() => {
      result.current.start({
        experienceId: 'ride-1',
        experienceName: 'Space Ride',
        start: new ParkTime(10),
        end: new ParkTime(11),
      });
    });
    act(() => {
      jest.advanceTimersByTime(LIGHTNING_LANE_WATCH_INTERVAL_MS);
    });
    expect(refreshExperiences).toHaveBeenCalledWith(
      LIGHTNING_LANE_WATCH_INTERVAL_MS
    );

    rerender({ experiences: [experience(new ParkTime(10, 30))] });
    expect(result.current.state).toMatchObject({
      status: 'matched',
      returnTime: new ParkTime(10, 30),
    });

    act(() => {
      jest.advanceTimersByTime(LIGHTNING_LANE_WATCH_INTERVAL_MS);
    });
    expect(refreshExperiences).toHaveBeenCalledTimes(1);
  });
});
