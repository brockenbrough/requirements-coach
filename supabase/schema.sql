-- Run this in your Supabase SQL editor to create the profile table.

create table if not exists myapp_profile (
  id         uuid primary key references auth.users(id) on delete cascade,
  username   text not null,
  biography  text not null default '',
  avatar_url text
);

-- If myapp_profile already exists from an earlier version, add the avatar_url column:
-- alter table myapp_profile add column if not exists avatar_url text;

-- Create a public storage bucket for avatar images.
-- In the Supabase dashboard: Storage → New bucket → name "avatars" → check "Public bucket".
