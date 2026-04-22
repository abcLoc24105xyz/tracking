import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase/admin'

type Params = {
  params: Promise<{ token: string }>
}

export async function GET(req: NextRequest, context: Params) {
  try {
    const { token } = await context.params
    console.log('[CLICK] token =', token)

    const { data: link, error: linkError } = await supabaseAdmin
      .from('tracking_links')
      .select('email_id, employee_id, original_url')
      .eq('tracking_token', token)
      .single()

    console.log('[CLICK] link data =', link)
    console.log('[CLICK] link error =', linkError)

    if (!link?.original_url) {
      return NextResponse.redirect(new URL('/', req.url))
    }

    const now = new Date().toISOString()

    const { error: eventError } = await supabaseAdmin.from('email_events').insert({
      email_id: link.email_id,
      employee_id: link.employee_id,
      event_type: 'clicked',
      event_time: now,
      ip_address:
        req.headers.get('x-forwarded-for') ||
        req.headers.get('x-real-ip') ||
        null,
      user_agent: req.headers.get('user-agent') || null,
      metadata: {
        original_url: link.original_url,
      },
    })

    console.log('[CLICK] insert event error =', eventError)

    const { data: summary, error: summaryError } = await supabaseAdmin
      .from('email_tracking_summary')
      .select('*')
      .eq('email_id', link.email_id)
      .single()

    console.log('[CLICK] summary data =', summary)
    console.log('[CLICK] summary error =', summaryError)

    if (!summary) {
      const { error: insertSummaryError } = await supabaseAdmin
        .from('email_tracking_summary')
        .insert({
          email_id: link.email_id,
          employee_id: link.employee_id,
          clicked: true,
          first_click_time: now,
          last_click_time: now,
          click_count: 1,
        })

      console.log('[CLICK] insert summary error =', insertSummaryError)
    } else {
      const { error: updateSummaryError } = await supabaseAdmin
        .from('email_tracking_summary')
        .update({
          clicked: true,
          first_click_time: summary.first_click_time || now,
          last_click_time: now,
          click_count: Number(summary.click_count || 0) + 1,
        })
        .eq('email_id', link.email_id)

      console.log('[CLICK] update summary error =', updateSummaryError)
    }

    return NextResponse.redirect(link.original_url)
  } catch (error) {
    console.error('[CLICK] catch error =', error)
    return NextResponse.redirect(new URL('/', req.url))
  }
}