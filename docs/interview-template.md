---
# Interview metadata (fill before call)
date: YYYY-MM-DD
interviewee_handle: "@handle or name"
channel: call | video | async_dm | email
duration_min: 30

# Q1 gate fields (MUST fill — maps to pain-signal.yml)
team_size: "Solo builder | 2-10 | 11-50 | 50+ | Not on eng team"
agent_daily: "Multiple times a day | Once a day | A few times a week | Occasionally | Not really"
pain_score: 0         # 1-10, integer only
workaround: ""        # one-line summary
buy_signal: "yes | soft_yes | soft_no | no"   # "maybe" counts as no

# Synthesis flags (fill after call)
qualifies_pain: false      # pain_score >= 7
qualifies_segment: false   # team_size == "2-10" AND agent_daily in [Multiple, Once a day]
qualifies_buy: false       # buy_signal == "yes"
notes_for_phase_1: ""      # any feature/insight worth capturing for Phase 1
---

# Interview: {handle} — {date}

## Opening context (1-2 lines)
Who they are, what they're building, why they agreed to this call.

## The pain (verbatim quotes when possible)

> "..."

Concrete scenarios they described (not hypothetical). Include numbers: "매주 2시간", "스프린트마다 3번".

## Current workaround (detailed)

How they cobble together docs + tasks + agent context today. Tools, copy-paste patterns, shared drives, whatever.

## Buy signal — what they said

Did they ask "when can I try it?" Did they offer their email? Did they just nod?
Record the exact words. "Yes if X. No unless Y."

## Adjacent pains / surprises

Things that came up that weren't in the interview guide. Especially things that
surprised you or contradicted assumptions. Gold for Phase 1 scoping.

## Follow-up

- [ ] Send them GitHub link + beta install instructions?
- [ ] Ask for intros to their team?
- [ ] Check back on specific date?

## My synthesis (1-2 lines)

Does this person validate the premise? What's the strongest signal (positive or negative)?
