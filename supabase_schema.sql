-- 1. Create the user_preferences table
-- This table stores interest keywords and saved papers for each user.
create table public.user_preferences (
  user_id uuid not null references auth.users on delete cascade,
  interest_keywords text[] default '{}',
  saved_papers jsonb default '[]',
  updated_at timestamp with time zone default timezone('utc'::text, now()),
  primary key (user_id)
);

-- 2. Enable Row Level Security (RLS)
-- This limits access so users can only see their own data.
alter table public.user_preferences enable row level security;

-- 3. Create Security Policies
-- Policy: Users can see their own data
create policy "Users can view their own preferences"
  on public.user_preferences for select
  using ( auth.uid() = user_id );

-- Policy: Users can add their own data row
create policy "Users can insert their own preferences"
  on public.user_preferences for insert
  with check ( auth.uid() = user_id );

-- Policy: Users can update their own data
create policy "Users can update their own preferences"
  on public.user_preferences for update
  using ( auth.uid() = user_id );
