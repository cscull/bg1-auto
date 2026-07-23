import { memo, use, useEffect, useRef, useState } from 'react';

import { isLLMP } from '@/api/itinerary';
import { Experience, FlexExperience } from '@/api/ll';
import { Park } from '@/api/resort';
import Alert from '@/components/Alert';
import Button from '@/components/Button';
import Screen from '@/components/Screen';
import Tab from '@/components/Tab';
import { Time } from '@/components/Time';
import BookingDateContext from '@/contexts/BookingDateContext';
import ClientsContext from '@/contexts/ClientsContext';
import ExperiencesContext from '@/contexts/ExperiencesContext';
import NavContext from '@/contexts/NavContext';
import ParkContext from '@/contexts/ParkContext';
import PlansContext from '@/contexts/PlansContext';
import ResortContext from '@/contexts/ResortContext';
import ThemeContext from '@/contexts/ThemeContext';
import {
  DateTime,
  ParkTime,
  formatTime,
  parkDate,
  upcomingTimes,
} from '@/datetime';
import useLightningLaneWatcher, {
  LIGHTNING_LANE_WATCH_INTERVAL_MS,
} from '@/hooks/useLightningLaneWatcher';
import useSavedParty from '@/hooks/useSavedParty';
import useScreenState from '@/hooks/useScreenState';
import CheckmarkIcon from '@/icons/CheckmarkIcon';
import DropIcon from '@/icons/DropIcon';
import { IconProps } from '@/icons/Icon';
import LightningIcon from '@/icons/LightningIcon';
import StarIcon from '@/icons/StarIcon';
import kvdb from '@/kvdb';

import RebookingHeader from '../../RebookingHeader';
import { HomeTabProps } from '../Home';
import RefreshButton from '../RefreshButton';
import BookingDateSelect from './BookingDateSelect';
import LLButton from './LLButton';
import LLTime from './LLTime';
import LabeledItem from './LabeledItem';
import Legend, { Symbol } from './Legend';
import ParkSelect from './ParkSelect';
import StandbyTime from './StandbyTime';
import TimeBanner from './TimeBanner';
import useSort, { Sorter } from './useSort';

const LP_MIN_STANDBY = 30;
const LP_MAX_LL_WAIT = 60;
export const STARRED_KEY = 'bg1.genie.tipBoard.starred';
const LIGHTNING_PICK = 'Lightning Pick';
const BOOKED = 'Booked';

export interface ExtFlexExp extends FlexExperience {
  booked: boolean;
  lp: boolean;
  starred: boolean;
}

const isExperienced = (exp: ExtFlexExp) => exp.experienced && !exp.starred;

export default function MultiPassList({ ref }: HomeTabProps) {
  useSavedParty();
  const { ll } = use(ClientsContext);
  const { park } = use(ParkContext);
  const { experiences, refreshExperiences, loaderElem } =
    use(ExperiencesContext);
  const { bookingDate } = use(BookingDateContext);
  const { sortType, sorter, SortSelect } = useSort();
  const firstUpdate = useRef(true);

  useEffect(() => {
    if (!firstUpdate.current) ref.current?.scroll(0, 0);
  }, [sortType, ref]);

  useEffect(() => {
    firstUpdate.current = false;
  }, []);

  const today = parkDate();
  const dropTime = upcomingTimes(park.dropTimes)[0];

  return (
    <Tab
      title={<abbr title="Lightning Lane">LL</abbr>}
      buttons={
        <>
          {ll.rules.prebook && <BookingDateSelect />}
          <SortSelect />
          <ParkSelect />
          <RefreshButton name="Experiences" onClick={refreshExperiences} />
        </>
      }
      subhead={
        <>
          <RebookingHeader />
          {bookingDate === today && (
            <TimeBanner bookTime={ll.nextBookTime} dropTime={dropTime} />
          )}
        </>
      }
      ref={ref}
    >
      <Experiences experiences={experiences} park={park} sorter={sorter} />
      {loaderElem}
    </Tab>
  );
}

