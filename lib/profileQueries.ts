// Shared by app/api/profile/route.ts and app/api/profile/avatar/route.ts (GitHub #428) — both
// PATCH the "user" row and hand the result straight to the client's setProfile, which replaces
// the whole cached profile rather than merging fields. A select() missing a column here doesn't
// just omit it from one response; it wipes that field from client state until the next login.
//
// selected_title is an embed, not a column: the row stores a title_definition_id, and every
// consumer (the profile page's dropdown, the sidebar under the avatar) needs the name too. Joining
// it here means neither has to make a second call, and a title renamed by its instructor shows up
// renamed everywhere without a backfill.
export const PROFILE_COLUMNS =
  'user_id, username, biography, avatar_url, role, first_name, last_name, age, semester, has_seen_onboarding_tour, selected_title_definition_id, selected_title:title_definition(title_name)';
