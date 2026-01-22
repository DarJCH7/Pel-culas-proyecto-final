import { createClient } from '@supabase/supabase-js'

const supabaseUrl = 'https://xlhcfmmzjejhzoolyyus.supabase.co'
const supabaseKey = 'sb_publishable_2qyfHb7ZdBDSahNHg3RECg_-Mnpwuiw'

export const supabase = createClient(supabaseUrl, supabaseKey)