const Experiences = memo(function Experiences({
  experiences,
  park,
  sorter,
}: {
  experiences: Experience[];
  park: Park;
  sorter: Sorter;
}) {
  const { ll } = use(ClientsContext);
  const { goTo } = use(NavContext);
  const theme = use(ThemeContext);
  const resort = use(ResortContext);
  const { plans } = use(PlansContext);
  const { refreshExperiences } = use(ExperiencesContext);
  const { bookingDate } = use(BookingDateContext);
  const { isActiveScreen } = useScreenState();
  const [watchDraft, setWatchDraft] = useState<{
    experience: ExtFlexExp;
    start: string;
    end: string;
  }>();
  const [starred, setStarred] = useState<Set<string>>(() => {
    const ids = kvdb.get<string[]>(STARRED_KEY) ?? [];
    return new Set(Array.isArray(ids) ? ids : []);
  });
  const today = parkDate();
  const isBookingToday = bookingDate === today;
  const dropTime = isBookingToday
    ? upcomingTimes(park.dropTimes)[0]
    : park.dropTimes[0];
  const now = +DateTime.now().time;
  const watcher = useLightningLaneWatcher({
    enabled: isActiveScreen,
    experiences,
    refreshExperiences,
    scopeKey: `${park.id}:${bookingDate}`,
  });

  useEffect(() => {
    if (watcher.state?.status !== 'matched') return;
    const { experienceId, experienceName } = watcher.state.watch;
    const { returnTime } = watcher.state;
    document
      .getElementById(`ll-experience-${experienceId}`)
      ?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    navigator.vibrate?.([200, 100, 200]);
    const alertId = setTimeout(() => {
      alert(
        `${experienceName} has a Lightning Lane return time of ${formatTime(returnTime)}. Auto-refresh has stopped.`
      );
    });
    return () => clearTimeout(alertId);
  }, [watcher.state]);

  useEffect(() => {
    kvdb.set<string[]>(STARRED_KEY, [...starred]);
  }, [starred]);

  function toggleStar({ id }: { id: string }) {
    setStarred(starred => {
      starred = new Set(starred);
      if (starred.has(id)) {
        starred.delete(id);
      } else {
        starred.add(id);
      }
      return starred;
    });
  }

  const showLightningPickDesc = () => goTo(<LightningPickDesc />);
  const showDropTimeDesc = (exp?: Experience) =>
    goTo(
      <DropTimeDesc
        park={park}
        experience={exp}
        isBookingToday={isBookingToday}
      />
    );
  const showBookedDesc = () => goTo(<BookedDesc />);

  function editWatch(experience: ExtFlexExp) {
    const start = experience.flex.nextAvailableTime ?? new ParkTime(9);
    setWatchDraft({
      experience,
      start: start.toString().slice(0, 5),
      end: start.add({ hours: 1 }).toString().slice(0, 5),
    });
  }

  function startWatch() {
    if (!watchDraft) return;
    watcher.start({
      experienceId: watchDraft.experience.id,
      experienceName: watchDraft.experience.name,
      start: ParkTime.from(watchDraft.start),
      end: ParkTime.from(watchDraft.end),
    });
    setWatchDraft(undefined);
  }

  const LLButtonOrTime = ll.rules.book ? LLButton : LLTime;

  const ExperienceList = ({
    experiences,
    type,
  }: {
    experiences: ExtFlexExp[];
    type: string;
  }) => (
    <ul className="dividers" data-testid={type}>
      {experiences.map(exp => {
        const nextDropTime = isBookingToday
          ? upcomingTimes(exp.dropTimes ?? [])[0]
          : exp.dropTimes?.[0];
        return (
          <li
            id={`ll-experience-${exp.id}`}
            key={exp.id + (exp.starred ? '*' : '')}
            className={
              watcher.state?.status === 'matched' &&
              watcher.state.watch.experienceId === exp.id
                ? 'bg-green-100'
                : undefined
            }
          >
            <div className="flex items-center gap-x-2">
              <StarButton experience={exp} toggleStar={toggleStar} />
              <h3 className="flex-1 mt-0 text-lg font-semibold leading-tight truncate">
                {exp.name}
              </h3>
              {exp.lp ? (
                <InfoButton
                  name={LIGHTNING_PICK}
                  icon={LightningIcon}
                  onClick={showLightningPickDesc}
                />
              ) : nextDropTime ? (
                nextDropTime.equals(dropTime) ? (
                  <InfoButton
                    name="Next Drop"
                    icon={DropIcon}
                    onClick={() => showDropTimeDesc(exp)}
                  />
                ) : (
                  <InfoButton
                    name="Future Drop"
                    icon={DropIcon}
                    onClick={() => showDropTimeDesc(exp)}
                    className="opacity-50"
                  />
                )
              ) : null}
              {exp.booked && (
                <InfoButton
                  name={BOOKED}
                  icon={CheckmarkIcon}
                  onClick={showBookedDesc}
                />
              )}
            </div>
            <div className="flex flex-wrap gap-1.5 mt-2">
              <StandbyTime experience={exp} average={!isBookingToday} />
              <LabeledItem label="LL">
                <LLButtonOrTime experience={exp} />
              </LabeledItem>
              <Button type="small" onClick={() => editWatch(exp)}>
                {watcher.state?.status === 'watching' &&
                watcher.state.watch.experienceId === exp.id
                  ? 'Watching'
                  : 'Watch'}
              </Button>
            </div>
            {watchDraft?.experience.id === exp.id && (
              <div className="mt-3 rounded-sm border border-gray-300 bg-gray-100 p-2">
                <div className="font-semibold">Watch {exp.name}</div>
                <p className="mt-1 text-sm">
                  Refresh every {LIGHTNING_LANE_WATCH_INTERVAL_MS / 1000}{' '}
                  seconds while this screen is open. Stop as soon as the return
                  time enters this range.
                </p>
                <div className="mt-2 flex flex-wrap items-end gap-2">
                  <label className="text-sm font-semibold">
                    From
                    <input
                      aria-label="Desired return time from"
                      type="time"
                      value={watchDraft.start}
                      onChange={event =>
                        setWatchDraft(draft =>
                          draft
                            ? { ...draft, start: event.target.value }
                            : draft
                        )
                      }
                      className="ml-1 rounded-sm border border-gray-400 bg-white p-1"
                    />
                  </label>
                  <label className="text-sm font-semibold">
                    To
                    <input
                      aria-label="Desired return time to"
                      type="time"
                      value={watchDraft.end}
                      onChange={event =>
                        setWatchDraft(draft =>
                          draft ? { ...draft, end: event.target.value } : draft
                        )
                      }
                      className="ml-1 rounded-sm border border-gray-400 bg-white p-1"
                    />
                  </label>
                  <Button type="small" onClick={startWatch}>
                    Start watching
                  </Button>
                  <Button type="small" onClick={() => setWatchDraft(undefined)}>
                    Cancel
                  </Button>
                </div>
              </div>
            )}
          </li>
        );
      })}
    </ul>
  );

  const bookedIds = new Set(
    plans
      .filter(isLLMP)
      .filter(b => b.start.date === bookingDate)
      .map(b => b.experience.id)
  );
  const flexExps: ExtFlexExp[] = experiences
    .filter((exp): exp is FlexExperience => !!exp.flex)
    .map(exp => {
      const standby = exp.standby.waitTime || 0;
      const { nextAvailableTime } = exp.flex ?? {};
      const priorityLevel = Math.trunc(exp.priority || 4);
      return {
        ...exp,
        booked: bookedIds.has(exp.id),
        lp:
          isBookingToday &&
          !!nextAvailableTime &&
          standby >= LP_MIN_STANDBY &&
          priorityLevel < 3 &&
          +nextAvailableTime - now <=
            Math.min(LP_MAX_LL_WAIT, ((4 - priorityLevel) / 3) * standby) * 60,
        starred: starred.has(exp.id),
      };
    })
    .sort(
      (a, b) => +!a.starred - +!b.starred || +!a.lp - +!b.lp || sorter(a, b)
    );
  const unexperienced = flexExps.filter(exp => !isExperienced(exp));
  const experienced = flexExps
    .filter(isExperienced)
    .sort((a, b) => a.name.localeCompare(b.name));

  return (
    <>
      {watcher.state?.status === 'watching' && (
        <Alert title="Lightning Lane watcher">
          <div className="flex flex-wrap items-center gap-2 py-2">
            <span className="flex-1">
              Watching <b>{watcher.state.watch.experienceName}</b> for a return
              time from <Time time={watcher.state.watch.start} /> to{' '}
              <Time time={watcher.state.watch.end} />. Refreshing every{' '}
              {LIGHTNING_LANE_WATCH_INTERVAL_MS / 1000} seconds while this
              screen is open.
            </span>
            <Button type="small" onClick={watcher.stop}>
              Stop watching
            </Button>
          </div>
        </Alert>
      )}
      {watcher.state?.status === 'matched' && (
        <div
          role="alert"
          className="mt-4 rounded-sm border-2 border-green-600 bg-green-100 p-2"
        >
          <div className="font-semibold text-green-900">
            {watcher.state.watch.experienceName} is available at{' '}
            <Time time={watcher.state.returnTime} />
          </div>
          <p className="mt-1 text-sm">Auto-refresh has stopped.</p>
          <Button type="small" onClick={watcher.stop}>
            Dismiss
          </Button>
        </div>
      )}
      <ExperienceList experiences={unexperienced} type="unexperienced" />
      {experienced.length > 0 && (
        <>
          <h2
            className={`-mx-3 px-3 py-1 text-sm uppercase text-center ${theme.bg} text-white`}
          >
            Experienced or Expired
          </h2>
          <ExperienceList experiences={experienced} type="experienced" />
        </>
      )}
      {flexExps.length > 0 && (
        <>
          <Legend title="Symbols">
            <Symbol
              sym={<LightningIcon themed />}
              def={LIGHTNING_PICK}
              onInfo={showLightningPickDesc}
            />
            {park.dropTimes.length > 0 && (
              <Symbol
                sym={
                  <div className="flex gap-x-1">
                    <DropIcon themed /> /{' '}
                    <DropIcon themed className="opacity-50" />
                  </div>
                }
                def="Next/Future Drop"
                onInfo={showDropTimeDesc}
              />
            )}
            <Symbol
              sym={<CheckmarkIcon themed />}
              def={BOOKED}
              onInfo={showBookedDesc}
            />
          </Legend>
          {!isBookingToday && (
            <p className="text-sm">
              Standby times for future dates are monthly averages (source:{' '}
              <a
                href={`https://www.thrill-data.com/waits/park/${resort.id.toLowerCase()}/${park.name.toLowerCase().replaceAll(' ', '-')}/`}
                target="_blank"
                rel="noreferrer"
                className="whitespace-nowrap"
              >
                Thrill Data
              </a>
              ) meant to assist you in selecting your initial{' '}
              <abbr title="Lightning Lanes">LLs</abbr>. They are not wait time
              estimates for this particular day.
            </p>
          )}
        </>
      )}
    </>
  );
});

