import { createClient } from "@supabase/supabase-js";

const inventoryUrl = process.env.INVENTORY_SUPABASE_URL ?? process.env.SUPABASE_URL;
const inventoryServiceRoleKey =
  process.env.INVENTORY_SUPABASE_SERVICE_ROLE_KEY ?? process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!inventoryUrl || !inventoryServiceRoleKey) {
  throw new Error(
    "INVENTORY_SUPABASE_URL and INVENTORY_SUPABASE_SERVICE_ROLE_KEY are required",
  );
}

export const inventorySupabase = createClient(inventoryUrl, inventoryServiceRoleKey);
