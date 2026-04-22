import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase/admin'

type Params = {
  params: Promise<{ token: string }>
}

const PIXEL_BASE64 =
  'R0lGODlhAQABAPAAAAAAAAAAACH5BAEAAAAALAAAAAABAAEAAAICRAEAOw=='

export async function GET(req: NextRequest, context: Params) {
  const buffer = Buffer.from(PIXEL_BASE64, 'base64')

  try {
    const { token } = await context.params
    console.log('[PIXEL] token =', token)

    const { data: pixel, error: pixelError } = await supabaseAdmin
      .from('tracking_pixels')
      .select('email_id, employee_id')
      .eq('pixel_token', token)
      .single()

    console.log('[PIXEL] find pixel data =', pixel)
    console.log('[PIXEL] find pixel error =', pixelError)

    if (!pixel) {
      return new NextResponse(buffer, {
        status: 200,
        headers: {
          'Content-Type': 'image/gif',
          'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate',
          Pragma: 'no-cache',
          Expires: '0',
        },
      })
    }

    const now = new Date().toISOString()

    const { error: eventError } = await supabaseAdmin.from('email_events').insert({
      email_id: pixel.email_id,
      employee_id: pixel.employee_id,
      event_type: 'opened',
      event_time: now,
      ip_address:
        req.headers.get('x-forwarded-for') ||
        req.headers.get('x-real-ip') ||
        null,
      user_agent: req.headers.get('user-agent') || null,
    })

    console.log('[PIXEL] insert event error =', eventError)

    const { data: summary, error: summaryError } = await supabaseAdmin
      .from('email_tracking_summary')
      .select('*')
      .eq('email_id', pixel.email_id)
      .single()

    console.log('[PIXEL] summary data =', summary)
    console.log('[PIXEL] summary error =', summaryError)

    if (!summary) {
      const { error: insertSummaryError } = await supabaseAdmin
        .from('email_tracking_summary')
        .insert({
          email_id: pixel.email_id,
          employee_id: pixel.employee_id,
          opened: true,
          first_open_time: now,
          last_open_time: now,
          open_count: 1,
        })

      console.log('[PIXEL] insert summary error =', insertSummaryError)
    } else {
      const { error: updateSummaryError } = await supabaseAdmin
        .from('email_tracking_summary')
        .update({
          opened: true,
          first_open_time: summary.first_open_time || now,
          last_open_time: now,
          open_count: Number(summary.open_count || 0) + 1,
        })
        .eq('email_id', pixel.email_id)

      console.log('[PIXEL] update summary error =', updateSummaryError)
    }
  } catch (error) {
    console.error('[PIXEL] catch error =', error)
  }

  return new NextResponse(buffer, {
    status: 200,
    headers: {
      'Content-Type': 'image/gif',
      'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate',
      Pragma: 'no-cache',
      Expires: '0',
    },
  })
}