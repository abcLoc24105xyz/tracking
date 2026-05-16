import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase/admin'

type Params = {
  params: Promise<{ token: string }>
}

const PIXEL_BASE64 =
  'R0lGODlhAQABAPAAAAAAAAAAACH5BAEAAAAALAAAAAABAAEAAAICRAEAOw=='

// Chỉ chiến dịch đang chạy mới nhận tracking
const ACTIVE_CAMPAIGN_STATUS = ['running']

function getPixelBody(): ArrayBuffer {
  const buffer = Buffer.from(PIXEL_BASE64, 'base64')

  return buffer.buffer.slice(
    buffer.byteOffset,
    buffer.byteOffset + buffer.byteLength
  ) as ArrayBuffer
}

function pixelResponse() {
  return new NextResponse(getPixelBody(), {
    status: 200,
    headers: {
      'Content-Type': 'image/gif',
      'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate',
      Pragma: 'no-cache',
      Expires: '0',
    },
  })
}

async function canReceiveTracking(emailId: string) {
  const { data: email, error: emailError } = await supabaseAdmin
    .from('emails')
    .select('id, campaign_id')
    .eq('id', emailId)
    .single()

  console.log('[PIXEL] email data =', email)
  console.log('[PIXEL] email error =', emailError)

  if (emailError || !email?.campaign_id) {
    return false
  }

  const { data: campaign, error: campaignError } = await supabaseAdmin
    .from('campaigns')
    .select('id, status')
    .eq('id', email.campaign_id)
    .single()

  console.log('[PIXEL] campaign data =', campaign)
  console.log('[PIXEL] campaign error =', campaignError)

  if (campaignError || !campaign?.status) {
    return false
  }

  const status = String(campaign.status).trim().toLowerCase()

  return ACTIVE_CAMPAIGN_STATUS.includes(status)
}

export async function GET(req: NextRequest, context: Params) {
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
      return pixelResponse()
    }

    const allowedTracking = await canReceiveTracking(pixel.email_id)

    if (!allowedTracking) {
      console.log('[PIXEL] tracking blocked because campaign is not running')
      return pixelResponse()
    }

    const now = new Date().toISOString()

    const { error: eventError } = await supabaseAdmin
      .from('email_events')
      .insert({
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

    return pixelResponse()
  } catch (error) {
    console.error('[PIXEL] catch error =', error)
    return pixelResponse()
  }
}