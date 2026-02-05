import { createClient } from "@supabase/supabase-js";

const worktimeUrl = process.env.SUPABASE_URL!;
const worktimeKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
export const supabase = createClient(worktimeUrl, worktimeKey);

const leaveUrl = process.env.LEAVE_SUPABASE_URL!;
const leaveKey = process.env.LEAVE_SUPABASE_SERVICE_ROLE_KEY!;
export const leaveSupabase = createClient(leaveUrl, leaveKey);
