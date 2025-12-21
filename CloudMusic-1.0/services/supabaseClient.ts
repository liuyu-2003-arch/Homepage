import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = 'https://ossrsfyqbrzeauzksvpv.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9zc3JzZnlxYnJ6ZWF1emtzdnB2Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjQxMDgwMDksImV4cCI6MjA3OTY4NDAwOX0.IwEfjxM_wNBf2DXDC9ue8X6ztSOJV2rEN1vrQqv7eqI';

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

export const ADMIN_EMAILS = [
  'jemchmi@gmail.com'
];

export const isUserAdmin = (email: string | undefined | null) => {
  if (!email) return false;
  return ADMIN_EMAILS.includes(email);
};