function InfoButton({
  name,
  icon: Icon,
  onClick,
  className,
}: {
  name: string;
  icon: React.FunctionComponent<IconProps>;
  onClick: () => void;
  className?: string;
}) {
  return (
    <button
      title={`${name} (more info)`}
      className={`-mx-2 px-2 ${className ?? ''}`}
      onClick={onClick}
    >
      <Icon themed />
    </button>
  );
}

function StarButton({
  experience,
  toggleStar,
}: {
  experience: ExtFlexExp;
  toggleStar: (exp: ExtFlexExp) => void;
}) {
  return (
    <button
      title={`${experience.starred ? 'Remove from' : 'Add to'} Favorites`}
      className="-m-2 p-2 text-gray-300"
      onClick={() => toggleStar(experience)}
    >
      <StarIcon themed={experience.starred} />
    </button>
  );
}

function LightningPickDesc() {
  return (
    <Screen title={LIGHTNING_PICK}>
      <p>
        When an attraction with a long standby wait has a Lightning Lane return
        time in the near future, it's highlighted as a Lightning Pick. Book
        these quick before they're gone!
      </p>
    </Screen>
  );
}

function DropTimeDesc({
  park,
  experience,
  isBookingToday,
}: {
  park: Park;
  experience?: Experience;
  isBookingToday?: boolean;
}) {
  const resort = use(ResortContext);
  const dropTime = upcomingTimes(experience?.dropTimes ?? [])[0];
  const parks = resort.parks
    .filter(p => p.dropTimes.length > 0)
    .sort((a, b) => (a === park ? -1 : b === park ? 1 : 0));
  return (
    <Screen title="Upcoming Drop">
      <p>
        {experience ? <b>{experience.name}</b> : <>This attraction</>} may be
        part of{' '}
        {!isBookingToday ? (
          <>a day-of</>
        ) : dropTime ? (
          <>
            the <Time time={dropTime} className="font-semibold" />
          </>
        ) : (
          <>an upcoming</>
        )}{' '}
        drop of additional Lightning Lane inventory, with earlier return times
        than what's currently being offered. Availability varies but is always
        limited, so be sure you're ready to book when the drop time arrives!
      </p>
      {parks.map(park => {
        const [nextDropTime] = upcomingTimes(park.dropTimes);
        return (
          <div
            className={`mt-5 rounded-sm overflow-hidden ${park.theme.bg}`}
            key={park.id}
          >
            <h2
              className={`mt-0 py-1 ${park.theme.bg} text-white text-base text-center`}
            >
              {park.name}
            </h2>
            <div className="flex flex-col px-2 pb-3 bg-white/90">
              {resort.dropExperiences(park).map(exp => {
                const upcoming = new Set(upcomingTimes(exp.dropTimes ?? []));
                return (
                  <div key={exp.id}>
                    <h3 className="mt-3">{exp.name}</h3>
                    <ul className="flex flex-wrap gap-y-2 mt-1 leading-tight">
                      {exp.dropTimes?.map(time => {
                        const isNextDrop =
                          isBookingToday && time.equals(nextDropTime);
                        return (
                          <li className="min-w-[6em] text-center" key={+time}>
                            <div
                              className={`${isNextDrop ? `${park.theme.text} font-bold` : upcoming.has(time) || !isBookingToday ? 'font-semibold' : 'text-gray-500'}`}
                            >
                              <Time time={time} />
                            </div>
                            {isNextDrop ? (
                              <div
                                className={`rounded-xs ${park.theme.bg} text-white/90 text-xs font-semibold text-center uppercase`}
                              >
                                next
                              </div>
                            ) : null}
                          </li>
                        );
                      })}
                    </ul>
                  </div>
                );
              })}
            </div>
          </div>
        );
      })}
    </Screen>
  );
}

function BookedDesc() {
  return (
    <Screen title={BOOKED}>
      <p>
        You currently have a Lightning Lane reservation for this attraction.
      </p>
    </Screen>
  );
}
