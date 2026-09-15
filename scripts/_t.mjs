import { createClient } from '@supabase/supabase-js'
import { config } from 'dotenv'
config({ path: '.env', quiet: true })
const sb = createClient(process.env.VITE_SUPABASE_URL, process.env.VITE_SUPABASE_ANON_KEY)
await sb.auth.signInWithPassword({ email: process.env.QA_USER_1_EMAIL, password: process.env.QA_USER_PASSWORD })
const { data, error } = await sb.from('customers').insert({
  first_name: 'בדיקת', last_name: 'דיפולט', business_unit: 'TRAX', status: 'ליד חדש',
  mobile_phone: '+972549867540',
}).select('id, club_member').single()
console.log('insert without club_member:', error ? 'FAIL: ' + error.message : 'OK, club_member=' + data.club_member)
if (!error) await sb.from('customers').delete().eq('id', data.id)
