"use client";

// "Tell us more" (PRD v4 Change 4): every field optional; saved on this device only.
import { Icon } from "@/components/icons";
import { BACKGROUNDS, HOUSEHOLDS, INCOME_BANDS, INTERESTS, NEARBY, NEEDS, SCHEDULES, WORKPLACES, type Profile } from "@/game/profile";

type Opt = { id: string; label: string };

function Pills({ label, options, value, onPick, multi }: { label: string; options: readonly Opt[]; value: string | string[] | undefined; onPick: (v: string | undefined) => void; multi?: boolean }) {
  const on = (id: string) => (multi ? (value as string[] | undefined)?.includes(id) : value === id);
  return (
    <div className="field">
      <h3>{label}</h3>
      <div className="row" style={{ gap: 4 }}>
        {options.map((o) => (
          <button key={o.id} type="button" className={`choice ${on(o.id) ? "on" : ""}`} aria-pressed={!!on(o.id)} onClick={() => onPick(on(o.id) && !multi ? undefined : o.id)}>
            {o.label}
          </button>
        ))}
      </div>
    </div>
  );
}

const asOpts = (xs: readonly string[]) => xs.map((x) => ({ id: x, label: x }));
const toggle = (list: string[] | undefined, id: string) => (list?.includes(id) ? list.filter((x) => x !== id) : [...(list ?? []), id]);

export function ProfileForm({ profile, onChange, onClear }: { profile: Profile; onChange: (p: Profile) => void; onClear: () => void }) {
  const set = (patch: Partial<Profile>) => onChange({ ...profile, ...patch });
  return (
    <div className="profile-form">
      <p className="note">
        Optional. Used only to tailor scenes and your commute, and saved on this device. Anonymous scene requests may include your career, schedule,
        household, pets, needs, interests, places you want nearby and the newcomer/first-time flags: never your name, pronouns, languages or background
        details. It never changes prices, landlords, scams or your score.
      </p>

      <h4 className="pixel profile-group">Basics</h4>
      <div className="field">
        <h3>Pronouns</h3>
        <input className="field-input" value={profile.pronouns ?? ""} maxLength={20} placeholder="e.g. she/her, he/him, they/them" onChange={(e) => set({ pronouns: e.target.value || undefined })} aria-label="Pronouns" />
      </div>

      <h4 className="pixel profile-group">Work or study</h4>
      <Pills label="Where you go most days" options={WORKPLACES} value={profile.workplace} onPick={(v) => set({ workplace: v as Profile["workplace"] })} />
      <Pills label="Schedule" options={SCHEDULES} value={profile.schedule} onPick={(v) => set({ schedule: v as Profile["schedule"] })} />

      <h4 className="pixel profile-group">Money</h4>
      <Pills
        label="Income (before tax, per year)"
        options={[...INCOME_BANDS, { id: "typical", label: "Use a typical figure for my career" }]}
        value={profile.income}
        onPick={(v) => set({ income: v as Profile["income"] })}
      />

      <h4 className="pixel profile-group">Household and needs</h4>
      <Pills label="Household" options={HOUSEHOLDS} value={profile.household} onPick={(v) => set({ household: v as Profile["household"] })} />
      <Pills label="Pets" options={[{ id: "yes", label: "I have a pet" }, { id: "no", label: "No pets" }]} value={profile.pets === undefined ? undefined : profile.pets ? "yes" : "no"} onPick={(v) => set({ pets: v === undefined ? undefined : v === "yes" })} />
      <Pills label="Needs" multi options={NEEDS} value={profile.needs} onPick={(v) => v && set({ needs: toggle(profile.needs, v) as Profile["needs"] })} />

      <h4 className="pixel profile-group">Nearby and interests</h4>
      <Pills label="I'd like to be near" multi options={asOpts(NEARBY)} value={profile.nearby} onPick={(v) => v && set({ nearby: toggle(profile.nearby, v) })} />
      <div className="field">
        <input className="field-input" value={profile.nearbyOther ?? ""} maxLength={40} placeholder="Something specific? e.g. a favourite market" onChange={(e) => set({ nearbyOther: e.target.value || undefined })} aria-label="Another place you want nearby" />
      </div>
      <Pills label="Interests" multi options={asOpts(INTERESTS)} value={profile.interests} onPick={(v) => v && set({ interests: toggle(profile.interests, v) })} />

      <h4 className="pixel profile-group">Background and experience</h4>
      <Pills label="Background" options={BACKGROUNDS} value={profile.background} onPick={(v) => set({ background: v as Profile["background"] })} />
      <div className="field">
        <h3>Languages you speak</h3>
        <input className="field-input" value={profile.languages ?? ""} maxLength={40} placeholder="Optional" onChange={(e) => set({ languages: e.target.value || undefined })} aria-label="Languages" />
      </div>
      <Pills
        label="Renting experience"
        options={[
          { id: "first", label: "First time renting" },
          { id: "before", label: "I've rented before" },
        ]}
        value={profile.renting}
        onPick={(v) => set({ renting: v as Profile["renting"] })}
      />

      <button type="button" className="btn ghost small" onClick={onClear}>
        <Icon name="trash" /> Clear my profile
      </button>
    </div>
  );
}
